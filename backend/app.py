"""
AI Traffic Management System — Flask Backend
Per-lane video playlist system:
  - Each lane has a playlist of video clips
  - Clips cycle every ~20s
  - Clips tagged 'emergency' or 'high_congestion' trigger AI reactions
  - Frontend can add/remove/reorder clips per lane via API

Run from project root:
    python backend/app.py
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import threading, time, os, cv2, random, json
from ultralytics import YOLO
from werkzeug.utils import secure_filename
from datetime import datetime

app = Flask(__name__)
CORS(app)

# ── Resolve paths relative to project root (one level up from backend/) ───────
ROOT          = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_FOLDER = os.path.join(ROOT, 'backend', 'uploads')
PLAYLIST_FILE = os.path.join(ROOT, 'backend', 'playlists.json')
MODELS_DIR    = os.path.join(ROOT, 'models')
TEST_VIDEOS   = os.path.join(ROOT, 'test_videos')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

DIRECTIONS        = ['north', 'south', 'east', 'west']
LOW_THRESHOLD     = 6
MEDIUM_THRESHOLD  = 14
BASE_GREEN_TIME   = 15
PER_VEHICLE_TIME  = 0.5
MIN_GREEN         = 10
MAX_GREEN         = 45
COOLDOWN_TIME     = 8
CLIP_DURATION     = 20   # seconds each clip plays before advancing

# ── Per-Lane Playlist ─────────────────────────────────────────────────────────
def default_playlists():
    return {
        'north': [
            {'path': os.path.join(TEST_VIDEOS, 'test1.mp4'),          'tag': 'normal',          'label': 'Normal Traffic 1'},
            {'path': os.path.join(TEST_VIDEOS, 'test2.mp4'),          'tag': 'high_congestion', 'label': 'Heavy Traffic'},
        ],
        'south': [
            {'path': os.path.join(TEST_VIDEOS, 'test3.mp4'),          'tag': 'normal',          'label': 'Normal Traffic 1'},
            {'path': os.path.join(TEST_VIDEOS, 'videoplayback (1).mp4'), 'tag': 'normal',       'label': 'Normal Traffic 2'},
        ],
        'east': [
            {'path': os.path.join(TEST_VIDEOS, 'videoplayback (4).mp4'), 'tag': 'normal',       'label': 'Normal Traffic 1'},
            {'path': os.path.join(TEST_VIDEOS, 'test2.mp4'),          'tag': 'high_congestion', 'label': 'Heavy Traffic'},
        ],
        'west': [
            {'path': os.path.join(TEST_VIDEOS, 'videoplayback (1).mp4'), 'tag': 'normal',       'label': 'Normal Traffic 1'},
            {'path': os.path.join(TEST_VIDEOS, 'emergency_demo.mp4'), 'tag': 'emergency',        'label': 'Emergency Vehicle'},
        ],
    }

def load_playlists():
    if os.path.exists(PLAYLIST_FILE):
        try:
            with open(PLAYLIST_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    pl = default_playlists()
    save_playlists(pl)
    return pl

def save_playlists(pl):
    with open(PLAYLIST_FILE, 'w') as f:
        json.dump(pl, f, indent=2)

playlists = load_playlists()

# ── Shared State ──────────────────────────────────────────────────────────────
state_lock = threading.Lock()

shared_state = {
    d: {
        'vehicle_count': 0,
        'density':       'LOW',
        'emergency':     False,
        'confidence':    0.0,
        'active':        False,
        'current_clip':  0,          # index in playlist
        'clip_tag':      'normal',   # tag of current clip
        'clip_label':    '',
        'clip_elapsed':  0,          # seconds into current clip
    }
    for d in DIRECTIONS
}

signal_state = {
    'signals':        {d: 'red' for d in DIRECTIONS},
    'green_lane':     None,
    'emergency_lane': None,
    'cooldown_until': 0,
    'mode':           'auto',
}

# ── AI Models ─────────────────────────────────────────────────────────────────
_traffic_model   = None
_emergency_model = None
_models_lock     = threading.Lock()

def get_traffic_model():
    global _traffic_model
    with _models_lock:
        if _traffic_model is None:
            try:
                _traffic_model = YOLO('yolov8s.pt')
                print('[AI] Traffic model loaded (yolov8s.pt)')
            except Exception as e:
                print(f'[AI] Traffic model failed: {e}')
        return _traffic_model

def get_emergency_model():
    global _emergency_model
    with _models_lock:
        if _emergency_model is None:
            candidates = [
                os.path.join(MODELS_DIR, 'best.pt'),
                os.path.join(ROOT, 'best.pt'),
                os.path.join(ROOT, 'runs', 'detect', 'emergency_detection', 'exp_clean', 'weights', 'best.pt'),
            ]
            for p in candidates:
                if os.path.exists(p):
                    try:
                        _emergency_model = YOLO(p)
                        print(f'[AI] Emergency model loaded: {p}')
                        break
                    except Exception as e:
                        print(f'[AI] Emergency model failed ({p}): {e}')
        return _emergency_model

VEHICLE_CLASSES = {0, 2, 3, 5, 7}

# ── Per-Lane Playlist Processor ───────────────────────────────────────────────
lane_threads = {}

def process_lane(direction):
    """Cycles through the lane's playlist. Each clip plays for CLIP_DURATION seconds."""
    traffic_model   = get_traffic_model()
    emergency_model = get_emergency_model()
    buffer = []
    BUFFER = 8

    while True:
        with state_lock:
            pl = playlists.get(direction, [])
            idx = shared_state[direction]['current_clip']

        if not pl:
            time.sleep(1)
            continue

        idx = idx % len(pl)
        clip = pl[idx]
        path = clip.get('path', '')
        tag  = clip.get('tag', 'normal')
        label = clip.get('label', '')

        # Update state for this clip
        with state_lock:
            shared_state[direction]['current_clip'] = idx
            shared_state[direction]['clip_tag']     = tag
            shared_state[direction]['clip_label']   = label
            shared_state[direction]['clip_elapsed'] = 0

        print(f'[{direction}] Clip {idx}: {label} ({tag}) — {path}')

        if not os.path.exists(path):
            print(f'[{direction}] File not found: {path}, simulating...')
            _simulate_clip(direction, tag, CLIP_DURATION)
            with state_lock:
                shared_state[direction]['current_clip'] = (idx + 1) % max(len(pl), 1)
            continue

        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            print(f'[{direction}] Cannot open: {path}')
            _simulate_clip(direction, tag, CLIP_DURATION)
            with state_lock:
                shared_state[direction]['current_clip'] = (idx + 1) % max(len(pl), 1)
            continue

        clip_start = time.time()
        buffer.clear()

        while True:
            elapsed = time.time() - clip_start

            # Check if playlist changed (new clip added/removed)
            with state_lock:
                new_pl  = playlists.get(direction, [])
                new_idx = shared_state[direction]['current_clip']
                shared_state[direction]['clip_elapsed'] = int(elapsed)

            # Advance to next clip after CLIP_DURATION
            if elapsed >= CLIP_DURATION:
                with state_lock:
                    shared_state[direction]['current_clip'] = (idx + 1) % max(len(new_pl), 1)
                break

            # If clip index was changed externally (user skipped)
            if new_idx != idx:
                break

            ret, frame = cap.read()
            if not ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = cap.read()
                if not ret:
                    break

            frame = cv2.resize(frame, (640, 480))

            # Vehicle detection
            vehicle_count = 0
            if traffic_model:
                try:
                    results = traffic_model(frame, conf=0.25, iou=0.4, verbose=False)[0]
                    for box in results.boxes:
                        if int(box.cls[0]) in VEHICLE_CLASSES:
                            vehicle_count += 1
                except Exception:
                    vehicle_count = _tag_count(tag)
            else:
                vehicle_count = _tag_count(tag)

            buffer.append(vehicle_count)
            if len(buffer) > BUFFER:
                buffer.pop(0)
            smooth = int(sum(buffer) / len(buffer))

            # For high_congestion tag, boost count
            if tag == 'high_congestion':
                smooth = max(smooth, random.randint(16, 26))

            density = ('LOW' if smooth < LOW_THRESHOLD else
                       'MEDIUM' if smooth < MEDIUM_THRESHOLD else 'HIGH')

            # Emergency detection
            emergency   = False
            confidence  = 0.0
            if tag == 'emergency':
                if emergency_model:
                    try:
                        em = emergency_model(frame, conf=0.45, verbose=False)[0]
                        for box in em.boxes:
                            c = float(box.conf[0])
                            if c > 0.45:
                                emergency  = True
                                confidence = max(confidence, c)
                    except Exception:
                        pass
                # Force emergency flag after a few seconds into the clip
                if elapsed > 3:
                    emergency  = True
                    confidence = max(confidence, 0.82)

            with state_lock:
                shared_state[direction]['vehicle_count'] = smooth
                shared_state[direction]['density']       = density
                shared_state[direction]['emergency']     = emergency
                shared_state[direction]['confidence']    = round(confidence, 2)
                shared_state[direction]['active']        = True

            time.sleep(0.08)

        cap.release()

def _tag_count(tag):
    if tag == 'emergency':       return random.randint(12, 20)
    if tag == 'high_congestion': return random.randint(18, 28)
    return random.randint(2, 12)

def _simulate_clip(direction, tag, duration):
    """Simulate data for a clip when video file is missing."""
    start = time.time()
    while time.time() - start < duration:
        count = _tag_count(tag)
        density = ('LOW' if count < LOW_THRESHOLD else
                   'MEDIUM' if count < MEDIUM_THRESHOLD else 'HIGH')
        emergency  = tag == 'emergency' and (time.time() - start) > 3
        confidence = 0.85 if emergency else 0.0
        with state_lock:
            shared_state[direction]['vehicle_count'] = count
            shared_state[direction]['density']       = density
            shared_state[direction]['emergency']     = emergency
            shared_state[direction]['confidence']    = confidence
            shared_state[direction]['active']        = True
        time.sleep(0.5)

def start_lane(direction):
    if direction in lane_threads and lane_threads[direction].is_alive():
        return
    t = threading.Thread(target=process_lane, args=(direction,), daemon=True)
    lane_threads[direction] = t
    t.start()

# ── Traffic Controller ────────────────────────────────────────────────────────
def compute_green_time(vehicle_count):
    t = BASE_GREEN_TIME + vehicle_count * PER_VEHICLE_TIME
    return max(MIN_GREEN, min(MAX_GREEN, int(t)))

def traffic_controller():
    phase_order = ['north', 'east', 'south', 'west']
    phase_index = 0
    phase_end   = time.time() + compute_green_time(0)

    while True:
        now = time.time()
        with state_lock:
            mode = signal_state['mode']
            if mode == 'manual':
                time.sleep(1)
                continue

            # Find emergency lane
            emergency_lane = None
            best_conf = 0.45
            for d in DIRECTIONS:
                if shared_state[d]['emergency'] and shared_state[d]['confidence'] > best_conf:
                    emergency_lane = d
                    best_conf = shared_state[d]['confidence']

            cooldown_active = now < signal_state['cooldown_until']

            if emergency_lane and not cooldown_active:
                signals = {d: 'red' for d in DIRECTIONS}
                signals[emergency_lane] = 'green'
                signal_state['signals']        = signals
                signal_state['emergency_lane'] = emergency_lane
                signal_state['mode']           = 'emergency'
                signal_state['cooldown_until'] = now + COOLDOWN_TIME
                print(f'[Controller] EMERGENCY → {emergency_lane.upper()} GREEN')

            elif signal_state['mode'] == 'emergency' and not cooldown_active:
                signal_state['mode']           = 'auto'
                signal_state['emergency_lane'] = None
                phase_end = now

            elif signal_state['mode'] == 'auto':
                if now >= phase_end:
                    # Pick lane with highest vehicle count (smart scheduling)
                    counts = {d: shared_state[d]['vehicle_count'] for d in DIRECTIONS}
                    # Weighted: current phase order + congestion priority
                    phase_index = (phase_index + 1) % len(phase_order)
                    green_lane  = phase_order[phase_index]

                    # Override with highest congestion lane if significantly higher
                    max_lane  = max(counts, key=counts.get)
                    if counts[max_lane] > counts[green_lane] + 8:
                        green_lane = max_lane

                    count      = shared_state[green_lane]['vehicle_count']
                    green_time = compute_green_time(count)
                    phase_end  = now + green_time

                    signals = {d: 'red' for d in DIRECTIONS}
                    signals[green_lane] = 'green'
                    signal_state['signals']    = signals
                    signal_state['green_lane'] = green_lane
                    print(f'[Controller] → {green_lane.upper()} GREEN ({green_time}s, {count} vehicles)')

        time.sleep(1)

# ── API ───────────────────────────────────────────────────────────────────────
@app.route('/api/signals')
def api_signals():
    with state_lock:
        return jsonify(dict(signal_state['signals']))

@app.route('/api/cameras')
def api_cameras():
    with state_lock:
        data = {}
        for d in DIRECTIONS:
            s = shared_state[d]
            pl = playlists.get(d, [])
            data[d] = {
                'vehicleCount': s['vehicle_count'],
                'density':      s['density'],
                'emergency':    s['emergency'],
                'confidence':   s['confidence'],
                'active':       s['active'],
                'currentClip':  s['current_clip'],
                'clipTag':      s['clip_tag'],
                'clipLabel':    s['clip_label'],
                'clipElapsed':  s['clip_elapsed'],
                'clipTotal':    CLIP_DURATION,
                'playlistLen':  len(pl),
            }
        return jsonify(data)

@app.route('/api/playlists', methods=['GET'])
def api_get_playlists():
    with state_lock:
        return jsonify(playlists)

@app.route('/api/playlists/<direction>', methods=['GET'])
def api_get_lane_playlist(direction):
    if direction not in DIRECTIONS:
        return jsonify({'error': 'Invalid lane'}), 400
    with state_lock:
        pl = playlists.get(direction, [])
        idx = shared_state[direction]['current_clip']
    return jsonify({'playlist': pl, 'currentIndex': idx})

@app.route('/api/playlists/<direction>', methods=['POST'])
def api_add_clip(direction):
    """Add a clip to a lane's playlist."""
    if direction not in DIRECTIONS:
        return jsonify({'error': 'Invalid lane'}), 400

    # Handle file upload
    if 'video' in request.files:
        f = request.files['video']
        tag   = request.form.get('tag', 'normal')
        label = request.form.get('label', f.filename)
        filename  = secure_filename(f.filename)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        save_path = os.path.join(UPLOAD_FOLDER, f'{timestamp}_{filename}')
        f.save(save_path)
        path = save_path
    else:
        data  = request.json or {}
        path  = data.get('path', '')
        tag   = data.get('tag', 'normal')
        label = data.get('label', os.path.basename(path))

    if not path:
        return jsonify({'error': 'No path provided'}), 400

    clip = {'path': path, 'tag': tag, 'label': label}
    with state_lock:
        playlists[direction].append(clip)
        save_playlists(playlists)

    return jsonify({'success': True, 'clip': clip, 'playlist': playlists[direction]})

@app.route('/api/playlists/<direction>/<int:index>', methods=['DELETE'])
def api_remove_clip(direction, index):
    if direction not in DIRECTIONS:
        return jsonify({'error': 'Invalid lane'}), 400
    with state_lock:
        pl = playlists.get(direction, [])
        if 0 <= index < len(pl):
            removed = pl.pop(index)
            # Adjust current index
            cur = shared_state[direction]['current_clip']
            if cur >= len(pl):
                shared_state[direction]['current_clip'] = max(0, len(pl) - 1)
            save_playlists(playlists)
            return jsonify({'success': True, 'removed': removed})
    return jsonify({'error': 'Index out of range'}), 400

@app.route('/api/playlists/<direction>/skip', methods=['POST'])
def api_skip_clip(direction):
    """Skip to next clip immediately."""
    if direction not in DIRECTIONS:
        return jsonify({'error': 'Invalid lane'}), 400
    with state_lock:
        pl  = playlists.get(direction, [])
        cur = shared_state[direction]['current_clip']
        shared_state[direction]['current_clip'] = (cur + 1) % max(len(pl), 1)
    return jsonify({'success': True})

@app.route('/api/playlists/<direction>/goto/<int:index>', methods=['POST'])
def api_goto_clip(direction, index):
    """Jump to a specific clip index."""
    if direction not in DIRECTIONS:
        return jsonify({'error': 'Invalid lane'}), 400
    with state_lock:
        pl = playlists.get(direction, [])
        if 0 <= index < len(pl):
            shared_state[direction]['current_clip'] = index
            return jsonify({'success': True})
    return jsonify({'error': 'Index out of range'}), 400

@app.route('/api/emergency', methods=['POST'])
def api_emergency():
    data   = request.json or {}
    action = data.get('action', 'trigger')
    lane   = data.get('lane')
    with state_lock:
        if action == 'clear':
            signal_state['mode']           = 'auto'
            signal_state['emergency_lane'] = None
            signal_state['cooldown_until'] = 0
            return jsonify({'success': True})
        if action == 'trigger' and lane in DIRECTIONS:
            signals = {d: 'red' for d in DIRECTIONS}
            signals[lane] = 'green'
            signal_state['signals']        = signals
            signal_state['emergency_lane'] = lane
            signal_state['mode']           = 'emergency'
            signal_state['cooldown_until'] = time.time() + COOLDOWN_TIME
            return jsonify({'success': True})
    return jsonify({'error': 'Invalid'}), 400

@app.route('/api/manual', methods=['POST'])
def api_manual():
    data    = request.json or {}
    signals = data.get('signals')
    m       = data.get('mode', 'manual')
    with state_lock:
        if m == 'auto':
            signal_state['mode'] = 'auto'
            return jsonify({'success': True})
        if signals:
            signal_state['mode']    = 'manual'
            signal_state['signals'] = {d: signals.get(d, 'red') for d in DIRECTIONS}
            return jsonify({'success': True})
    return jsonify({'error': 'Invalid'}), 400

@app.route('/api/status')
def api_status():
    with state_lock:
        return jsonify({
            'mode':           signal_state['mode'],
            'green_lane':     signal_state['green_lane'],
            'emergency_lane': signal_state['emergency_lane'],
        })

@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

# ── Start ─────────────────────────────────────────────────────────────────────
def start_background():
    for d in DIRECTIONS:
        start_lane(d)
    threading.Thread(target=traffic_controller, daemon=True).start()
    print('[System] All lanes started')

start_background()

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000, threaded=True)

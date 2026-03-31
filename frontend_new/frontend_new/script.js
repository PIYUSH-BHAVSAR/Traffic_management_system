/* ── Config ── */
const API = 'http://127.0.0.1:5000';
const DIRS = ['north', 'south', 'east', 'west'];
const POLL_MS = 1000;

/* ── State ── */
let prevSignals = { north: null, south: null, east: null, west: null };
let prevEmergency = { north: false, south: false, east: false, west: false };
let prevMode = null;
let greenTimers = { north: 0, south: 0, east: 0, west: 0 };
let timerIntervals = {};
let backendOnline = false;
let lastDecisionCount = 0;

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  log('system', 'Smart Traffic Management System initialized');
  log('info', 'Connecting to backend at ' + API + '...');

  // Set MJPEG stream sources — browser keeps these alive automatically
  DIRS.forEach(dir => {
    const img = document.getElementById('stream-' + dir);
    img.src = API + '/video/' + dir;
    img.onload = () => {
      // First frame received — hide the placeholder overlay
      const overlay = document.getElementById('overlay-' + dir);
      if (overlay) overlay.classList.add('hidden');
    };
    img.onerror = () => {
      // Retry stream after 2s if it drops
      setTimeout(() => { img.src = API + '/video/' + dir + '?t=' + Date.now(); }, 2000);
    };
  });

  startPolling();
});

/* ── Video Upload ── */
async function uploadVideo(direction, input) {
  const file = input.files[0];
  if (!file) return;

  log('info', `Uploading "${file.name}" to ${direction.toUpperCase()} lane...`);

  const formData = new FormData();
  formData.append('video', file);

  try {
    const res = await fetch(`${API}/api/upload/${direction}`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (data.success) {
      log('green', `✓ Uploaded "${file.name}" to ${direction.toUpperCase()} — YOLO processing started`);
      // Hide overlay
      const overlay = document.getElementById('overlay-' + direction);
      overlay.classList.add('hidden');
      // Stream will automatically show processed frames
    } else {
      log('warn', `Upload failed for ${direction}: ${data.error}`);
    }
  } catch (e) {
    log('emergency', `Upload error for ${direction}: ${e.message}`);
  }
  input.value = '';
}

/* ── Polling ── */
function startPolling() {
  pollAll();
  setInterval(pollAll, POLL_MS);
}

async function pollAll() {
  try {
    const [camRes, sigRes, statusRes, decRes] = await Promise.all([
      fetch(`${API}/api/cameras`),
      fetch(`${API}/api/signals`),
      fetch(`${API}/api/status`),
      fetch(`${API}/api/decisions`),
    ]);
    const cameras   = await camRes.json();
    const signals   = await sigRes.json();
    const status    = await statusRes.json();
    const decisions = await decRes.json();

    if (!backendOnline) {
      backendOnline = true;
      setBackendStatus(true);
      log('green', '✓ Connected to backend');
    }

    updateCameras(cameras);
    updateSignals(signals, cameras);
    updateStatus(status);
    updateDecisions(decisions);
  } catch (e) {
    if (backendOnline) {
      backendOnline = false;
      setBackendStatus(false);
      log('emergency', '✗ Lost connection to backend');
    }
  }
}

/* ── Backend Status ── */
function setBackendStatus(online) {
  const el = document.getElementById('backendStatus');
  if (online) {
    el.textContent = '● Connected';
    el.classList.remove('offline');
  } else {
    el.textContent = '● Offline';
    el.classList.add('offline');
  }
}

/* ── Update Cameras ── */
function updateCameras(cameras) {
  DIRS.forEach(dir => {
    const d = cameras[dir];
    if (!d) return;

    // Vehicle count
    document.getElementById('vc-' + dir).textContent = d.vehicleCount + ' vehicles';

    // Density badge
    const densityEl = document.getElementById('density-' + dir);
    densityEl.textContent = d.density;
    densityEl.className = 'cam-density ' + d.density;

    // Emergency badge
    const emgEl = document.getElementById('emg-' + dir);
    const card   = document.getElementById('cam-' + dir);
    if (d.emergency) {
      emgEl.classList.remove('hidden');
      card.classList.add('emergency-active');
      card.classList.remove('green-active');
      if (!prevEmergency[dir]) {
        log('emergency', `🚨 Emergency vehicle detected in ${dir.toUpperCase()} lane! (conf: ${(d.confidence * 100).toFixed(0)}%)`);
      }
    } else {
      emgEl.classList.add('hidden');
      card.classList.remove('emergency-active');
    }
    prevEmergency[dir] = d.emergency;

    // Show/hide overlay — hide once stream is delivering frames
    const overlay = document.getElementById('overlay-' + dir);
    if (d.active) {
      overlay.classList.add('hidden');
    }
  });
}

/* ── Update Signals ── */
function updateSignals(signals, cameras) {
  DIRS.forEach(dir => {
    const color = signals[dir] || 'red';
    const prev  = prevSignals[dir];

    // Signal box lights
    ['red', 'yellow', 'green'].forEach(c => {
      const el = document.getElementById(`sig-${dir}-${c}`);
      if (el) el.classList.toggle('active', c === color);
    });

    // Direction dot on camera card
    const dot = document.querySelector(`#cam-${dir} .dir-dot`);
    if (dot) {
      dot.className = 'dir-dot dot-' + color;
    }

    // Junction arm highlight
    const arm = document.getElementById('arm-' + dir);
    if (arm) {
      arm.classList.toggle('green-active', color === 'green');
      arm.classList.remove('emergency-active');
    }

    // Camera card green highlight
    const card = document.getElementById('cam-' + dir);
    if (card && !card.classList.contains('emergency-active')) {
      card.classList.toggle('green-active', color === 'green');
    }

    // Signal dashboard card
    const scard = document.getElementById('scard-' + dir);
    const lightEl = document.getElementById('scard-light-' + dir);
    const stateEl = document.getElementById('scard-state-' + dir);

    if (scard) {
      scard.classList.toggle('green-active', color === 'green');
      scard.classList.toggle('red-active', color === 'red');
    }
    if (lightEl) {
      lightEl.textContent = color === 'green' ? '🟢' : color === 'yellow' ? '🟡' : '🔴';
    }
    if (stateEl) {
      stateEl.textContent = color.toUpperCase();
      stateEl.className = 'scard-state ' + color;
    }

    // Vehicle count & density in dashboard
    if (cameras && cameras[dir]) {
      document.getElementById('scard-vc-' + dir).textContent = cameras[dir].vehicleCount + ' vehicles';
      const dp = document.getElementById('scard-dp-' + dir);
      dp.textContent = cameras[dir].density;
      dp.className = 'scard-density-pill ' + cameras[dir].density;

      // Lane density bar in junction
      const fill = Math.min(100, (cameras[dir].vehicleCount / 30) * 100);
      const fillColor = cameras[dir].density === 'HIGH' ? '#ff3b5c' :
                        cameras[dir].density === 'MEDIUM' ? '#ffd700' : '#00ff88';
      const ldb = document.getElementById('ldb-' + dir);
      if (ldb) {
        ldb.style.width = fill + '%';
        ldb.style.height = fill + '%';
        ldb.style.background = fillColor;
      }
      document.getElementById('lc-' + dir) && (document.getElementById('lc-' + dir).textContent = cameras[dir].vehicleCount);
    }

    // Log signal changes
    if (prev !== null && prev !== color) {
      if (color === 'green') {
        log('green', `🟢 Signal → GREEN for ${dir.toUpperCase()} (${cameras?.[dir]?.vehicleCount || 0} vehicles)`);
        startGreenTimer(dir, cameras?.[dir]?.vehicleCount || 0);
      } else if (color === 'red' && prev === 'green') {
        log('warn', `🔴 Signal → RED for ${dir.toUpperCase()}`);
        stopTimer(dir);
      }
    }

    prevSignals[dir] = color;
  });
}

/* ── Green Timer ── */
function startGreenTimer(dir, vehicleCount) {
  stopTimer(dir);
  const base = 15;
  const perV = 0.5;
  let seconds = Math.max(10, Math.min(45, Math.round(base + vehicleCount * perV)));
  greenTimers[dir] = seconds;
  updateTimerDisplay(dir, seconds);

  timerIntervals[dir] = setInterval(() => {
    greenTimers[dir]--;
    updateTimerDisplay(dir, greenTimers[dir]);
    if (greenTimers[dir] <= 0) stopTimer(dir);
  }, 1000);
}

function stopTimer(dir) {
  if (timerIntervals[dir]) {
    clearInterval(timerIntervals[dir]);
    timerIntervals[dir] = null;
  }
  updateTimerDisplay(dir, null);
}

function updateTimerDisplay(dir, seconds) {
  const el = document.getElementById('scard-timer-' + dir);
  if (!el) return;
  el.textContent = seconds !== null && seconds > 0 ? seconds + 's' : '—';
}

/* ── Update Status ── */
function updateStatus(status) {
  const modeBadge = document.getElementById('modeBadge');
  const jMode     = document.getElementById('junctionMode');
  const mode      = status.mode || 'auto';

  if (mode !== prevMode) {
    if (mode === 'emergency') {
      modeBadge.textContent = '🚨 EMERGENCY';
      modeBadge.className = 'mode-badge emergency';
      jMode.textContent = 'EMERGENCY MODE';
      jMode.className = 'junction-mode emergency';
      log('emergency', `🚨 EMERGENCY MODE activated — ${(status.emergency_lane || '').toUpperCase()} has priority`);

      // Highlight emergency arm
      DIRS.forEach(d => {
        const arm = document.getElementById('arm-' + d);
        if (arm) arm.classList.toggle('emergency-active', d === status.emergency_lane);
      });
      const eCard = document.getElementById('scard-' + status.emergency_lane);
      if (eCard) eCard.classList.add('emergency-active');
    } else if (mode === 'manual') {
      modeBadge.textContent = 'MANUAL';
      modeBadge.className = 'mode-badge';
      modeBadge.style.color = 'var(--yellow)';
      modeBadge.style.borderColor = 'var(--yellow)';
      jMode.textContent = 'MANUAL MODE';
      jMode.className = 'junction-mode';
      log('warn', 'System switched to MANUAL mode');
    } else {
      modeBadge.textContent = 'AUTO';
      modeBadge.className = 'mode-badge';
      modeBadge.style.color = '';
      modeBadge.style.borderColor = '';
      jMode.textContent = 'AUTO MODE';
      jMode.className = 'junction-mode';
      if (prevMode === 'emergency') log('green', '✓ Emergency cleared — returning to AUTO mode');
    }
    prevMode = mode;
  }
}

/* ── Terminal ── */
function log(type, msg) {
  const body = document.getElementById('terminalBody');
  if (!body) return;

  const now = new Date();
  const time = now.toTimeString().slice(0, 8);

  const line = document.createElement('div');
  line.className = 'log-line log-' + type;
  line.innerHTML = `<span class="log-time">[${time}]</span><span class="log-msg">${msg}</span>`;
  body.appendChild(line);

  // Keep max 200 lines
  while (body.children.length > 200) body.removeChild(body.firstChild);

  // Auto-scroll
  body.scrollTop = body.scrollHeight;
}

function clearTerminal() {
  const body = document.getElementById('terminalBody');
  if (body) body.innerHTML = '';
  log('system', 'Terminal cleared');
}

/* ── Decisions from backend ── */
function updateDecisions(decisions) {
  if (!decisions || decisions.length === lastDecisionCount) return;
  // Only log new entries since last poll
  const newEntries = decisions.slice(lastDecisionCount);
  lastDecisionCount = decisions.length;
  newEntries.forEach(d => {
    const type = d.level === 'emergency' ? 'emergency'
               : d.level === 'green'     ? 'green'
               : d.level === 'warn'      ? 'warn'
               : 'info';
    log(type, d.msg);
  });
}

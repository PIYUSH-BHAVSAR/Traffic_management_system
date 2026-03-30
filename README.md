# 🚦 AI Traffic Management System

Real-time AI-powered traffic signal controller with emergency vehicle detection, dynamic signal timing, and a live Electron dashboard.

---

## 📁 Project Structure

```
ai-traffic-management/
│
├── backend/                    # Flask API server (AI + signal controller)
│   ├── app.py                  # Main backend — run this to start the system
│   ├── playlists.json          # Auto-generated: per-lane video playlists (runtime)
│   └── uploads/                # Auto-created: user-uploaded videos
│
├── frontend/                   # Electron dashboard
│   ├── main.js                 # Electron main process
│   ├── preload.js              # Electron preload bridge
│   ├── package.json            # Node dependencies
│   └── src/
│       ├── index.html          # Dashboard UI
│       ├── renderer.js         # Frontend logic + API calls
│       └── style.css           # Dark theme styles
│
├── data_processing/            # Standalone AI scripts (testing/debugging)
│   ├── congestion_monitor.py   # Run YOLO vehicle detection on a single video
│   ├── emergency_detector.py   # Run emergency vehicle detection on a video
│   └── extract_frames.py       # Extract frames from videos for annotation
│
├── training/                   # Model training pipeline
│   ├── train.py                # Main training script (YOLOv8 fine-tuning)
│   ├── data.yaml               # YOLO dataset config
│   └── dataset_tools/
│       ├── build_dataset.py    # Split annotated data into train/val
│       ├── fix_dataset.py      # Fix/clamp YOLO label coordinates
│       ├── sync_annotated.py   # Sync annotated images to clean output
│       ├── create_empty_labels.py  # Create empty labels for negative samples
│       └── seedata.py          # Visualize dataset annotations
│
├── models/
│   └── best.pt                 # ✅ Trained emergency vehicle detection model
│
├── test_videos/                # Place your test .mp4 files here
│   └── .gitkeep
│
├── tools/
│   └── testyolo.py             # Quick YOLO test script on any video
│
├── requirements.txt            # Python dependencies
└── README.md
```

---

## 🚀 Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/ai-traffic-management.git
cd ai-traffic-management
```

### 2. Set up Python environment

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Add test videos

Place `.mp4` files in `test_videos/`. The system expects:

| File | Purpose |
|------|---------|
| `test1.mp4` | Normal traffic — North lane |
| `test2.mp4` | Heavy traffic — congestion demo |
| `test3.mp4` | Normal traffic — South lane |
| `videoplayback (1).mp4` | Normal traffic — West lane |
| `videoplayback (4).mp4` | Normal traffic — East lane |
| `emergency_demo.mp4` | 🚨 Emergency vehicle clip |

> You can also drag & drop any video directly onto a camera feed in the dashboard.

### 4. Start the backend

```bash
python backend/app.py
```

Backend runs on `http://localhost:5000`

### 5. Start the frontend

```bash
cd frontend
npm install
npm start
```

---

## 🧠 How It Works

```
Videos → AI Processing → Traffic Controller → Flask API → Electron Dashboard
```

### AI Layer
- **Vehicle Detection**: YOLOv8s (COCO pretrained) — counts vehicles per lane
- **Emergency Detection**: Custom trained YOLOv8 (`models/best.pt`) — detects ambulances, fire trucks

### Per-Lane Playlist System
Each lane (North/South/East/West) has a playlist of video clips. Each clip is tagged:
- 🟢 `normal` — regular traffic, balanced signal timing
- 🟡 `high_congestion` — boosts vehicle count, AI gives longer green time
- 🔴 `emergency` — triggers immediate signal override, that lane gets GREEN

Clips cycle every 20 seconds. You can drag & drop videos directly onto camera feeds in the dashboard.

### Traffic Controller Logic
```
IF emergency detected:
    → Give GREEN to emergency lane immediately
    → All others RED
    → 8-second cooldown after clearing

ELSE:
    → Round-robin through lanes
    → Override to highest congestion lane if count difference > 8
    → Green time = 15s + (vehicle_count × 0.5s), capped 10–45s
```

---

## 🖥️ Dashboard Features

| Feature | Description |
|---------|-------------|
| 4 Camera Feeds | Live canvas visualization with vehicle count + density |
| Drag & Drop | Drop any video onto a camera feed to add it to that lane's playlist |
| Playlist Manager | Add/remove/reorder clips per lane, tag as normal/congestion/emergency |
| Intersection View | Live signal diagram with road density fills and animated vehicles |
| Signal Cards | Per-lane status with countdown timer |
| AI Panel | Current mode, green lane, emergency status, total vehicle count |
| Manual Override | Take control of any signal manually |
| Emergency Button | Force all-red or trigger emergency for any lane |
| Event Log | Real-time system events |

---

## 🏋️ Training Your Own Model

### Step 1: Extract frames from videos

```bash
# Edit extract_frames.py to point to your videos
python data_processing/extract_frames.py
# Frames saved to extracted_frames/
```

### Step 2: Annotate

Upload frames to [Roboflow](https://roboflow.com) or [Label Studio](https://labelstud.io).
Annotate emergency vehicles (ambulance, fire truck, police).
Export in **YOLO format**.

### Step 3: Prepare dataset

```bash
# After annotation, sync to clean output
python training/dataset_tools/sync_annotated.py

# Fix any label coordinate issues
python training/dataset_tools/fix_dataset.py

# Build train/val split
python training/dataset_tools/build_dataset.py
```

### Step 4: Train

```bash
python training/train.py
```

Training config (edit in `train.py`):
- Base model: `yolov8s.pt`
- Epochs: `100`
- Image size: `640`
- Val split: `15%`

Best weights saved to `runs/detect/emergency_vehicle_detector/train/weights/best.pt`

Copy to `models/best.pt` to use in the system.

---

## 🔌 API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/signals` | GET | Current signal state for all 4 lanes |
| `/api/cameras` | GET | Vehicle count, density, emergency, clip info per lane |
| `/api/playlists` | GET | All lane playlists |
| `/api/playlists/<lane>` | GET | Single lane playlist |
| `/api/playlists/<lane>` | POST | Add clip (file upload or path) |
| `/api/playlists/<lane>/<index>` | DELETE | Remove clip |
| `/api/playlists/<lane>/goto/<index>` | POST | Jump to clip immediately |
| `/api/playlists/<lane>/skip` | POST | Skip to next clip |
| `/api/emergency` | POST | Trigger or clear emergency override |
| `/api/manual` | POST | Set manual signal states |
| `/api/status` | GET | Controller mode and active lanes |

---

## 📦 Model Info

`models/best.pt` — Custom YOLOv8 trained to detect:
- Ambulances
- Fire trucks
- Emergency vehicles (Indian road context)

**Training data**: ~340 annotated images (ambulance photos + video frames)
**Architecture**: YOLOv8s (small, fast, GPU-accelerated)
**Hardware used**: NVIDIA RTX 3050 6GB

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| AI / CV | YOLOv8 (Ultralytics), OpenCV |
| Backend | Python, Flask, Flask-CORS |
| Frontend | Electron, HTML/CSS/JS (vanilla) |
| Deep Learning | PyTorch (CUDA) |

---

## ⚙️ System Requirements

- Python 3.10+
- Node.js 18+
- NVIDIA GPU recommended (CUDA 12.x) — CPU fallback works but slower
- 8GB RAM minimum

---

## 📝 Commands Reference

```bash
# Install Python deps
pip install -r requirements.txt

# Start backend
python backend/app.py

# Install frontend deps
cd frontend && npm install

# Start frontend (Electron)
cd frontend && npm start

# Test YOLO on a video
python tools/testyolo.py

# Test emergency detection only
python data_processing/emergency_detector.py

# Test congestion monitor only
python data_processing/congestion_monitor.py

# Extract frames for annotation
python data_processing/extract_frames.py

# Train model
python training/train.py

# Visualize dataset labels
python training/dataset_tools/seedata.py
```

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit: `git commit -m 'Add my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

MIT License — free to use, modify, and distribute.

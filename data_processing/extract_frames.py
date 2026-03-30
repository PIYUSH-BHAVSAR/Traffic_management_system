import cv2
import os

# ── Config ─────────────────────────────────────────────────────────────────────
# Add your video paths here — can be full paths or relative paths
VIDEO_PATHS = [
    r"D:\projects\Techguru\Fire_Truck_Stuck_in_Traffic_Signal_chennai_fireengine_fireservice_firetruck_720P.mp4",       # replace with your video paths
    
]

OUTPUT_DIR    = "extracted_frames"   # frames saved here for annotation
FRAME_EVERY   = 15                   # extract 1 frame every N frames (~2/sec at 30fps)
MAX_PER_VIDEO = 100                  # cap per video
IMG_SIZE      = (640, 640)           # resize for consistency

os.makedirs(OUTPUT_DIR, exist_ok=True)

videos = VIDEO_PATHS
print(f"Processing {len(videos)} videos")

total_saved = 0

for video_path in videos:
    if not os.path.exists(video_path):
        print(f"  ⚠ File not found: {video_path}, skipping")
        continue

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"  ⚠ Cannot open {video_path}, skipping")
        continue

    base = os.path.splitext(os.path.basename(video_path))[0]
    frame_idx = 0
    saved     = 0

    while saved < MAX_PER_VIDEO:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % FRAME_EVERY == 0:
            frame = cv2.resize(frame, IMG_SIZE)
            out_name = f"{base}_f{frame_idx:05d}.jpg"
            cv2.imwrite(os.path.join(OUTPUT_DIR, out_name), frame)
            saved += 1
        frame_idx += 1

    cap.release()
    print(f"  {video_path} → {saved} frames")
    total_saved += saved

print(f"\n✅ Total frames extracted: {total_saved}")
print(f"Now upload images from '{OUTPUT_DIR}/' into the annotation tool and annotate emergency vehicles.")

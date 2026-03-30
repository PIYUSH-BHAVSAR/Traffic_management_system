import cv2
import os
import time
from ultralytics import YOLO

ROOT         = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIDEO_SOURCE = os.path.join(ROOT, 'test_videos', 'test1.mp4')

model = YOLO("yolov8s.pt")
VEHICLE_CLASSES = {0: "bike_rider", 2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}
LOW_THRESHOLD, MEDIUM_THRESHOLD = 10, 25

cap = cv2.VideoCapture(VIDEO_SOURCE)
if not cap.isOpened():
    raise RuntimeError(f"Cannot open: {VIDEO_SOURCE}")

total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
frame_count, prev_time, buffer = 0, time.time(), []

while True:
    ret, frame = cap.read()
    if not ret:
        break
    frame_count += 1
    frame = cv2.resize(frame, (800, 600))
    results = model(frame, conf=0.25, iou=0.4, verbose=False)[0]
    vehicle_count = sum(1 for box in results.boxes if int(box.cls[0]) in VEHICLE_CLASSES)
    buffer.append(vehicle_count)
    if len(buffer) > 10: buffer.pop(0)
    smooth = int(sum(buffer) / len(buffer))
    status, color = (("LOW",(0,255,0)) if smooth < LOW_THRESHOLD else
                     ("MEDIUM",(0,255,255)) if smooth < MEDIUM_THRESHOLD else ("HIGH",(0,0,255)))
    fps = 1 / max(time.time() - prev_time, 1e-6); prev_time = time.time()
    progress = (frame_count / total_frames * 100) if total_frames > 0 else 0
    cv2.putText(frame, f"Vehicles: {smooth}",      (20,40),  cv2.FONT_HERSHEY_SIMPLEX, 1,   (255,255,255), 3)
    cv2.putText(frame, f"Congestion: {status}",    (20,80),  cv2.FONT_HERSHEY_SIMPLEX, 1,   color,         3)
    cv2.putText(frame, f"FPS: {int(fps)}",         (20,120), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255,255,0),   2)
    cv2.putText(frame, f"Progress: {progress:.1f}%",(20,160),cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255,0,255),   2)
    print(f"[{progress:.1f}%] Vehicles: {smooth} | {status} | FPS: {int(fps)}")
    cv2.imshow("Congestion Monitor", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()

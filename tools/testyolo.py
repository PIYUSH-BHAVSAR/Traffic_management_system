import cv2
import time
from ultralytics import YOLO

# Load better model (improves bike detection)
model = YOLO("yolov8s.pt")

# Vehicle classes + person (fallback for bikes)
vehicle_classes = [2, 3, 5, 7, 0]  
# 0=person, 2=car, 3=motorcycle, 5=bus, 7=truck

# Video path
video_path = r"D:\projects\Techguru\test3.mp4"
cap = cv2.VideoCapture(video_path)

if not cap.isOpened():
    print("Error: Could not open video.")
    exit()

total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

frame_count = 0
prev_time = time.time()

# Buffer for smoothing
buffer = []
buffer_size = 10

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame_count += 1

    # Increase resolution for better small object detection
    frame = cv2.resize(frame, (800, 600))

    # Run detection (lower conf improves bike detection)
    results = model(frame, conf=0.25, iou=0.4)[0]

    vehicle_count = 0

    for box in results.boxes:
        cls = int(box.cls[0])
        conf = float(box.conf[0])

        if cls in vehicle_classes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])

            # ---- CLASS HANDLING ----
            if cls == 0:
                label = "bike_rider"   # fallback
            else:
                label = model.names[cls]

            vehicle_count += 1

            # Draw box
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

            # Show label + confidence
            cv2.putText(frame, f"{label} {conf:.2f}",
                        (x1, y1 - 10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5, (0, 255, 0), 2)

    # ---- BUFFER SMOOTHING ----
    buffer.append(vehicle_count)
    if len(buffer) > buffer_size:
        buffer.pop(0)

    smooth_count = int(sum(buffer) / len(buffer))

    # ---- FPS ----
    curr_time = time.time()
    fps = 1 / (curr_time - prev_time)
    prev_time = curr_time

    # ---- PROGRESS ----
    progress = (frame_count / total_frames) * 100

    # ---- CONGESTION LEVEL ----
    if smooth_count < 10:
        status = "LOW"
        color = (0, 255, 0)
    elif smooth_count < 25:
        status = "MEDIUM"
        color = (0, 255, 255)
    else:
        status = "HIGH"
        color = (0, 0, 255)

    # ---- DISPLAY ----
    cv2.putText(frame, f"Vehicles: {smooth_count}",
                (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 3)

    cv2.putText(frame, f"Congestion: {status}",
                (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 3)

    cv2.putText(frame, f"FPS: {int(fps)}",
                (20, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 0), 2)

    cv2.putText(frame, f"Progress: {progress:.1f}%",
                (20, 160), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 0, 255), 2)

    print(f"[{progress:.1f}%] Vehicles: {smooth_count} | {status} | FPS: {int(fps)}")

    # Show output
    cv2.imshow("Smart Traffic Detection", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
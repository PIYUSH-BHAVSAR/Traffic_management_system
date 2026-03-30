import os
import cv2

# Paths
IMG_PATH = "dataset/images/train"
LBL_PATH = "dataset/labels/train"

def visualize():
    for file in os.listdir(IMG_PATH):
        if not file.endswith(".jpg"):
            continue

        img_file = os.path.join(IMG_PATH, file)
        lbl_file = os.path.join(LBL_PATH, file.replace(".jpg", ".txt"))

        if not os.path.exists(lbl_file):
            continue

        img = cv2.imread(img_file)
        h, w, _ = img.shape

        with open(lbl_file, "r") as f:
            lines = f.readlines()

        for line in lines:
            cls, x, y, bw, bh = map(float, line.strip().split())

            # Convert YOLO → pixel coordinates
            x1 = int((x - bw / 2) * w)
            y1 = int((y - bh / 2) * h)
            x2 = int((x + bw / 2) * w)
            y2 = int((y + bh / 2) * h)

            # Draw box
            cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(img, "Emergency", (x1, y1 - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

        cv2.imshow("Check Labels", img)

        key = cv2.waitKey(0)  # Press key to move next

        if key == 27:  # ESC to exit
            break

    cv2.destroyAllWindows()


visualize()
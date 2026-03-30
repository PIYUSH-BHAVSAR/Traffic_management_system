import os
import shutil
import random
import yaml
from ultralytics import YOLO

# ── Config ─────────────────────────────────────────────────────────────────────
OUTPUT_DIR   = "output"
LABELS_SRC   = os.path.join(OUTPUT_DIR, "labels")
DATASET_DIR  = "dataset"
YAML_PATH    = "data.yaml"
VAL_SPLIT    = 0.15     # keep more for training with small dataset
EPOCHS       = 100
IMG_SIZE     = 640
BASE_MODEL   = "yolov8s.pt"   # bigger model = better accuracy
PROJECT_NAME = "emergency_vehicle_detector"
IMG_EXTS     = {".jpg", ".jpeg", ".png"}

def prepare_dataset():
    pairs = []
    for fname in os.listdir(OUTPUT_DIR):
        name, ext = os.path.splitext(fname)
        if ext.lower() not in IMG_EXTS:
            continue
        label_path = os.path.join(LABELS_SRC, name + ".txt")
        if os.path.exists(label_path):
            pairs.append((os.path.join(OUTPUT_DIR, fname), label_path))

    if not pairs:
        raise RuntimeError("No matched image-label pairs found in output/")

    print(f"Found {len(pairs)} labelled images.")

    random.seed(42)
    random.shuffle(pairs)
    split_idx   = max(1, int(len(pairs) * (1 - VAL_SPLIT)))
    train_pairs = pairs[:split_idx]
    val_pairs   = pairs[split_idx:]
    print(f"Train: {len(train_pairs)}  |  Val: {len(val_pairs)}")

    for split in ("train", "val"):
        os.makedirs(os.path.join(DATASET_DIR, "images", split), exist_ok=True)
        os.makedirs(os.path.join(DATASET_DIR, "labels", split), exist_ok=True)

    for img_src, lbl_src in train_pairs:
        shutil.copy(img_src, os.path.join(DATASET_DIR, "images", "train", os.path.basename(img_src)))
        shutil.copy(lbl_src, os.path.join(DATASET_DIR, "labels", "train", os.path.basename(lbl_src)))

    for img_src, lbl_src in val_pairs:
        shutil.copy(img_src, os.path.join(DATASET_DIR, "images", "val", os.path.basename(img_src)))
        shutil.copy(lbl_src, os.path.join(DATASET_DIR, "labels", "val", os.path.basename(lbl_src)))

    data_yaml = {
        "path":  os.path.abspath(DATASET_DIR),
        "train": "images/train",
        "val":   "images/val",
        "nc":    1,
        "names": ["emergency_vehicle"]
    }
    with open(YAML_PATH, "w") as f:
        yaml.dump(data_yaml, f, default_flow_style=False)
    print(f"data.yaml written → {YAML_PATH}")


def train():
    model = YOLO(BASE_MODEL)
    model.train(
        data     = YAML_PATH,
        epochs   = EPOCHS,
        imgsz    = IMG_SIZE,
        project  = PROJECT_NAME,
        name     = "train",
        exist_ok = True,
        patience = 15,
        batch    = -1,
        augment  = True,
        workers  = 0,        # avoids Windows multiprocessing issues
    )
    print("\n✅ Training complete.")
    print(f"Best weights → {PROJECT_NAME}/train/weights/best.pt")


if __name__ == '__main__':
    prepare_dataset()
    train()

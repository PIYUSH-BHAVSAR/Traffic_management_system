import os
import shutil
import random

SRC_IMGS   = "output_clean/images"
SRC_LBLS   = "output_clean/labels"
DATASET    = "dataset"
VAL_SPLIT  = 0.15
IMG_EXTS   = {".jpg", ".jpeg", ".png"}

# Create folders
for split in ("train", "val"):
    os.makedirs(os.path.join(DATASET, "images", split), exist_ok=True)
    os.makedirs(os.path.join(DATASET, "labels", split), exist_ok=True)

# Match image-label pairs
pairs = []
for fname in os.listdir(SRC_IMGS):
    name, ext = os.path.splitext(fname)
    if ext.lower() not in IMG_EXTS:
        continue
    lbl = os.path.join(SRC_LBLS, name + ".txt")
    if os.path.exists(lbl):
        pairs.append((os.path.join(SRC_IMGS, fname), lbl))
    else:
        print(f"⚠ No label for {fname}, skipping")

random.seed(42)
random.shuffle(pairs)

split_idx   = max(1, int(len(pairs) * (1 - VAL_SPLIT)))
train_pairs = pairs[:split_idx]
val_pairs   = pairs[split_idx:]

for img, lbl in train_pairs:
    shutil.copy(img, os.path.join(DATASET, "images", "train", os.path.basename(img)))
    shutil.copy(lbl, os.path.join(DATASET, "labels", "train", os.path.basename(lbl)))

for img, lbl in val_pairs:
    shutil.copy(img, os.path.join(DATASET, "images", "val", os.path.basename(img)))
    shutil.copy(lbl, os.path.join(DATASET, "labels", "val", os.path.basename(lbl)))

print(f"✅ Total: {len(pairs)} pairs → Train: {len(train_pairs)} | Val: {len(val_pairs)}")

import os
import shutil

FRAMES_DIR  = "extracted_frames"
OUTPUT_DIR  = "output"
LABELS_DIR  = os.path.join(OUTPUT_DIR, "labels")
IMG_EXTS    = {".jpg", ".jpeg", ".png"}

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(LABELS_DIR, exist_ok=True)

# Build set of original base names already in output/
# app.py saves as "20260330_153647_originalname.jpg" — strip the 16-char timestamp prefix
existing_originals = set()
for fname in os.listdir(OUTPUT_DIR):
    name, ext = os.path.splitext(fname)
    if ext.lower() not in IMG_EXTS:
        continue
    if len(name) > 16 and name[8] == '_' and name[15] == '_':
        existing_originals.add(name[16:])  # e.g. "arj_f00030"

count = 0
skipped = 0

for fname in os.listdir(FRAMES_DIR):
    name, ext = os.path.splitext(fname)
    if ext.lower() not in IMG_EXTS:
        continue

    # Skip if this frame was already uploaded via annotation tool
    if name in existing_originals:
        skipped += 1
        continue

    # Skip if label already exists
    dst_lbl = os.path.join(LABELS_DIR, name + ".txt")
    if os.path.exists(dst_lbl):
        skipped += 1
        continue

    shutil.copy(os.path.join(FRAMES_DIR, fname), os.path.join(OUTPUT_DIR, fname))
    open(dst_lbl, 'w').close()
    count += 1

print(f"✅ Added {count} negative frames to output/")
print(f"⏭ Skipped {skipped} (already annotated or duplicate)")

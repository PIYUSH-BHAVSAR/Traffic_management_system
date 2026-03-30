import os
import shutil

IMAGES_DIR  = "output/images"   # annotated previews — source of truth for names
OUTPUT_DIR  = "output"          # where original images live
LABELS_DIR  = "output/labels"   # where label txt files live
CLEAN_DIR   = "output_clean"    # destination
CLEAN_IMGS  = os.path.join(CLEAN_DIR, "images")
CLEAN_LBLS  = os.path.join(CLEAN_DIR, "labels")
IMG_EXTS    = {".jpg", ".jpeg", ".png"}

os.makedirs(CLEAN_IMGS, exist_ok=True)
os.makedirs(CLEAN_LBLS, exist_ok=True)

found = skipped = 0

for fname in os.listdir(IMAGES_DIR):
    name, ext = os.path.splitext(fname)

    # strip _annotated suffix to get base name
    if not name.endswith("_annotated"):
        continue
    base = name[: -len("_annotated")]  # e.g. "20260330_153647_download_1"

    # find matching image in output/ (try jpg, jpeg, png)
    src_img = None
    for e in IMG_EXTS:
        candidate = os.path.join(OUTPUT_DIR, base + e)
        if os.path.isfile(candidate):
            src_img = candidate
            break

    # find matching label in output/labels/
    src_lbl = os.path.join(LABELS_DIR, base + ".txt")

    if src_img is None or not os.path.exists(src_lbl):
        print(f"  ⚠ Missing {'image' if src_img is None else 'label'} for: {base}")
        skipped += 1
        continue

    shutil.copy(src_img, os.path.join(CLEAN_IMGS, os.path.basename(src_img)))
    shutil.copy(src_lbl, os.path.join(CLEAN_LBLS, base + ".txt"))
    found += 1

print(f"\n✅ Copied {found} matched pairs to {CLEAN_DIR}/")
print(f"⚠  Skipped {skipped} (missing image or label)")

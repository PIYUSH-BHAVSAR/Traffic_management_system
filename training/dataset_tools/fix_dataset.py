import os

BASE_PATH = "dataset"

def fix_labels(split):
    lbl_path = os.path.join(BASE_PATH, "labels", split)

    fixed = 0

    for file in os.listdir(lbl_path):
        path = os.path.join(lbl_path, file)

        if not file.endswith(".txt"):
            continue

        with open(path, "r") as f:
            lines = f.readlines()

        new_lines = []

        for line in lines:
            parts = line.strip().split()

            if len(parts) != 5:
                continue

            cls, x, y, w, h = map(float, parts)

            # Clamp values between 0 and 1
            x = max(0, min(1, x))
            y = max(0, min(1, y))
            w = max(0, min(1, w))
            h = max(0, min(1, h))

            new_lines.append(f"{int(cls)} {x} {y} {w} {h}\n")

        if new_lines:
            with open(path, "w") as f:
                f.writelines(new_lines)
            fixed += 1

    print(f"{split} fixed files: {fixed}")


fix_labels("train")
fix_labels("val")
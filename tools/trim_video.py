"""
trim_video.py — Cut a video using moviepy (no ffmpeg CLI needed).

Install dep:
    pip install moviepy

Usage:
    python tools/trim_video.py

Prompts:
    - Input file path  (e.g. test_videos/test1.mp4)
    - Start time       (e.g. 00:58 or 58)
    - End time         (e.g. 01:30 or 90)
    - Output name      (e.g. my_clip  →  tools/trim_output/my_clip.mp4)
"""

import os
import sys

def parse_time(t: str) -> float:
    """Accept HH:MM:SS, MM:SS, HH.MM.SS, MM.SS, or raw seconds."""
    t = t.strip().replace(".", ":")  # allow dots as separator too
    parts = t.split(":")
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
        else:
            return float(parts[0])
    except ValueError:
        raise ValueError(f"Cannot parse time: '{t}'")


def main():
    try:
        from moviepy.video.io.VideoFileClip import VideoFileClip
    except ImportError:
        print("moviepy not installed. Run:  pip install moviepy")
        sys.exit(1)

    print("=" * 45)
    print("  Video Trimmer — powered by moviepy")
    print("=" * 45)

    # Input
    input_path = input("\nInput video path: ").strip().strip('"').strip("'")
    if not os.path.exists(input_path):
        print(f"ERROR: File not found — {input_path}")
        sys.exit(1)

    # Times
    try:
        start_sec = parse_time(input("Start time (e.g. 00:58): "))
        end_sec   = parse_time(input("End   time (e.g. 01:30): "))
    except ValueError as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    if end_sec <= start_sec:
        print("ERROR: End time must be after start time.")
        sys.exit(1)

    # Output name
    out_name = input("Output filename (no extension): ").strip().strip('"').strip("'") or "trimmed_output"

    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "trim_output")
    os.makedirs(out_dir, exist_ok=True)

    _, ext      = os.path.splitext(input_path)
    output_path = os.path.join(out_dir, out_name + (ext or ".mp4"))

    print(f"\nTrimming {start_sec}s → {end_sec}s  ({end_sec - start_sec:.1f}s)")
    print(f"Saving to: {output_path}\n")

    with VideoFileClip(input_path) as clip:
        trimmed = clip.subclipped(start_sec, end_sec)
        trimmed.write_videofile(output_path, codec="libx264", audio_codec="aac", logger="bar")

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"\nDone!  {output_path}  ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()

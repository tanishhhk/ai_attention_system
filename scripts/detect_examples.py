"""Detect landmarks in the example photos and save them for the website.

Uses the same MediaPipe Tasks models as the browser version (web/src/live.ts),
so the examples show what the live check would see for each photo.

    python scripts/detect_examples.py --face face_landmarker.task --pose pose_landmarker_lite.task

Models: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
        https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
"""

import argparse
import json
import sys
from pathlib import Path

import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import (
    FaceLandmarker, FaceLandmarkerOptions, PoseLandmarker, PoseLandmarkerOptions,
)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.detector_indices import FACE_INDEX, POSE_INDEX  # noqa: E402
from src.rules import evaluate  # noqa: E402

PHOTOS = ROOT / "web" / "public" / "examples"  # one folder per person: male/, female/

# What each photo must show for the site to use it. A photo that doesn't trip its
# check is left out, so no example contradicts its own label.
INTENT = {
    "focused": lambda r: r["issues"] == [] and r["notes"] == [],
    "slouching": lambda r: "Slouching" in r["issues"],
    "leaning": lambda r: "Leaning" in r["issues"],
    "head_forward": lambda r: "Head Forward" in r["issues"],
    "eyes_closed": lambda r: "Eyes Closed" in r["issues"],
    "yawning": lambda r: "Yawning" in r["issues"],
    "looking_away": lambda r: "Looking Away" in r["issues"],
    "shoulders_hidden": lambda r: r["notes"] != [],
    "no_face": lambda r: r["issues"] == ["No Face Detected"],
    "drowsy_slump": lambda r: {"Slouching", "Eyes Closed"} <= set(r["issues"]),
}
OUT = ROOT / "web" / "src" / "examples.json"


def r4(v):
    return round(float(v), 4)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--face", required=True)
    ap.add_argument("--pose", required=True)
    args = ap.parse_args()

    face = FaceLandmarker.create_from_options(
        FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=args.face), num_faces=1)
    )
    pose = PoseLandmarker.create_from_options(
        PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=args.pose), num_poses=1)
    )

    out = {}
    for path in sorted(PHOTOS.glob("*/*.jpg")):
        person = path.parent.name
        image = mp.Image.create_from_file(str(path))
        f = face.detect(image).face_landmarks
        p = pose.detect(image).pose_landmarks
        face_pts = (
            {n: {"x": r4(f[0][i].x), "y": r4(f[0][i].y)} for n, i in FACE_INDEX.items()} if f else None
        )
        pose_pts = (
            {n: {"x": r4(p[0][i].x), "y": r4(p[0][i].y), "v": r4(p[0][i].visibility)} for n, i in POSE_INDEX.items()}
            if p else None
        )
        w, h = image.width, image.height
        res = evaluate(pose_pts, face_pts, w, h)
        ok = INTENT[path.stem](res)
        if ok:
            out.setdefault(person, {})[path.stem] = {"w": w, "h": h, "pose": pose_pts, "face": face_pts}
        mark = "ok  " if ok else "SKIP"
        print(f"{mark} {person:7}{path.stem:18} {res['score']:>3} {res['state']:14} {res['issues']} {res['notes']}")

    OUT.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

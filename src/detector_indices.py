"""Landmark indices for the named points the rules read.

Plain numbers, no MediaPipe import: shared by detector.py (legacy Face Mesh /
Pose) and scripts/detect_examples.py (Tasks API). The browser version uses the
same numbers in web/src/live.ts.
"""

POSE_INDEX = {"nose": 0, "left_shoulder": 11, "right_shoulder": 12}

FACE_INDEX = {
    "eye_l_top": 159, "eye_l_bottom": 145, "eye_l_outer": 33, "eye_l_inner": 133,
    "eye_r_top": 386, "eye_r_bottom": 374, "eye_r_inner": 362, "eye_r_outer": 263,
    "lip_top": 13, "lip_bottom": 14, "mouth_l": 61, "mouth_r": 291,
    "nose_tip": 1, "cheek_l": 234, "cheek_r": 454,
}

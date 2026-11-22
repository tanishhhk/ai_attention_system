"""Rule-based attention scoring over named landmarks.

Pure functions only: no OpenCV, no MediaPipe. `detector.py` turns MediaPipe
results into the named points below; the browser version (web/src/rules.ts)
mirrors this file and both are tested against shared/rules_cases.json.

Every threshold is a ratio of two distances measured in the same frame, so the
result does not depend on camera resolution. Distances are computed in pixels
(x * width, y * height) so that non-square frames are measured correctly.
"""

from math import hypot

# Pose landmarks need at least this visibility to be trusted.
MIN_SHOULDER_VISIBILITY = 0.5

# Horizontal nose offset from the shoulder midpoint, as a share of shoulder width.
HEAD_FORWARD_RATIO = 0.20
# Vertical gap between nose and shoulder line, as a share of shoulder width.
SLOUCH_RATIO = 0.25
# Height difference between the shoulders, as a share of shoulder width.
LEAN_RATIO = 0.15
# Eye opening / eye width. Both eyes must be below this, so a wink is not "closed".
EYES_CLOSED_RATIO = 0.15
# Lip gap / mouth width.
YAWN_RATIO = 0.40
# Nose position across the face (0 = one cheek, 1 = the other).
# Outside this band the head is turned away from the screen.
FACING_MIN = 0.30
FACING_MAX = 0.70

PENALTIES = {
    "Head Forward": 20,
    "Slouching": 20,
    "Leaning": 15,
    "Eyes Closed": 30,
    "Yawning": 15,
    "Looking Away": 20,
}

NO_FACE = "No Face Detected"
SHOULDERS_HIDDEN_NOTE = "Shoulders not in view: posture not checked"

POSE_POINTS = ("nose", "left_shoulder", "right_shoulder")
FACE_POINTS = (
    "eye_l_top", "eye_l_bottom", "eye_l_outer", "eye_l_inner",
    "eye_r_top", "eye_r_bottom", "eye_r_inner", "eye_r_outer",
    "lip_top", "lip_bottom", "mouth_l", "mouth_r",
    "nose_tip", "cheek_l", "cheek_r",
)


def _dist(a, b, w, h):
    return hypot((a["x"] - b["x"]) * w, (a["y"] - b["y"]) * h)


def _ratio(numerator, denominator):
    return numerator / denominator if denominator > 0 else 0.0


def posture_issues(pose, w, h):
    """Return (issues, notes) for the posture checks."""
    if pose is None:
        return [], [SHOULDERS_HIDDEN_NOTE]

    l_sh, r_sh, nose = pose["left_shoulder"], pose["right_shoulder"], pose["nose"]
    if min(l_sh.get("v", 1.0), r_sh.get("v", 1.0)) < MIN_SHOULDER_VISIBILITY:
        return [], [SHOULDERS_HIDDEN_NOTE]

    shoulder_width = _dist(l_sh, r_sh, w, h)
    mid_x = (l_sh["x"] + r_sh["x"]) / 2 * w
    mid_y = (l_sh["y"] + r_sh["y"]) / 2 * h
    nose_x, nose_y = nose["x"] * w, nose["y"] * h

    issues = []
    if _ratio(abs(nose_x - mid_x), shoulder_width) > HEAD_FORWARD_RATIO:
        issues.append("Head Forward")
    if _ratio(mid_y - nose_y, shoulder_width) < SLOUCH_RATIO:
        issues.append("Slouching")
    if _ratio(abs(l_sh["y"] - r_sh["y"]) * h, shoulder_width) > LEAN_RATIO:
        issues.append("Leaning")
    return issues, []


def face_issues(face, w, h):
    """Return the face checks. Caller handles face is None."""
    left_open = _ratio(
        _dist(face["eye_l_top"], face["eye_l_bottom"], w, h),
        _dist(face["eye_l_outer"], face["eye_l_inner"], w, h),
    )
    right_open = _ratio(
        _dist(face["eye_r_top"], face["eye_r_bottom"], w, h),
        _dist(face["eye_r_inner"], face["eye_r_outer"], w, h),
    )
    mouth_open = _ratio(
        _dist(face["lip_top"], face["lip_bottom"], w, h),
        _dist(face["mouth_l"], face["mouth_r"], w, h),
    )
    left_x = min(face["cheek_l"]["x"], face["cheek_r"]["x"])
    right_x = max(face["cheek_l"]["x"], face["cheek_r"]["x"])
    facing = _ratio(face["nose_tip"]["x"] - left_x, right_x - left_x)

    issues = []
    if left_open < EYES_CLOSED_RATIO and right_open < EYES_CLOSED_RATIO:
        issues.append("Eyes Closed")
    if mouth_open > YAWN_RATIO:
        issues.append("Yawning")
    if facing < FACING_MIN or facing > FACING_MAX:
        issues.append("Looking Away")
    return issues


def state_for(score):
    if score > 80:
        return "FOCUSED"
    if score > 60:
        return "ATTENTIVE"
    if score > 40:
        return "LOW ATTENTION"
    if score > 20:
        return "DISTRACTED"
    return "CRITICAL"


def evaluate(pose, face, w, h):
    """Score one frame.

    pose: dict of POSE_POINTS -> {"x", "y", "v"} (normalised 0-1), or None.
    face: dict of FACE_POINTS -> {"x", "y"} (normalised 0-1), or None.
    w, h: frame size in pixels.
    """
    if face is None:
        return {"score": 0, "state": state_for(0), "issues": [NO_FACE], "notes": []}

    issues, notes = posture_issues(pose, w, h)
    issues += face_issues(face, w, h)
    score = max(0, 100 - sum(PENALTIES[i] for i in issues))
    return {"score": score, "state": state_for(score), "issues": issues, "notes": notes}

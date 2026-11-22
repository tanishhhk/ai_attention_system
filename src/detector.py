import cv2
import mediapipe as mp

from src.rules import evaluate

# detector.py uses the legacy mp.solutions API (Pose, FaceMesh); see requirements.txt
mp_pose = mp.solutions.pose
pose = mp_pose.Pose()

mp_face = mp.solutions.face_mesh
face_mesh = mp_face.FaceMesh(refine_landmarks=True)

POSE_INDEX = {
    "nose": mp_pose.PoseLandmark.NOSE,
    "left_shoulder": mp_pose.PoseLandmark.LEFT_SHOULDER,
    "right_shoulder": mp_pose.PoseLandmark.RIGHT_SHOULDER,
}

# Face Mesh landmark indices (same numbering in the browser FaceLandmarker).
FACE_INDEX = {
    "eye_l_top": 159, "eye_l_bottom": 145, "eye_l_outer": 33, "eye_l_inner": 133,
    "eye_r_top": 386, "eye_r_bottom": 374, "eye_r_inner": 362, "eye_r_outer": 263,
    "lip_top": 13, "lip_bottom": 14, "mouth_l": 61, "mouth_r": 291,
    "nose_tip": 1, "cheek_l": 234, "cheek_r": 454,
}


def analyze_frame(frame):
    h, w, _ = frame.shape
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    pose_result = pose.process(rgb)
    face_result = face_mesh.process(rgb)

    pose_points = None
    if pose_result.pose_landmarks:
        lm = pose_result.pose_landmarks.landmark
        pose_points = {
            name: {"x": lm[i].x, "y": lm[i].y, "v": lm[i].visibility}
            for name, i in POSE_INDEX.items()
        }

    face_points = None
    if face_result.multi_face_landmarks:
        lm = face_result.multi_face_landmarks[0].landmark
        face_points = {name: {"x": lm[i].x, "y": lm[i].y} for name, i in FACE_INDEX.items()}

    result = evaluate(pose_points, face_points, w, h)
    return frame, result["score"], result["state"], result["issues"], result["notes"]

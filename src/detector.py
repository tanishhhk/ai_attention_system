import time

import cv2
import mediapipe as mp

from src.detector_indices import FACE_INDEX, POSE_INDEX
from src.rules import YawnTracker, add_history, evaluate

# detector.py uses the legacy mp.solutions API (Pose, FaceMesh); see requirements.txt
mp_pose = mp.solutions.pose
pose = mp_pose.Pose()

mp_face = mp.solutions.face_mesh
face_mesh = mp_face.FaceMesh(refine_landmarks=True)

yawns = YawnTracker()

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
    recent = yawns.update(time.monotonic(), "Yawning" in result["issues"])
    result = add_history(result, recent)
    return frame, result["score"], result["state"], result["issues"], result["notes"]

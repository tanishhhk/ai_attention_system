"""Run with: python -m unittest discover tests"""

import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.rules import YawnTracker, add_history, evaluate  # noqa: E402

CASES = json.loads((ROOT / "shared" / "rules_cases.json").read_text(encoding="utf-8"))


def build(case):
    frame = copy.deepcopy(CASES["base"])
    for part in ("pose", "face"):
        if part in case:
            if case[part] is None:
                frame[part] = None
            else:
                frame[part].update(case[part])
    return frame["pose"], frame["face"], case.get("w", frame["w"]), case.get("h", frame["h"])


BY_ID = {c["id"]: c for c in CASES["cases"]}


class SharedCases(unittest.TestCase):
    def test_cases(self):
        for case in CASES["cases"]:
            with self.subTest(case["id"]):
                self.assertEqual(evaluate(*build(case)), case["expect"])

    def test_history_cases(self):
        for hc in CASES["history_cases"]:
            with self.subTest(hc["id"]):
                frame = evaluate(*build(BY_ID[hc["case"]]))
                self.assertEqual(add_history(frame, hc["recent_yawns"]), hc["expect"])

    def test_yawn_sequences(self):
        for seq in CASES["yawn_sequences"]:
            with self.subTest(seq["id"]):
                tracker = YawnTracker()
                counts = [tracker.update(t, yawning) for t, yawning in seq["frames"]]
                self.assertEqual(counts, seq["counts"])


if __name__ == "__main__":
    unittest.main()

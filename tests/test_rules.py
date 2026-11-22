"""Run with: python -m unittest discover tests"""

import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.rules import evaluate  # noqa: E402

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


class SharedCases(unittest.TestCase):
    def test_cases(self):
        for case in CASES["cases"]:
            with self.subTest(case["id"]):
                self.assertEqual(evaluate(*build(case)), case["expect"])


if __name__ == "__main__":
    unittest.main()

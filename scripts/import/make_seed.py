"""
Turn the imported records into the seed the app ships.

Kept as a script rather than a one-off so the seed can be regenerated whenever
a parsing rule changes, instead of drifting away from the importer that made it.
"""

import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from exercise_catalog import BODYWEIGHT

# "Marteau" is French for hammer, logged at dumbbell weights: the author's
# hammer curls under another name.
RENAME = {"Marteau": "Hammer Curl"}

# Names whose muscle cannot be read from the words alone.
EXPLICIT = {
    "Abductures": "adductors", "Aducteurs": "adductors", "Dead Lifts": "lower_back",
    "Hammer On Knee Seated": "biceps", "Lateral Cable": "deltoids",
    "Machine Press": "chest", "Press Step": "quadriceps", "Incline Press": "chest",
}

# Ordered: the first match wins, so "rear delt" must be tested before "delt".
KEYWORDS = [
    ("deltoids_back", ["rear delt", "reverse pec", "face pull"]),
    ("chest", ["bench", "chest", "pec", "fly", "dips", "crossover",
                # An incline press is a chest movement; without these the
                # renamed variants had no keyword left to match on.
                "incline press", "incline dumbbell", "incline machine", "machine incline"]),
    ("upper_back", ["row", "pulldown", "pullup", "lat ", "chinup", "tbar"]),
    ("lower_back", ["deadlift", "dead lift", "back extension", "hyper"]),
    ("deltoids", ["shoulder", "delt", "lateral raise", "front raise", "ohp", "overhead"]),
    ("biceps", ["curl", "biceps", "hammer"]),
    ("triceps", ["triceps", "pushdown", "skull", "close grip dumbbell"]),
    ("quadriceps", ["squat", "leg extension", "leg press", "hack", "stepup", "lunge"]),
    ("hamstring", ["leg curl", "romanian", "hamstring"]),
    ("gluteal", ["hip thrust", "glute", "lunge", "bulgarian"]),
    ("calves", ["calf", "calve"]),
    ("trapezius_back", ["shrug", "trap"]),
    ("forearm", ["wrist", "forearm"]),
    ("adductors", ["adduct", "abduct"]),
    ("abs", ["ab ", "crunch", "plank", "oblique"]),
    ("neck", ["neck"]),
]

GROUP = {
    "chest": "Chest", "upper_back": "Back", "lower_back": "Back", "trapezius_back": "Back",
    "deltoids": "Shoulders", "deltoids_back": "Shoulders", "biceps": "Biceps",
    "triceps": "Triceps", "quadriceps": "Legs", "hamstring": "Legs", "gluteal": "Legs",
    "calves": "Legs", "adductors": "Legs", "forearm": "Forearms", "abs": "Core",
    "neck": "Neck",
}


def classify(name):
    if name in EXPLICIT:
        return EXPLICIT[name]
    # Hyphens are collapsed before matching: renaming "Pullup" to the correct
    # "Pull-Up" silently stopped it matching the "pullup" pattern, and eleven
    # exercises fell through to Other.
    n = name.lower().replace("-", "").replace("  ", " ")
    for key, pats in KEYWORDS:
        if any(p in n for p in pats):
            return key
    return None


def main(sheets_dir, out_path):
    recs = json.load(open(os.path.join(sheets_dir, "records.json")))
    for r in recs:
        r["exercise"] = RENAME.get(r["exercise"], r["exercise"])

    by_ex = collections.defaultdict(lambda: collections.defaultdict(list))
    keys, unknown = {}, set()
    for r in recs:
        k = classify(r["exercise"])
        if k is None:
            unknown.add(r["exercise"])
        keys[r["exercise"]] = k
        by_ex[r["exercise"]][r["date"]].append([r["weight"], r["reps"], r["failure"]])

    exercises = [
        {
            "name": ex,
            "key": keys[ex],
            "group": GROUP.get(keys[ex], "Other"),
            # Bodyweight movements: the logged number is the ADDED plate, so the
            # app must add the body's own load or they plot as a flat zero.
            **({"bw": True} if ex in BODYWEIGHT else {}),
            # heaviest first, so a day reads as its top set down to its back-offs
            "days": {d: sorted(s, key=lambda x: -x[0]) for d, s in sorted(days.items())},
        }
        for ex, days in sorted(by_ex.items())
    ]

    total = sum(len(v) for e in exercises for v in e["days"].values())
    json.dump({"version": 1, "records": total, "exercises": exercises},
              open(out_path, "w"), separators=(",", ":"))

    print(f"{len(exercises)} exercises, {total} sets, {os.path.getsize(out_path) // 1024} KB")
    if unknown:
        print("UNCLASSIFIED:", ", ".join(sorted(unknown)))
    print("groups:", dict(collections.Counter(e["group"] for e in exercises)))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

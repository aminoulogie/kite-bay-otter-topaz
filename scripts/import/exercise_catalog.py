"""
Canonical exercises, their aliases, and how their numbers must be read.

Every identification here came from the sheet's author; nothing is guessed.
The flags matter more than the names, because they change the arithmetic:

  plate_loaded  the number written is ONE SIDE. Actual = 2 x written + 20kg bar.
                Bars only — never machines, dumbbells or cable stacks.
  bar_kg        overridden for the T-bar, where the bar itself is not counted.
  bodyweight    a bare 1-2 digit number is a REP COUNT, not a weight. A 3-digit
                number is added plate + reps, e.g. 108 = a 10kg disc held, 8 reps.
"""

# raw spelling (lowercased, normalised) -> canonical name
ALIASES: dict[str, str] = {
    # identified by the author
    "ambert": "Back Extension",
    "hyper extension": "Back Extension",
    "bar floor": "T-Bar Row",
    "ep lat mchine": "Lat Pulldown",
    "lat mach": "Lat Pulldown",
    "pulldown mach": "Lat Pulldown",
    "pear delt": "Rear Delt Fly",
    "reverse pec dec": "Rear Delt Fly",
    "reverse pec deck": "Rear Delt Fly",
    "reverse deck": "Rear Delt Fly",
    "shoulder flights": "Machine Shoulder Fly",
    "traps bar libre": "Smith Machine Shrug",
    # "bibouh" is a rotating dumbbell fly the author does before normal flyes.
    # Logged as the real movement, at their instruction.
    "bibouh": "Dumbbell Chest Fly",
    # amortis / damped / assisted all mean the Smith machine
    "bar amortis press": "Smith Machine Bench Press",
    "assisted bnch press": "Smith Machine Bench Press",
    "barbell bench damped": "Smith Machine Bench Press",
    "incline barbell amortisseur": "Smith Machine Incline Press",
    "assisted inc bnch press": "Smith Machine Incline Press",
    "inclined damped bench": "Smith Machine Incline Press",
    "squat amortis": "Smith Machine Squat",
    "machine etage": "Machine Press",
    "press etage": "Machine Press",
    "machine etage chest bench inc": "Machine Incline Chest Press",
}

# Explicitly dropped: not exercises, or the author could not identify them.
DISCARD = {"pilovert", "pilovert ecarte", "mfp", "wheel", "grip", "machine",
           "bodyweight", "start kg plate", "exercise", "set", "week",
           "light band or hand", "light moderate", "moderate heavy",
           "load resistance", "back", "chest", "legs", "shoulder", "shoulders",
           "biceps", "calves", "forearm", "traps", "press", "hammer", "mach"}

# Bars the lifter loads by hand: written number is one side.
PLATE_LOADED = {
    "Barbell Flat Bench Press", "Barbell Incline Bench Press",
    "Barbell Decline Bench Press", "Barbell Bent Over Row", "T-Bar Row",
    "Smith Machine Bench Press", "Smith Machine Incline Press",
    "Smith Machine Squat", "Smith Machine Shrug", "Barbell Squat",
    "Weighted Squat", "Deadlift", "Rowing",
}

# The T-bar's own weight is not counted, per the author.
BAR_KG_OVERRIDE = {"T-Bar Row": 0.0}

# A bare number here is reps; 3 digits means added plate + reps.
BODYWEIGHT = {"Pullup", "Chinup", "Dips", "Weighted Dips", "Neck Ups",
              "Biceps Pullup", "Triceps Reverse Pullup", "Back Extension"}


def resolve(raw_canon: str) -> str | None:
    """Map a normalised sheet name to a canonical exercise, or None to drop it."""
    key = raw_canon.strip().lower()
    if key in DISCARD:
        return None
    return ALIASES.get(key, raw_canon.title())

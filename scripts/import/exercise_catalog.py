"""
Canonical exercises, their aliases, and how their numbers must be read.

Every identification here came from the sheet's author; nothing is guessed.
The flags matter more than the names, because they change the arithmetic:

  plate_loaded  the number written is ONE SIDE. Actual = 2 x written + 20kg bar.
                Bars only — never machines, dumbbells or cable stacks.
  bar_kg        overridden for the T-bar, where the bar itself is not counted.
  bodyweight    a bare 1-2 digit number is a REP COUNT, not a weight. A 3-digit
                number is added plate + reps, e.g. 108 = a 10kg disc held, 8 reps.

An unmatched name is worse than it looks. It keeps the raw spelling AND misses
the plate-loaded flag, so a Smith squat written as "40" appeared as "Squats
Amortis, 40kg" instead of "Smith Machine Squat, 100kg". Two symptoms, one cause.
"""

# raw spelling (lowercased, normalised) -> canonical name
ALIASES: dict[str, str] = {
    # --- identified by the author -------------------------------------------
    "ambert": "Back Extension",
    "hyper extension": "Back Extension",
    "bar floor": "T-Bar Row",
    "ep lat mchine": "Lat Pulldown",
    "lat mach": "Lat Pulldown",
    "pulldown mach": "Lat Pulldown",
    "pulldown grip": "Lat Pulldown",
    "pear delt": "Rear Delt Fly",
    "reverse pec dec": "Rear Delt Fly",
    "reverse pec deck": "Rear Delt Fly",
    "reverse deck": "Rear Delt Fly",
    "shoulder flights": "Machine Shoulder Fly",
    "traps bar libre": "Smith Machine Shrug",
    "bibouh": "Dumbbell Chest Fly",

    # --- amortis / damped / assisted all mean the Smith machine --------------
    "bar amortis press": "Smith Machine Bench Press",
    "assisted bnch press": "Smith Machine Bench Press",
    "barbell bench damped": "Smith Machine Bench Press",
    "barbell bench amortis": "Smith Machine Bench Press",
    "incline barbell amortisseur": "Smith Machine Incline Press",
    "assisted inc bnch press": "Smith Machine Incline Press",
    "inclined damped bench": "Smith Machine Incline Press",
    "incline amortis bench": "Smith Machine Incline Press",
    "squat amortis": "Smith Machine Squat",
    "squats amortis": "Smith Machine Squat",
    "machine etage": "Machine Press",
    "press etage": "Machine Press",
    "machine etage chest bench inc": "Machine Incline Chest Press",

    # --- French and franglais ------------------------------------------------
    "abductures": "Hip Abduction Machine",
    "aducteurs": "Hip Adduction Machine",
    "epaule arriere bench": "Rear Delt Fly",
    "epaule arriere no bench": "Rear Delt Fly",
    "shoulders arriere bench": "Rear Delt Fly",
    "shoulders arriere no bench": "Rear Delt Fly",
    "dumbbell presse bench": "Dumbbell Bench Press",
    "dumbbell flat bench": "Dumbbell Bench Press",
    "dmbl presse bench": "Dumbbell Bench Press",

    # --- typos ---------------------------------------------------------------
    "barbell wrest curl": "Barbell Wrist Curl",
    "weighted squata": "Weighted Squat",
    "sogle leg extension": "Single Leg Extension",
    "single leg extension": "Single Leg Extension",
    "single triceps dmbl up bnch": "Single Arm Overhead Dumbbell Extension",
    "single triceps dumbbell up bnch": "Single Arm Overhead Dumbbell Extension",
    # Keyed without the trailing marker, because resolve() strips those
    # before looking the name up.
    "machine ben row": "Machine Row",
    "machine ben row alt": "Machine Row",
    "row mach": "Machine Row",
    "mach": "Machine Row",

    # --- shorthand that is not a movement name -------------------------------
    "bar curl biceps": "Barbell Biceps Curl",
    "bar biceps curl": "Barbell Biceps Curl",
    "barbell biceps isolated curl": "Barbell Biceps Curl",
    "bar curl triceps": "EZ Bar Skullcrusher",
    "bar curl triceps layed": "Lying Barbell Triceps Extension",
    "layed bar bench triceps pull": "Lying Barbell Triceps Extension",
    "biceps curl rope": "Cable Rope Biceps Curl",
    "biceps cable curl": "Cable Biceps Curl",
    "biceps machine": "Machine Biceps Curl",
    "biceps curl seated": "Seated Biceps Curl",
    "hammer biceps": "Hammer Curl",
    "hammer": "Hammer Curl",
    "hammer on knee seated": "Seated Concentration Hammer Curl",
    "forearms bar": "Barbell Wrist Curl",
    "forearms dumbbell": "Dumbbell Wrist Curl",
    "forearms machine": "Machine Wrist Curl",
    "diamond dumbbell triceps": "Close Grip Dumbbell Press",
    "diaomond triceps pull": "Close Grip Dumbbell Press",
    "seated dumbbell delts": "Seated Dumbbell Lateral Raise",
    "lateral cable": "Cable Lateral Raise",
    "lateral shoulder cable": "Cable Lateral Raise",
    "low lateral raise cable": "Cable Lateral Raise",
    "lateral mach": "Machine Lateral Raise",
    "lat raise": "Lateral Raise",
    "lateral cable flys": "Cable Chest Fly",
    "lateral cable fly": "Cable Chest Fly",
    "neck reverse": "Neck Extension",
    "reverse neck standing": "Neck Extension",
    "reverse steady neck up": "Neck Extension",
    "steady neck up": "Neck Flexion",
    "neck ups": "Neck Flexion",
    "rope ups": "Cable Rope Face Pull",
    "reverse rope cable": "Cable Rope Reverse Curl",
    "rope triceps cable": "Cable Rope Triceps Pushdown",
    "ropee pushdown": "Cable Rope Triceps Pushdown",
    "triceps rope pulldown": "Cable Rope Triceps Pushdown",
    "tricoe pushdown bar cable": "Cable Triceps Pushdown",
    "triceps pushdown": "Cable Triceps Pushdown",
    "triceps pulldown": "Cable Triceps Pushdown",
    "pec deck machine": "Pec Deck Fly",
    "pec fly machine": "Pec Deck Fly",
    "dead lifts": "Deadlift",
    "deadlifts": "Deadlift",
    "bent over row": "Barbell Bent Over Row",
    "rowing": "Barbell Bent Over Row",
    "rowing reverse grip": "Reverse Grip Barbell Row",
    "wide lat pulldown": "Wide Grip Lat Pulldown",
    "wide lats pulldown": "Wide Grip Lat Pulldown",
    "wide grip lats pulldown": "Wide Grip Lat Pulldown",
    "narrow lats pulldown": "Close Grip Lat Pulldown",
    "seated row cable": "Seated Cable Row",
    "seated row machine": "Machine Row",
    "seated row wide": "Wide Grip Seated Cable Row",
    "single cable row": "Single Arm Cable Row",
    "single arm row": "Single Arm Dumbbell Row",
    "dmbl row": "Single Arm Dumbbell Row",
    "dumbbell row": "Single Arm Dumbbell Row",
    "seated sup biceps curl": "Seated Supinated Biceps Curl",
    "single isolated biceps curl dbl": "Single Arm Dumbbell Curl",
    "single supported dmbl curl": "Single Arm Dumbbell Curl",
    "single supported dumbbell curl": "Single Arm Dumbbell Curl",
    "seated single dumbbell curl": "Single Arm Dumbbell Curl",
    "incline dumbbell press chest": "Incline Dumbbell Press",
    "incline dumbbell bench": "Incline Dumbbell Press",
    "dumbbell incline bench": "Incline Dumbbell Press",
    "incline dbl bench press": "Incline Dumbbell Press",
    "incline press": "Incline Machine Press",
    "chest press": "Machine Chest Press",
    "shoulder machine press": "Machine Shoulder Press",
    "dbl shoulder press": "Dumbbell Shoulder Press",
    "prone leg curl": "Lying Leg Curl",
    "calve press": "Calf Press",
    "leg sqquat machine": "Machine Squat",
    "squat machine": "Machine Squat",
    "biceps pullup": "Chin-Up",
    "triceps reverse pullup": "Reverse Grip Pull-Up",
    "pullup": "Pull-Up",
    "close grip bar curl": "Close Grip Barbell Curl",
    "wide grip bar curl": "Wide Grip Barbell Curl",
    "front raise cable": "Cable Front Raise",
    "high cable fly": "High Cable Crossover",
    "low standing cable fly": "Low Cable Crossover",
    "standing cable fly": "Cable Crossover",
    "press step": "Step-Up",
}

# Explicitly dropped: not exercises, or the author could not identify them.
DISCARD = {"pilovert", "pilovert ecarte", "mfp", "wheel", "grip", "machine",
           "bodyweight", "start kg plate", "exercise", "set", "week",
           "light band or hand", "light moderate", "moderate heavy",
           "load resistance", "back", "chest", "legs", "shoulder", "shoulders",
           "biceps", "calves", "forearm", "traps", "press", "bar raise"}

# Bars the lifter loads by hand: the written number is ONE SIDE.
PLATE_LOADED = {
    "Barbell Flat Bench Press", "Barbell Incline Bench Press",
    "Barbell Decline Bench Press", "Barbell Bent Over Row",
    "Reverse Grip Barbell Row", "T-Bar Row",
    "Smith Machine Bench Press", "Smith Machine Incline Press",
    "Smith Machine Squat", "Smith Machine Shrug",
    "Barbell Squat", "Machine Squat", "Weighted Squat", "Deadlift",
    "Barbell Biceps Curl", "EZ Bar Skullcrusher",
    "Lying Barbell Triceps Extension", "Barbell Wrist Curl",
    "Close Grip Barbell Curl", "Wide Grip Barbell Curl",
}

# The T-bar's own weight is not counted, per the author.
BAR_KG_OVERRIDE = {"T-Bar Row": 0.0}

# A bare number here is reps; 3 digits means added plate + reps.
BODYWEIGHT = {"Pull-Up", "Chin-Up", "Dips", "Weighted Dips", "Neck Flexion",
              "Neck Extension", "Reverse Grip Pull-Up", "Back Extension"}

# Markers the author appends to a cell, which are not part of the movement.
# "Rowing ns" is a barbell row done without straps, not an exercise called
# "Rowing Ns" — leaving these attached produced a separate exercise for the
# same lift depending on whether straps were used that day.
_TRAILING_MARKERS = ("ns", "ws", "st", "bf", "cnt", "alt", "left", "right", "each")


def resolve(raw_canon: str) -> str | None:
    """Map a normalised sheet name to a canonical exercise, or None to drop it."""
    key = raw_canon.strip().lower()

    # Strip trailing markers before matching, so "rowing ns" resolves like
    # "rowing" rather than becoming an exercise of its own.
    parts = key.split()
    while len(parts) > 1 and parts[-1] in _TRAILING_MARKERS:
        parts.pop()
    key = " ".join(parts)

    if key in DISCARD:
        return None
    return ALIASES.get(key, raw_canon.title())

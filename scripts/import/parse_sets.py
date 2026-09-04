"""
Decoder for the shorthand used in the training spreadsheets.

The notation is compressed and has no separator between weight and reps, so
these rules come from the sheet's author rather than being inferred:

  208        20kg x 8 reps
  2012       20kg x 12 reps
  355        35kg x 5 reps
  1006f      100kg x 6 reps, taken to failure
  20kgx7     explicit form, also used
  f/ff/fff   degree of failure (more f = closer to true failure)
  ns         no straps        st, s   with straps
  amortis / damped / assisted   the Smith machine

PLATE-LOADED BARS: the number written is ONE SIDE only. The bar is 20kg, so
"408" on a rowing bar is 40 + 40 + 20 = 100kg x 8. This applies only to bars
the lifter loads by hand, never to machines, dumbbells or cable stacks, so it
is driven by an explicit per-exercise flag rather than guessed.

Digit splitting is ambiguous in one place: a 4-digit run could be 2+2 (2012 =
20x12) or 3+1 (1006 = 100x6). Reps never carry a leading zero, so a '0' in the
third position resolves it. Anything still ambiguous is reported, never guessed.
"""

import re
from dataclasses import dataclass, field

BAR_KG = 20.0


@dataclass
class ParsedSet:
    weight: float          # actual kg, bar and both sides included
    reps: int
    failure: int = 0       # count of trailing f's
    straps: bool | None = None
    raw: str = ""
    note: str = ""


@dataclass
class ParseResult:
    sets: list[ParsedSet] = field(default_factory=list)
    rejects: list[tuple[str, str]] = field(default_factory=list)  # (token, why)


_EXPLICIT = re.compile(r"^(\d+(?:[.,]\d+)?)\s*kg?\s*[x*]\s*(\d+)$", re.I)
_XFORM = re.compile(r"^(\d+(?:[.,]\d+)?)\s*[x*]\s*(\d+)$", re.I)
_TRAIL = re.compile(r"(f+|ns|ws|st|s|cnt|bf|drop\s*set|ds)$", re.I)


def _split_digits(d: str) -> tuple[float, int] | None:
    """Split a bare digit run into (weight, reps), or None if ambiguous."""
    n = len(d)
    if n <= 2:
        return None                      # too short to carry both
    if n == 3:
        return float(d[:2]), int(d[2])   # 355 -> 35 x 5
    if n == 4:
        # reps never have a leading zero, so '0' here means a 3-digit weight
        return (float(d[:3]), int(d[3])) if d[2] == "0" else (float(d[:2]), int(d[2:]))
    if n == 5:
        return float(d[:3]), int(d[3:])  # 12512 -> 125 x 12
    return None


def _chunk3(d: str) -> list[tuple[float, int]] | None:
    """A run of 3-digit sets, e.g. 908607457 = 90x8, 60x7, 45x7 (a drop set)."""
    if len(d) % 3 or len(d) < 6:
        return None
    out = []
    for i in range(0, len(d), 3):
        w, r = float(d[i:i + 2]), int(d[i + 2])
        if not (0 < w <= 300 and 1 <= r <= 30):
            return None
        out.append((w, r))
    # A drop set descends. Ascending runs are more likely a different notation,
    # so they are left for review rather than decoded the wrong way round.
    return out if all(a[0] >= b[0] for a, b in zip(out, out[1:])) else None


def parse_cell(
    cell: str,
    plate_loaded: bool = False,
    bodyweight: bool = False,
    bar_kg: float = BAR_KG,
) -> ParseResult:
    """
    Decode one spreadsheet cell into its sets.

    On a bodyweight movement a bare 1-2 digit number is a REP COUNT with no
    added load, which is why those must not be rejected as "too short to
    carry both" — 786 of them would otherwise be dropped.
    """
    res = ParseResult()
    if not cell or not str(cell).strip():
        return res

    text = str(cell).strip()
    # single spaces separate sets too ("20kgx7 10kgx5"), but only when
    # the pieces look like sets rather than one phrase.
    for token in re.split(r"[,;/]+|\s+", text):
        token = token.strip()
        if not token:
            continue

        failure, straps, note = 0, None, ""
        # peel trailing markers off, innermost last
        while True:
            m = _TRAIL.search(token)
            if not m:
                break
            mark = m.group(1).lower()
            if mark.startswith("f") and set(mark) == {"f"}:
                failure = len(mark)
            elif mark in ("ns", "ws"):
                straps = False
            elif mark in ("st", "s"):
                straps = True
            else:
                note = (note + " " + mark).strip()
            token = token[: m.start()].strip(" ,.")
            if not token:
                break
        if not token:
            continue

        digits_only = re.fullmatch(r"\d+", token)

        # Bodyweight: a bare 1-2 digit number is reps at zero added load.
        if bodyweight and digits_only and len(token) <= 2:
            r = int(token)
            if 1 <= r <= 60:
                res.sets.append(ParsedSet(0.0, r, failure, straps, token, note))
            else:
                res.rejects.append((token, f"implausible rep count {r}"))
            continue

        # Same weight repeated: 251212 = 25kg x 12, then x 12 again. Tried
        # before the drop-set reading because 3-digit chunking would silently
        # turn it into 25x1, 21x2. A true drop set like 908607 fails this test
        # (86 is not a rep count) and falls through, so the two disambiguate
        # each other rather than needing a rule about which is more likely.
        if digits_only and len(token) == 6:
            w, r1, r2 = float(token[:2]), int(token[2:4]), int(token[4:])
            if 0 < w <= 300 and 1 <= r1 <= 30 and 1 <= r2 <= 30:
                for r in (r1, r2):
                    actual = w * 2 + bar_kg if plate_loaded else w
                    res.sets.append(ParsedSet(actual, r, failure, straps, token, note))
                continue

        # A drop set written as consecutive 3-digit sets.
        if digits_only and len(token) >= 6:
            chunks = _chunk3(token)
            if chunks:
                for w, r in chunks:
                    actual = w * 2 + bar_kg if plate_loaded else w
                    res.sets.append(ParsedSet(actual, r, failure, straps, token, "drop set"))
                continue

        pair = None
        for rx in (_EXPLICIT, _XFORM):
            m = rx.match(token)
            if m:
                pair = (float(m.group(1).replace(",", ".")), int(m.group(2)))
                break

        if pair is None:
            if digits_only:
                pair = _split_digits(token)
                if pair is None:
                    res.rejects.append((token, f"cannot split {len(token)} digits unambiguously"))
                    continue
            else:
                res.rejects.append((token, "not a recognised set notation"))
                continue

        w, r = pair
        if not (1 <= r <= 60):
            res.rejects.append((token, f"implausible rep count {r}"))
            continue
        if not (0 < w <= 500):
            res.rejects.append((token, f"implausible weight {w}"))
            continue

        # one side written -> both sides plus the bar
        actual = w * 2 + bar_kg if plate_loaded else w
        res.sets.append(ParsedSet(actual, r, failure, straps, token, note))

    return res

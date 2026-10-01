"""Dice-poker ranks and the ladder of claims.

A rank is a category, the faces that define it, and an optional kicker (the
highest die left over). "No pair and a 5" and "pair of 2s and a 5" are the same
kind of thing. A claim with no kicker ranks below the same claim with any kicker.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

NUM_DICE = 5
FACES = range(1, 7)

(NO_PAIR, PAIR, TWO_PAIR, THREE_KIND,
 FULL_HOUSE, FOUR_KIND, FIVE_KIND) = range(7)

# How many defining faces each category has.
_DEFINING = {NO_PAIR: 0, PAIR: 1, TWO_PAIR: 2, THREE_KIND: 1,
             FULL_HOUSE: 2, FOUR_KIND: 1, FIVE_KIND: 1}
# Categories where dice are left over to act as a kicker.
_HAS_KICKER = {NO_PAIR, PAIR, TWO_PAIR, THREE_KIND, FOUR_KIND}

# Count pattern of the five dice -> category.
_SHAPES = {
    (1, 1, 1, 1, 1): NO_PAIR,
    (2, 1, 1, 1): PAIR,
    (2, 2, 1): TWO_PAIR,
    (3, 1, 1): THREE_KIND,
    (3, 2): FULL_HOUSE,
    (4, 1): FOUR_KIND,
    (5,): FIVE_KIND,
}

_FORMATS = {
    NO_PAIR: "no pair",
    PAIR: "a pair of {0}s",
    TWO_PAIR: "two pair, {0}s and {1}s",
    THREE_KIND: "three {0}s",
    FULL_HOUSE: "a full house, {0}s over {1}s",
    FOUR_KIND: "four {0}s",
    FIVE_KIND: "five {0}s",
}

_NAMES = {
    "none": NO_PAIR, "no pair": NO_PAIR, "nopair": NO_PAIR,
    "pair": PAIR,
    "two pair": TWO_PAIR, "twopair": TWO_PAIR,
    "three": THREE_KIND,
    "full": FULL_HOUSE, "full house": FULL_HOUSE,
    "four": FOUR_KIND,
    "five": FIVE_KIND,
}


@dataclass(frozen=True, order=True)
class Rank:
    """Ordered by category, then defining faces, then kicker (0 = no kicker)."""
    category: int
    faces: tuple[int, ...]
    kicker: int = 0

    def __str__(self) -> str:
        if self == NIL:
            return "nothing"
        text = _FORMATS[self.category].format(*self.faces)
        return f"{text} and a {self.kicker}" if self.kicker else text


# The claim a player is "handed" when opening a round. It ranks below every
# real claim, and any rank is at least as good as it.
NIL = Rank(NO_PAIR, (), 0)


def evaluate(dice: list[int]) -> Rank:
    """The rank the dice actually make, including its kicker."""
    groups = sorted(Counter(dice).items(), key=lambda fc: (fc[1], fc[0]), reverse=True)
    category = _SHAPES[tuple(count for _, count in groups)]
    split = _DEFINING[category]
    faces = tuple(face for face, _ in groups[:split])
    leftover = [face for face, _ in groups[split:]]
    return Rank(category, faces, max(leftover, default=0))


def _defining_faces(category: int) -> list[tuple[int, ...]]:
    if category == NO_PAIR:
        return [()]
    if category == TWO_PAIR:
        return [(hi, lo) for hi in FACES for lo in FACES if hi > lo]
    if category == FULL_HOUSE:
        return [(t, p) for t in FACES for p in FACES if t != p]
    return [(f,) for f in FACES]


def all_ranks() -> list[Rank]:
    """Every legal rank, lowest to highest. Impossible ones are included."""
    claims = []
    for category in _DEFINING:
        for faces in _defining_faces(category):
            kickers = [0]
            if category in _HAS_KICKER:
                kickers += [k for k in FACES if k not in faces]
            claims += [Rank(category, faces, k) for k in kickers]
    claims.remove(NIL)
    return sorted(claims)


LADDER = all_ranks()
TOP_RANK = LADDER[-1]
_LEGAL = frozenset(LADDER)


def is_legal(claim: Rank) -> bool:
    return claim in _LEGAL


def parse_rank(text: str) -> Rank:
    """Parse e.g. 'pair 3', 'pair 2 5', 'two pair 5 2 3', 'full 4 2', 'none 5'.

    Numbers are the defining faces followed by an optional kicker.
    """
    words = text.lower().replace(",", " ").split()
    name = " ".join(w for w in words if not w.isdigit())
    if name not in _NAMES:
        raise ValueError(f"unknown rank {name!r}")
    category = _NAMES[name]
    nums = [int(w) for w in words if w.isdigit()]
    size = _DEFINING[category]
    if len(nums) > size + 1:
        raise ValueError(f"too many numbers for {name!r}")
    claim = Rank(category, tuple(nums[:size]), nums[size] if len(nums) > size else 0)
    if not is_legal(claim):
        raise ValueError(f"not a valid claim: {text!r}")
    return claim

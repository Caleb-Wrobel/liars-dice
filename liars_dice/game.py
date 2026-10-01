"""Game state machine: rounds, turns, pulls and lives."""
from __future__ import annotations

import random
from dataclasses import dataclass
from enum import IntEnum

from .ranks import FACES, NIL, NUM_DICE, TOP_RANK, Rank, evaluate, is_legal


class RuleError(Exception):
    """The attempted action is not allowed right now."""


@dataclass(frozen=True)
class Rules:
    """Basic rules are the defaults. Advanced lifts restrictions, it adds none."""
    lives: int = 3
    rollable: tuple[str, ...] = ("hidden",)  # which sets you may choose to roll
    roll_optional: bool = False              # may you skip the roll?
    peek_optional: bool = False              # may you skip peeking after rolling?

    @classmethod
    def advanced(cls, lives: int = 3) -> "Rules":
        return cls(lives, ("hidden", "visible"), True, True)


class Step(IntEnum):
    """A turn's fixed order. You may skip ahead, never back."""
    DECIDE = 0      # pull the cup, or peer
    REARRANGE = 1   # move dice between the visible and hidden sets
    ROLL = 2        # roll one of the sets
    PEEK = 3        # peek at the hidden set
    CLAIM = 4       # claim strictly higher and pass


@dataclass(frozen=True)
class PullResult:
    puller: int
    claimer: int
    claim: Rank
    dice: tuple[int, ...]
    revealed: Rank
    claim_true: bool
    loser: int
    eliminated: bool


class Game:
    def __init__(self, names: list[str], rules: Rules = Rules(),
                 rng: random.Random | None = None, first: int = 0):
        if len(names) < 2:
            raise ValueError("need at least two players")
        self.names = list(names)
        self.rules = rules
        self.rng = rng or random.Random()
        self.lives = [rules.lives] * len(names)
        self.start_round(first)

    # --- queries -----------------------------------------------------------

    @property
    def winner(self) -> int | None:
        alive = [i for i, n in enumerate(self.lives) if n > 0]
        return alive[0] if len(alive) == 1 else None

    @property
    def can_peer(self) -> bool:
        # Nothing can outrank the top claim, so peering would strand you.
        return self.claim not in (NIL, TOP_RANK)

    @property
    def visible_faces(self) -> list[int]:
        return [self.dice[i] for i in sorted(self.visible)]

    def next_alive(self, index: int) -> int:
        n = len(self.names)
        for step in range(1, n + 1):
            candidate = (index + step) % n
            if self.lives[candidate] > 0:
                return candidate
        raise RuleError("no players left")

    def available(self) -> list[str]:
        """Actions the current player may take right now."""
        if self.step == Step.DECIDE:
            return ["pull"] + (["peer"] if self.can_peer else [])
        actions = []
        if self.step <= Step.REARRANGE:
            actions.append("rearrange")
        if self.step <= Step.ROLL:
            actions.append("roll")
        if self.step <= Step.PEEK and self._roll_satisfied():
            actions.append("peek")
        if self._claim_unlocked():
            actions.append("claim")
        return actions

    # --- round and turn actions -------------------------------------------

    def start_round(self, opener: int) -> None:
        """All five dice start hidden and unseen, with nothing to beat.

        The opener begins at the roll step: their sets are empty so there is
        nothing to rearrange, and nothing to pull.
        """
        self.current = opener
        self.dice = [self.rng.choice(FACES) for _ in range(NUM_DICE)]
        self.visible: frozenset[int] = frozenset()
        self.known: frozenset[int] = frozenset()   # dice the current player has seen
        self.claim: Rank = NIL
        self.claimer: int | None = None
        self.rolled = self.peeked = False
        self.step = Step.ROLL

    def pull(self) -> PullResult:
        """Pull the cup. The next round opens with the player after the puller."""
        if self.step != Step.DECIDE:
            raise RuleError("you can only pull at the start of your turn")
        puller, claimer, claim = self.current, self.claimer, self.claim
        revealed = evaluate(self.dice)
        claim_true = revealed >= claim
        loser = puller if claim_true else claimer
        self.lives[loser] -= 1
        result = PullResult(puller, claimer, claim, tuple(self.dice), revealed,
                            claim_true, loser, self.lives[loser] == 0)
        if self.winner is None:
            self.start_round(self.next_alive(puller))
        return result

    def peer(self) -> list[int]:
        """See the hidden dice. This commits you to claiming higher."""
        if self.step != Step.DECIDE:
            raise RuleError("you can only peer at the start of your turn")
        if not self.can_peer:
            raise RuleError("the top rank is claimed; you must pull")
        self.known = frozenset(range(NUM_DICE))
        self.step = Step.REARRANGE
        return list(self.dice)

    def rearrange(self, visible: set[int] | frozenset[int]) -> None:
        self._begin(Step.REARRANGE)
        visible = frozenset(visible)
        if not visible <= set(range(NUM_DICE)):
            raise RuleError("dice are numbered 0-4")
        hidden = frozenset(range(NUM_DICE)) - visible
        sets = {"hidden": hidden, "visible": visible}
        if not self.rules.roll_optional and not any(sets[w] for w in self.rules.rollable):
            raise RuleError("you must leave a set you are able to roll")
        self.visible = visible
        self.step = Step.ROLL

    def roll(self, which: str = "hidden") -> None:
        """Roll the hidden or visible set.

        Rolling an empty set is the same as electing not to roll, so it is only
        allowed when rolling is optional.
        """
        self._begin(Step.ROLL)
        if which not in self.rules.rollable:
            raise RuleError(f"you may not roll the {which} dice")
        hidden = frozenset(range(NUM_DICE)) - self.visible
        rolled = self.visible if which == "visible" else hidden
        if not rolled and not self.rules.roll_optional:
            raise RuleError("the set is empty, and you must roll")
        for i in rolled:
            self.dice[i] = self.rng.choice(FACES)
        if which == "hidden":
            self.known -= rolled   # you haven't seen the new faces yet
        self.rolled = bool(rolled)
        self.step = Step.PEEK

    def peek(self) -> list[int]:
        self._begin(Step.PEEK)
        if not self._roll_satisfied():
            # Skipping ahead would strand the player: the roll could no longer be made.
            raise RuleError("you must roll before you peek")
        self.known = frozenset(range(NUM_DICE))
        self.peeked = True
        self.step = Step.CLAIM
        return list(self.dice)

    def make_claim(self, claim: Rank) -> None:
        """Claim any rank strictly above the standing one, true or not."""
        self._begin(Step.CLAIM)
        if not self._claim_unlocked():
            raise RuleError("you must roll and peek before claiming")
        if not is_legal(claim):
            raise RuleError("not a valid claim")
        if claim <= self.claim:
            raise RuleError(f"you must beat {self.claim}")
        self.claim, self.claimer = claim, self.current
        self.current = self.next_alive(self.current)
        self.known = self.visible          # the next player sees only the visible dice
        self.rolled = self.peeked = False
        self.step = Step.DECIDE

    # --- internals ---------------------------------------------------------

    def _roll_satisfied(self) -> bool:
        return self.rolled or self.rules.roll_optional

    def _claim_unlocked(self) -> bool:
        if self.step == Step.DECIDE:
            return False
        return ((self.rolled or self.rules.roll_optional)
                and (self.peeked or self.rules.peek_optional))

    def _begin(self, step: Step) -> None:
        if self.step == Step.DECIDE:
            raise RuleError("pull or peer first")
        if self.step > step:
            raise RuleError(f"too late to {step.name.lower()}: the turn order is fixed")

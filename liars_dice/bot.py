"""A simple computer opponent.

The bot only uses what its seat may know: the visible dice, the standing claim,
and its own dice once it has peered or peeked. It never reads hidden dice it
hasn't seen.
"""
from __future__ import annotations

import random
from typing import Callable

from .game import Game, PullResult, Step
from .ranks import FACES, LADDER, NUM_DICE, Rank, evaluate

SAMPLES = 200


class Bot:
    def __init__(self, rng: random.Random | None = None, pull_below: float = 0.35):
        self.rng = rng or random.Random()
        self.pull_below = pull_below  # pull when the claim looks less likely than this

    def chance_true(self, game: Game) -> float:
        """Estimate how likely the standing claim is, given only the visible dice."""
        visible = [game.dice[i] for i in game.visible]
        unseen = NUM_DICE - len(visible)
        hits = sum(
            evaluate(visible + [self.rng.choice(FACES) for _ in range(unseen)]) >= game.claim
            for _ in range(SAMPLES)
        )
        return hits / SAMPLES

    def play(self, game: Game, say: Callable[[str], None] = lambda _: None) -> PullResult | None:
        """Take a whole turn. Returns the result if the bot pulled the cup.

        `say` receives public narration only, never the bot's dice.
        """
        if game.step == Step.DECIDE:
            doubt = self.chance_true(game) < self.pull_below + self.rng.uniform(-0.1, 0.1)
            if "peer" not in game.available() or doubt:
                say("pulls the cup")
                return game.pull()
            game.peer()
            say("peers at the hidden dice")

        if "rearrange" in game.available() and self.rng.random() < 0.5:
            game.rearrange(self.rng.sample(range(NUM_DICE), self.rng.choice([1, 2])))
            say("rearranges the sets, showing " + " ".join(map(str, game.visible_faces)))

        keep_hand = (
            game.rules.roll_optional
            and len(game.known) == NUM_DICE
            and evaluate(game.dice) > game.claim
        )
        if "roll" in game.available() and not keep_hand:
            game.roll("hidden")
            say("rolls the hidden set")
        else:
            say("keeps the dice as they are")
        if "peek" in game.available():
            game.peek()

        claim = self.choose_claim(game)
        game.make_claim(claim)
        say(f"claims {claim}")
        return None

    def choose_claim(self, game: Game) -> Rank:
        """Claim near the real rank if it beats the standing claim, else bluff upward."""
        standing = LADDER.index(game.claim) if game.claim in LADDER else -1
        actual = LADDER.index(evaluate(game.dice))
        if actual > standing:
            target = max(standing + 1, actual - self.rng.choice([0, 0, 1, 2, 3]))
        else:
            target = min(standing + self.rng.choice([1, 1, 2, 3, 5]), len(LADDER) - 1)
        return LADDER[target]

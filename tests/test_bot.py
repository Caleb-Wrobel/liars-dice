import random

import pytest

from liars_dice.bot import Bot
from liars_dice.game import Game, PullResult, Rules
from liars_dice.ranks import parse_rank


@pytest.mark.parametrize("rules", [Rules(), Rules.advanced()], ids=["basic", "advanced"])
def test_bots_finish_full_games_using_only_legal_moves(rules):
    for seed in range(60):
        g = Game(["A", "B", "C"], rules, rng=random.Random(seed))
        bots = [Bot(random.Random(seed * 10 + i)) for i in range(3)]
        for _ in range(5000):
            if g.winner is not None:
                break
            bots[g.current].play(g)
        assert g.winner is not None, f"seed {seed} did not finish"


def test_bot_must_pull_the_top_claim():
    g = Game(["A", "B"], Rules.advanced(), rng=random.Random(1))
    g.make_claim(parse_rank("five 6"))
    assert isinstance(Bot(random.Random(1)).play(g), PullResult)


def test_bot_narrates_without_revealing_its_dice():
    g = Game(["A", "B"], Rules(), rng=random.Random(5))
    said = []
    Bot(random.Random(5)).play(g, said.append)
    assert said and said[-1].startswith("claims ")
    assert " ".join(map(str, g.dice)) not in " ".join(said)


def test_bot_pulls_an_unlikely_claim_and_peers_at_a_safe_one():
    g = Game(["A", "B"], Rules.advanced(), rng=random.Random(1))
    g.make_claim(parse_rank("five 5"))           # nearly impossible with 5 unseen dice
    assert isinstance(Bot(random.Random(1)).play(g), PullResult)

    g = Game(["A", "B"], Rules.advanced(), rng=random.Random(1))
    g.make_claim(parse_rank("none 1"))           # always true
    assert Bot(random.Random(1)).play(g) is None  # peered and raised instead

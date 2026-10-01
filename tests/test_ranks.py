import pytest

from liars_dice.ranks import (LADDER, NIL, TOP_RANK, Rank, evaluate, parse_rank,
                              NO_PAIR, PAIR, TWO_PAIR, THREE_KIND, FULL_HOUSE,
                              FOUR_KIND, FIVE_KIND)


@pytest.mark.parametrize("dice, expected", [
    ([6, 6, 6, 6, 6], Rank(FIVE_KIND, (6,), 0)),
    ([2, 2, 5, 2, 2], Rank(FOUR_KIND, (2,), 5)),
    ([3, 3, 4, 4, 4], Rank(FULL_HOUSE, (4, 3), 0)),
    ([3, 3, 3, 1, 6], Rank(THREE_KIND, (3,), 6)),
    ([2, 5, 2, 5, 1], Rank(TWO_PAIR, (5, 2), 1)),
    ([4, 4, 1, 2, 6], Rank(PAIR, (4,), 6)),
    ([1, 3, 4, 5, 6], Rank(NO_PAIR, (), 6)),
    ([1, 2, 3, 4, 5], Rank(NO_PAIR, (), 5)),  # no straights
])
def test_evaluate(dice, expected):
    assert evaluate(dice) == expected


def test_ladder_is_complete_and_sorted():
    assert len(LADDER) == 225
    assert LADDER == sorted(LADDER)
    assert TOP_RANK == Rank(FIVE_KIND, (6,))
    assert NIL < LADDER[0]
    assert NIL not in LADDER


def test_ordering():
    assert Rank(PAIR, (2,)) > Rank(PAIR, (1,))                 # higher faces win
    assert Rank(PAIR, (2,), 5) > Rank(PAIR, (2,), 3)           # then the kicker
    assert Rank(PAIR, (2,), 1) > Rank(PAIR, (2,))              # any kicker beats none
    assert Rank(PAIR, (6,), 5) < Rank(TWO_PAIR, (2, 1))        # category beats faces
    assert Rank(TWO_PAIR, (3, 1)) < Rank(THREE_KIND, (1,))
    assert Rank(THREE_KIND, (6,), 5) < Rank(FULL_HOUSE, (1, 2))
    assert Rank(FULL_HOUSE, (6, 5)) < Rank(FOUR_KIND, (1,))
    assert Rank(NO_PAIR, (), 6) < Rank(PAIR, (1,))


def test_every_rank_is_at_least_nil():
    assert evaluate([1, 3, 4, 5, 6]) >= NIL


def test_impossible_claims_are_legal():
    assert parse_rank("none 1") in LADDER
    assert parse_rank("pair 2 1") in LADDER


@pytest.mark.parametrize("text, expected", [
    ("pair 3", Rank(PAIR, (3,))),
    ("pair 2 5", Rank(PAIR, (2,), 5)),
    ("Two Pair 5 2", Rank(TWO_PAIR, (5, 2))),
    ("two pair 5 2 3", Rank(TWO_PAIR, (5, 2), 3)),
    ("full house 4 2", Rank(FULL_HOUSE, (4, 2))),
    ("none 5", Rank(NO_PAIR, (), 5)),
    ("five 6", Rank(FIVE_KIND, (6,))),
])
def test_parse_rank(text, expected):
    assert parse_rank(text) == expected


@pytest.mark.parametrize("bad", ["pair 7", "two pair 2 5", "full 3 3", "pair 3 3",
                                 "none", "straight 5", "five 6 1", "full 4 2 5",
                                 "high 1", "high card 1"])
def test_parse_rank_rejects(bad):
    with pytest.raises(ValueError):
        parse_rank(bad)


def test_str():
    assert str(Rank(PAIR, (2,), 5)) == "a pair of 2s and a 5"
    assert str(Rank(NO_PAIR, (), 5)) == "no pair and a 5"
    assert str(NIL) == "nothing"

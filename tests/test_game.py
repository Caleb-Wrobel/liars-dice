import random

import pytest

from liars_dice.game import Game, Rules, RuleError, Step
from liars_dice.ranks import NIL, parse_rank


def make(names=("A", "B", "C"), rules=Rules()):
    return Game(list(names), rules, rng=random.Random(1))


def open_with(g, claim, dice=None):
    """Have the current player open with `claim`, then force the dice."""
    if g.rules.roll_optional is False:
        g.roll()
    if g.rules.peek_optional is False:
        g.peek()
    g.make_claim(parse_rank(claim))
    if dice:
        g.dice[:] = dice


# --- the opening turn --------------------------------------------------------

def test_round_starts_with_nil_claim_and_opener_at_roll():
    g = make()
    assert g.claim == NIL and g.step == Step.ROLL
    assert g.visible == frozenset() and g.known == frozenset()
    assert g.available() == ["roll"]  # basic: peeking before the roll would strand you


def test_basic_cannot_peek_before_rolling():
    g = make()
    with pytest.raises(RuleError):
        g.peek()
    assert g.step == Step.ROLL and g.available() == ["roll"]   # still free to roll: not stranded
    g.roll()
    assert g.available() == ["peek"]


def test_advanced_may_peek_before_rolling():
    g = make(rules=Rules.advanced())
    assert g.available() == ["roll", "peek", "claim"]
    g.peek()


def test_opener_cannot_pull_peer_or_rearrange():
    g = make()
    for action in (g.pull, g.peer, lambda: g.rearrange({0})):
        with pytest.raises(RuleError):
            action()


def test_opener_must_beat_nil():
    g = make(rules=Rules.advanced())
    g.make_claim(parse_rank("none 1"))   # lowest legal claim


# --- turn order and the basic/advanced switches ------------------------------

def test_basic_requires_roll_and_peek_before_claiming():
    g = make()
    with pytest.raises(RuleError):
        g.make_claim(parse_rank("pair 1"))
    g.roll()
    with pytest.raises(RuleError):
        g.make_claim(parse_rank("pair 1"))
    g.peek()
    g.make_claim(parse_rank("pair 1"))
    assert g.current == 1 and g.step == Step.DECIDE


def test_basic_rolls_only_hidden_dice():
    g = make()
    open_with(g, "pair 1", dice=[1, 1, 1, 1, 1])
    g.peer()
    g.rearrange({0, 1})
    with pytest.raises(RuleError):
        g.roll("visible")
    g.roll("hidden")
    assert g.dice[:2] == [1, 1]


def test_advanced_can_skip_roll_and_peek():
    g = make(rules=Rules.advanced())
    g.make_claim(parse_rank("pair 6"))          # opener claims blind
    g.peer()
    g.make_claim(parse_rank("five 6"))          # bluff without rolling or peeking


def test_advanced_can_roll_visible_and_keep_hidden():
    g = make(rules=Rules.advanced())
    g.make_claim(parse_rank("pair 1"))
    g.dice[:] = [6, 6, 6, 6, 6]
    g.peer()
    g.rearrange({0, 1})
    g.roll("visible")
    assert g.dice[2:] == [6, 6, 6]


def test_rolling_an_empty_set_is_electing_not_to_roll():
    g = make(rules=Rules.advanced())
    g.make_claim(parse_rank("pair 1"))
    g.dice[:] = [1, 2, 3, 4, 5]
    g.peer()
    g.rearrange({0, 1, 2, 3, 4})                 # every die visible, hidden set empty
    g.roll("hidden")
    assert g.dice == [1, 2, 3, 4, 5]


def test_basic_cannot_leave_nothing_to_roll():
    g = make()
    open_with(g, "pair 1")
    g.peer()
    with pytest.raises(RuleError):
        g.rearrange({0, 1, 2, 3, 4})             # would force a skipped roll
    g.rearrange({0, 1, 2, 3})                    # one hidden die is enough


def test_turn_order_is_fixed():
    g = make(rules=Rules.advanced())
    g.make_claim(parse_rank("pair 1"))
    g.peer()
    g.roll()
    with pytest.raises(RuleError):
        g.rearrange(set())                       # too late
    g.peek()
    with pytest.raises(RuleError):
        g.roll()


def test_must_peer_before_arranging_and_peer_forbids_pulling():
    g = make()
    open_with(g, "pair 1")
    with pytest.raises(RuleError):
        g.roll()
    g.peer()
    with pytest.raises(RuleError):
        g.pull()


def test_claim_must_strictly_beat_standing_claim():
    g = make(rules=Rules.advanced())
    g.make_claim(parse_rank("pair 3"))
    g.peer()
    for bad in ("pair 3", "pair 2", "none 6"):
        with pytest.raises(RuleError):
            g.make_claim(parse_rank(bad))
    g.make_claim(parse_rank("pair 3 1"))        # a kicker beats no kicker


def test_cannot_peer_after_top_claim():
    g = make(rules=Rules.advanced())
    g.make_claim(parse_rank("five 6"))
    assert not g.can_peer and g.available() == ["pull"]
    with pytest.raises(RuleError):
        g.peer()


# --- what the player has seen ------------------------------------------------

def test_known_dice_follow_peers_rolls_and_peeks():
    g = make()
    g.roll()
    assert g.known == frozenset()                # rolled hidden dice are unseen
    g.peek()
    assert g.known == frozenset(range(5))
    g.make_claim(parse_rank("pair 1"))
    assert g.known == g.visible == frozenset()   # next player sees nothing hidden
    g.peer()
    assert g.known == frozenset(range(5))


def test_rolling_hidden_dice_hides_them_again():
    g = make(rules=Rules.advanced())
    g.make_claim(parse_rank("pair 1"))
    g.peer()
    g.rearrange({0, 1})
    g.roll("hidden")
    assert g.known == frozenset({0, 1})


# --- pulling -----------------------------------------------------------------

def test_true_claim_costs_the_puller_a_life():
    g = make()
    open_with(g, "pair 3", dice=[3, 3, 1, 2, 5])
    r = g.pull()
    assert r.claim_true and r.loser == 1 and g.lives == [3, 2, 3]


def test_claim_is_at_least_not_exactly():
    g = make()
    open_with(g, "pair 2", dice=[6, 6, 6, 1, 2])
    assert g.pull().claim_true


def test_kicker_must_be_met():
    g = make()
    open_with(g, "pair 2 5", dice=[2, 2, 3, 4, 1])   # kicker is only 4
    r = g.pull()
    assert not r.claim_true and r.loser == 0


def test_claimed_kicker_need_not_be_the_highest_held():
    g = make()
    open_with(g, "pair 2 4", dice=[2, 2, 5, 1, 3])   # holding a 5 kicker, claims a 4
    r = g.pull()
    assert r.claim_true and r.loser == 1


def test_highest_leftover_die_is_the_revealed_kicker():
    g = make()
    open_with(g, "three 4 2", dice=[4, 4, 4, 3, 1])  # revealed: three 4s and a 3
    r = g.pull()
    assert str(r.revealed) == "three 4s and a 3"
    assert r.claim_true and r.loser == 1


def test_claim_without_kicker_ignores_the_kicker():
    g = make()
    open_with(g, "pair 2", dice=[2, 2, 3, 4, 1])
    assert g.pull().claim_true


def test_false_claim_costs_the_claimer_a_life():
    g = make()
    open_with(g, "five 6", dice=[1, 2, 3, 4, 6])
    r = g.pull()
    assert not r.claim_true and r.loser == 0 and g.lives == [2, 3, 3]


# --- rounds and elimination --------------------------------------------------

def test_next_round_opens_with_player_after_the_puller():
    g = make()
    open_with(g, "five 6", dice=[1, 2, 3, 4, 6])   # A claims, B pulls, A loses
    g.pull()
    assert g.current == 2 and g.claim == NIL and g.step == Step.ROLL


def test_opener_is_after_puller_even_when_puller_loses():
    g = make()
    open_with(g, "pair 1", dice=[1, 1, 3, 4, 6])   # truthful; B pulls and loses
    g.pull()
    assert g.lives[1] == 2 and g.current == 2


def test_last_player_standing_wins():
    g = make(names=("A", "B"), rules=Rules(lives=1))
    open_with(g, "five 6", dice=[1, 2, 3, 4, 6])
    g.pull()
    assert g.winner == 1 and g.lives == [0, 1]


def test_eliminated_puller_hands_opening_to_next_survivor():
    g = make()
    g.lives = [3, 1, 3]
    open_with(g, "pair 1", dice=[1, 1, 3, 4, 6])   # B pulls and is out
    r = g.pull()
    assert r.eliminated and g.current == 2
    g.roll()
    g.peek()
    g.make_claim(parse_rank("pair 2"))
    assert g.current == 0                          # B is skipped

import builtins
import random

from liars_dice import cli
from liars_dice.game import Game, Rules


def answers(monkeypatch, *replies):
    queue = iter(replies)
    monkeypatch.setattr(builtins, "input", lambda prompt="": next(queue))


def test_read_split_takes_letters(monkeypatch):
    answers(monkeypatch, "a c")
    assert cli.read_split() == {0, 2}


def test_read_split_accepts_run_together_commas_and_capitals(monkeypatch):
    answers(monkeypatch, "BD")
    assert cli.read_split() == {1, 3}
    answers(monkeypatch, "a,e")
    assert cli.read_split() == {0, 4}


def test_read_split_blank_means_none(monkeypatch):
    answers(monkeypatch, "")
    assert cli.read_split() == set()


def test_read_split_asks_again_after_bad_input(monkeypatch, capsys):
    answers(monkeypatch, "1 2", "f", "e")
    assert cli.read_split() == {4}
    assert capsys.readouterr().out.count("dice are lettered a-e") == 2


def test_show_dice_labels_dice_with_letters(capsys):
    g = Game(["A", "B"], Rules(), rng=random.Random(1))
    g.dice[:] = [3, 2, 3, 4, 5]
    g.visible = frozenset({0})
    g.known = frozenset(range(5))
    cli.show_dice(g)
    out = capsys.readouterr().out
    assert "a:3 " in out and "b:2*" in out and "e:5*" in out

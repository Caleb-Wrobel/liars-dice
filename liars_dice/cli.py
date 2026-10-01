"""Text interface. Everyone shares the screen, so there is no hiding yet."""
from __future__ import annotations

from .bot import Bot
from .game import Game, Rules, RuleError
from .ranks import NIL, NUM_DICE, evaluate, parse_rank

# Dice are lettered so a die's name can't be mistaken for its face.
LABELS = "abcde"[:NUM_DICE]

CLAIM_HELP = ("claims: none K | pair N [K] | two pair H L [K] | three N [K] | "
              "full T P | four N [K] | five N      ([K] = optional kicker)")


def ask(prompt: str, valid: set[str] | None = None) -> str:
    while True:
        answer = input(prompt).strip().lower()
        if valid is None or answer in valid:
            return answer
        print(f"  please enter one of: {', '.join(sorted(valid))}")


def fmt(faces) -> str:
    return " ".join(str(f) for f in faces)


def show_state(game: Game) -> None:
    print()
    print("Lives: " + "   ".join(
        f"{name} {'♥' * n if n else 'out'}" for name, n in zip(game.names, game.lives)))
    if game.claim == NIL:
        print("New round, nothing to beat.")
    else:
        print(f"Standing claim: {game.claim}, by {game.names[game.claimer]}")
        print(f"Visible dice: {fmt(game.visible_faces) or '(none)'}  "
              f"({NUM_DICE - len(game.visible)} hidden)")


def show_dice(game: Game) -> None:
    """Letter, face ('?' if you haven't seen it) and set ('*' = hidden)."""
    print("  " + "  ".join(
        f"{LABELS[i]}:{face if i in game.known else '?'}{'' if i in game.visible else '*'}"
        for i, face in enumerate(game.dice)) + "   (* = hidden set)")
    if len(game.known) == NUM_DICE:
        print(f"  that's {evaluate(game.dice)}")


def show_result(game: Game, result) -> None:
    print(f"\nCup lifted! Dice: {fmt(result.dice)}  ->  {result.revealed}")
    verdict = "TRUE" if result.claim_true else "FALSE"
    print(f"{game.names[result.claimer]} claimed {result.claim}: {verdict}.")
    loser = game.names[result.loser]
    print(f"{loser} loses a life." + (f" {loser} is out!" if result.eliminated else ""))


def read_split() -> set[int]:
    while True:
        raw = input(f"Which dice ({LABELS[0]}-{LABELS[-1]}) go in the VISIBLE set? "
                    "e.g. 'a c', blank for none: ").lower()
        letters = [c for c in raw if c not in " ,"]
        if all(c in LABELS for c in letters):
            return {LABELS.index(c) for c in letters}
        print(f"  dice are lettered {LABELS[0]}-{LABELS[-1]}")


def read_claim(game: Game) -> bool:
    """Returns True once a claim is made, False if the player backs out."""
    print(CLAIM_HELP)
    while True:
        text = input(f"Your claim (must beat {game.claim}; blank to go back): ").strip()
        if not text:
            return False
        try:
            game.make_claim(parse_rank(text))
            print(f"You claim {game.claim}.")
            return True
        except (ValueError, RuleError) as err:
            print(f"  {err}")


def take_turn(game: Game) -> None:
    print(f"\n=== {game.names[game.current]}'s turn ===")
    show_state(game)
    while True:
        options = game.available()
        if options == ["pull"]:
            print("The top rank is claimed, you must pull.")
        choice = ask(f"[{' / '.join(options)}]: ", set(options))
        if choice == "pull":
            show_result(game, game.pull())
            return
        try:
            if choice == "peer":
                game.peer()
            elif choice == "rearrange":
                game.rearrange(read_split())
            elif choice == "roll":
                which = "hidden"
                if len(game.rules.rollable) > 1:
                    which = {"h": "hidden", "v": "visible"}[
                        ask("Roll the [h]idden or [v]isible set? ", {"h", "v"})]
                game.roll(which)
            elif choice == "peek":
                game.peek()
            elif choice == "claim":
                if read_claim(game):
                    return
                continue
        except RuleError as err:
            print(f"  {err}")
            continue
        show_dice(game)


def bot_turn(game: Game, bot: Bot) -> None:
    name = game.names[game.current]
    print(f"\n=== {name}'s turn ===")
    result = bot.play(game, lambda text: print(f"{name} {text}."))
    if result is not None:
        show_result(game, result)


def main() -> None:
    vs_bot = ask("Play against a bot? [Y/n]: ", {"y", "n", ""}) != "n"
    if vs_bot:
        names = [input("Your name [Alice]: ").strip() or "Alice", "Bob"]
        bots = {1: Bot()}
    else:
        count = int(input("Players [2]: ") or 2)
        names = [input(f"Name for player {i + 1}: ").strip() or f"P{i + 1}" for i in range(count)]
        bots = {}
    lives = int(input("Lives [3]: ") or 3)
    advanced = ask("Advanced rules? [y/N]: ", {"y", "n", ""}) == "y"
    game = Game(names, Rules.advanced(lives) if advanced else Rules(lives))

    while game.winner is None:
        if game.current in bots:
            bot_turn(game, bots[game.current])
        else:
            take_turn(game)
    print(f"\n{game.names[game.winner]} wins!")

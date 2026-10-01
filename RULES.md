# Liar's Dice Rules (Caleb's reading)

A game of dice and deception.

## Setup

- 2+ players, one shared set of five dice (six-sided).
- Each player starts with a number of lives (default 3, configurable).
- Dice are split into two sets: **visible** (everyone can see the faces) and
  **hidden** (only the player holding the dice can see them).

## Basic Turn Flow
A "turn" is one of the few hard and fast rule sets and follows a strict ordering such that neither the first nor last turn is an exception. The flow is:

1. Player receives a set of hidden and visible dice and is offered a claimed rank.
2. Player makes a choice:
    - Pull the cup to challenge the claim. If the revealed rank is equal to or greater than the claim, the player loses a life. If it is below the claim, the claimer loses a life. In either case the round ends.
    - Peer at the hidden set. This continues the turn and commits the player to passing a hidden and visible set of dice with a higher claim than the one they were handed.
3. Having peered, the player may rearrange the sets as they see fit.
4. The player rolls the hidden set.
5. The player peeks at the hidden set.
6. The player makes a claim strictly higher than the one they were handed and passes to the next player.

Note that: This ordering minimizes the "first turn" edge case. Logically it just starts at step 4 because they're handed a nil claim and empty sets to rearrange.

## Advanced Turn Flow
Advanced mode does not add rules, it removes requirements. The flow is the same six steps as the basic turn, with these changes:

- Step 4: The player may roll either the hidden or the visible set, or choose not to roll at all.
- Step 5: The player has the option of peeking at the hidden set.

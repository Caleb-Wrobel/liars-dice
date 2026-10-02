# Liar's Dice Rules (Caleb's reading)

This is the in-depth version, for anyone curious about the finer points. The short version, with just what you need
to play, is the **How to play** page in the game. The two follow the same order.

## The game

Liar's Dice is a dice-passing game built on claims that keep going up. A game of dice and deception.

- 2 or more players share one set of five six-sided dice.
- The dice are split into two sets: **visible** (everyone can see the faces) and **hidden** (only the player holding
  the dice can see them).
- Each player starts with a number of lives (default 3, configurable).
- On your turn you are handed the dice and the last claim, and you either challenge it or pass a higher one.

## Winning, and losing lives

You lose a life when a challenge goes against you or against your claim (see [Pulling](#pulling)).

A player with no lives is out, and is skipped from then on. The last player with lives wins.

## A turn, in detail

A "turn" is one of the few hard and fast rule sets and follows a strict ordering such that neither the first nor last
turn is an exception. The flow is:

1. Player receives a set of hidden and visible dice and is offered a claimed rank.
2. Player makes a choice:
    - Pull the cup to challenge the claim. If the revealed rank is equal to or greater than the claim, the player loses a life. If it is below the claim, the claimer loses a life. In either case the round ends.
    - Peer at the hidden set. This continues the turn and commits the player to passing a hidden and visible set of dice with a higher claim than the one they were handed.
3. Having peered, the player may rearrange the sets as they see fit.
4. The player rolls the hidden set.
5. The player peeks at the hidden set.
6. The player makes a claim strictly higher than the one they were handed and passes to the next player.

Some finer points:

- **The order is fixed, and only forward.** You may skip ahead over a step you are allowed to skip, but you can never go
  back to an earlier one.
- **You cannot peek before a roll you are required to make.** If the roll is mandatory, peeking first would leave you
  unable to roll, so it is not offered.
- **What you know.** After you peer or peek you have seen all five dice. Rolling the hidden set hides the new faces from
  you again until you peek. When you pass, the next player knows only the visible dice.
- **Claims are never checked when you make them.** Bluffing, claiming less than you hold, claiming without looking, and
  claiming something impossible are all legal. The only requirement is that a claim is strictly higher than the one
  before it.

## Pulling

When someone pulls, all five dice are revealed and the real rank is worked out from them. The claim is **true if the
revealed rank is equal to or greater than it**.

- If the claim was true, the **puller** loses a life.
- If the claim was false, the **claimer** loses a life.
- The round ends. All five dice are re-rolled into the hidden set, and the next round is opened by the surviving player
  after the puller, whoever lost the life. If the puller was eliminated, that is the next survivor after them.

If the standing claim is the top rank, five 6s, nothing can beat it, so peering is not allowed. You must pull.

## The start of a round

The base case for every round, in basic and advanced alike: the opener starts at step 4 with five random dice in the
hidden set and the visible set empty, so there is nothing to pull and nothing to rearrange. They are handed the **nil**
claim, which ranks below every real claim. The opener claims a rank against those dice.

This ordering minimizes the "first turn" edge case. Logically the first turn just starts at step 4 because the player
is handed a nil claim and empty sets to rearrange. In basic play the mandatory roll re-rolls all five dice. In advanced
play an opener who skips the roll claims blind, against the dice as they fell.

## Basic and advanced

Advanced mode does not add rules, it removes requirements. The flow is the same six steps as the basic turn, with these
changes:

- Step 4: The player may roll either the hidden or the visible set, or choose not to roll at all.
- Step 5: The player has the option of peeking at the hidden set.

| | Basic | Advanced |
|---|---|---|
| Roll | Required, hidden set only | Optional, either set |
| Peek after rolling | Required | Optional |

- **Rolling an empty set** is the same as choosing not to roll. So in advanced play it is simply skipping the roll, and
  in basic play, where rolling is mandatory, a split that leaves the hidden set empty is not allowed.
- **Blind claims.** An advanced player who skips the peek claims without having seen the dice they rolled. Because a
  claim is never tied to the dice (see [Ranks](#ranks)), a blind claim is a real bluff.

## Ranks

A **rank** is what a set of dice makes, and both the claimed rank and the revealed rank are ranks. If you have played
poker dice or Yahtzee you already know almost all of this. The categories, lowest to highest, are:

1. No pair
2. Pair
3. Two pair
4. Three of a kind
5. Full house
6. Four of a kind
7. Five of a kind

**There are no straights.** That is the one thing poker and Yahtzee have that this game does not.

- **Higher faces win within a category.** A pair of 5s beats a pair of 3s. Two pair compares the high pair, then the low
  pair. A full house compares the three of a kind, then the pair.
- **The kicker.** A rank may include one optional kicker, a die that is not part of the pair or set: "a pair of 2s and
  a 5", "no pair and a 5". A claim with no kicker ranks below the same claim with any kicker, and a higher kicker beats
  a lower one. Only no pair, pair, two pair, three of a kind and four of a kind can carry a kicker. A full house and
  five of a kind cannot.
- **A claimer's kicker is never tied to their dice.** Claiming "two 2s and a 4" while holding two 2s and a 5 is legal,
  which is what keeps a blind claim a real bluff. You may claim a lower kicker than you hold, or a higher one you do
  not have.
- **When pulled, the revealed kicker is the highest leftover die,** and the claim is true if the revealed rank is equal
  to or greater. Example: Alice blindly claims "three 4s and a 2" while holding 4 4 4 3 1. Her revealed rank is "three
  4s and a 3", which is higher than her claim, so if Bob pulls he loses a life.
- **Impossible hands are legal claims.** "No pair and a 1" is not a hand anyone can roll, because five dice with no pair
  always include something higher than a 1. It is still a legal claim, and every hand beats it, so it is always true if
  pulled. In total there are 225 distinct claims, and the only requirement on a claim is that it is strictly higher
  than the standing one.
- **Nil** is the claim handed to a round's opener. It ranks below every real claim, and any rank is at least as good as
  it.

## Tips

These are not rules, only things the rules make possible.

- **Undercalling the kicker.** Because a claim is true if the revealed rank is equal to or greater than it, you can
  safely claim a lower kicker than you hold. That leaves room for the next player. In advanced play, if they peer and
  find the dice beat your claim, they can simply claim what they really hold, skipping both the roll and the peek.
- **Claiming less than you hold** hides your strength and makes the next player climb.
- **Claiming without looking** is a gamble: the claim may fall short of the dice, or be higher than they can make.

## Terms

- **Dice**: the five dice together, the visible set plus the hidden set.
- **Rank**: what a set of dice makes, such as "a pair of 2s and a 5".
- **Claim**: the declaration of a rank. The player who makes it is the **claimer**.
- **Pull**: lifting the cup to challenge the standing claim. The player who does is the **puller**.
- **Peer**: looking at the hidden set instead of pulling. This commits you to claiming higher.
- **Peek**: the look at the hidden set after you roll (step 5).
- **Kicker**: an optional extra die in a rank, such as the 5 in "a pair of 2s and a 5".
- **Nil**: the claim a round's opener is handed, below every real claim.

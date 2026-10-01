# Liar's Dice: what RULES.md doesn't say yet (Claude's draft)

`RULES.md` is the authority for setup and for the basic and advanced turn
flows. This file records everything else the code does. Items marked
**[ASSUMED]** are guesses to confirm.

## Terms

- **Dice**: the five dice together, i.e. the visible set plus the hidden set.
- **Rank**: what a set of dice makes, such as "pair of 2s and a 5". Both the
  claimed rank and the revealed rank are ranks.
- **Claim**: the declaration of a rank. The player who makes it is the **claimer**.
- **Pull**: lifting the cup to challenge the standing claim. The player who
  does is the **puller**.
- **Peer**: looking at the hidden set instead of pulling. This commits you to
  claiming higher.
- **Peek**: the look at the hidden set after you roll (step 5).

## Ranks, lowest to highest

1. No pair
2. Pair
3. Two pair
4. Three of a kind
5. Full house
6. Four of a kind
7. Five of a kind

- No straights.
- Within a category, higher faces win. Two pair compares the high pair, then
  the low pair. A full house compares the triple, then the pair.
- **Kicker**: a rank may include one *optional* kicker: "pair of 2s and a 5",
  "no pair and a 5". A claim with no kicker ranks below the same claim with
  any kicker.
- A claimer's kicker is never tied to their dice. Claiming "two 2s and a 4"
  while holding "two 2s and a 5" is legal, which is what keeps a blind claim
  (skipping the step 5 peek) a real bluff.
- When pulled, the highest leftover die is the revealed kicker, and the claim
  is true if the revealed rank is equal or greater. Example: Alice blindly
  claims "three 4s and a 2" while holding 4 4 4 3 1. Her revealed rank is
  "three 4s and a 3", which is higher than her claim, so if Bob pulls he loses
  a life.
- Full house and five of a kind have no kicker.
- Impossible claims are legal ("no pair and a 1"). The only requirement on a
  claim is that it is strictly higher than the standing one.
- **Nil**: the claim a player is handed when opening a round. It ranks below
  every real claim, and any rank is at least as good as it.

## Pulling

- The round ends. All five dice are re-rolled into the hidden set, and the
  surviving player after the puller opens, whoever lost the life.
- If the standing claim is the top rank (five 6s), peering is not allowed.
  You must pull.

## Round start

The base case for every round, in basic and advanced alike: the opener starts
at step 4 with five random dice in the hidden set and the visible set empty,
so there is nothing to pull and nothing to rearrange. The opener claims a rank
against those dice. In basic the mandatory roll re-rolls all five. In advanced
an opener who skips the roll claims blind against the dice as they fell.

## Winning

A player with no lives is out and skipped. The last player with lives wins.

## Rolling

Rolling an empty set is the same as electing not to roll. So in advanced mode
it is simply skipping the roll, and in basic mode, where rolling is mandatory,
a split that leaves the hidden set empty is not allowed.

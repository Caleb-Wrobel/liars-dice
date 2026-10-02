import { CATEGORY_LABELS } from "@liars-dice/engine";
import { Die } from "./Die.tsx";
import { RANK_EXAMPLES, exampleName } from "./rules/content.ts";
import { useDialog } from "./useDialog.ts";

/**
 * The basics needed to play, in the order a newcomer needs them: what the game is, how you win, how you lose a
 * life, what a turn is, how the basic and advanced rules differ, and what the ranks are. The in-depth version is
 * RULES.md, in the same order, and a test keeps the two in step. `advanced`, when given, marks which version of
 * the rules the current game uses.
 */
export function RulesDialog({ onClose, advanced }: { onClose: () => void; advanced?: boolean }) {
  const closeButton = useDialog(onClose);

  const yours = (isAdvanced: boolean) => (advanced === isAdvanced ? " (your game)" : "");

  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="rules-title" className="dialog rules-dialog">
        <header className="rules-header">
          <h2 id="rules-title">How to play</h2>
          <button type="button" ref={closeButton} onClick={onClose}>
            Close
          </button>
        </header>

        <section aria-labelledby="rules-game">
          <h3 id="rules-game">The game</h3>
          <p>
            Liar's Dice is a dice-passing game built on claims that keep going up. Five dice go round the table, split
            into a <strong>visible</strong> set that everyone can see and a <strong>hidden</strong> set that only the
            player holding them can see. On your turn you take the dice and the last claim, and you either challenge
            it or pass a higher one.
          </p>
        </section>

        <section aria-labelledby="rules-win">
          <h3 id="rules-win">How you win</h3>
          <p>Everyone starts with the same number of lives. Lose them all and you're out. The last player standing wins.</p>
        </section>

        <section aria-labelledby="rules-life">
          <h3 id="rules-life">How you lose a life</h3>
          <p>
            Anyone may <strong>pull</strong> the cup to challenge the last claim. All five dice are revealed. If they
            make that rank or better, the claim was true and the <strong>puller</strong> loses a life. If they make
            less, it was a bluff and the <strong>claimer</strong> loses a life. The next round starts with the player
            after the puller.
          </p>
        </section>

        <section aria-labelledby="rules-turn">
          <h3 id="rules-turn">Your turn</h3>
          <p>
            Start with a choice: <strong>pull</strong> the cup, or <strong>peer</strong> at the hidden dice. Peering
            commits you to passing a higher claim, so you can't pull this turn. Then the turn runs in this order. You
            may skip ahead, but you can never go back.
          </p>
          <ol>
            <li>
              <strong>Pull</strong> the cup, or <strong>peer</strong> at the hidden dice.
            </li>
            <li>
              <strong>Rearrange</strong>: move dice between the visible set and the hidden set.
            </li>
            <li>
              <strong>Roll</strong> a set of dice.
            </li>
            <li>
              <strong>Peek</strong> at the hidden dice.
            </li>
            <li>
              <strong>Claim</strong> a rank strictly higher than the last one, then pass.
            </li>
          </ol>
          <p>
            A claim is never checked when you make it. Bluffing, claiming less than you hold, claiming without looking
            and claiming something impossible are all allowed. The only rule is that it must be higher.
          </p>
          <p>
            A new round starts at the roll step: the opener has five random hidden dice and nothing to beat, so they
            can't pull.
          </p>
        </section>

        <section aria-labelledby="rules-modes">
          <h3 id="rules-modes">Basic and advanced</h3>
          <p className="hint">Advanced removes requirements. It adds no rules.</p>
          <table className="modes">
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">Basic{yours(false)}</th>
                <th scope="col">Advanced{yours(true)}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Roll</th>
                <td>Required, hidden set only</td>
                <td>Optional, either set</td>
              </tr>
              <tr>
                <th scope="row">Peek after rolling</th>
                <td>Required, and the game does it for you</td>
                <td>Optional</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section aria-labelledby="rules-ranks">
          <h3 id="rules-ranks">Ranks, lowest to highest</h3>
          <p>
            If you've played poker dice or Yahtzee, you know these, minus the straights. A <strong>rank</strong> is
            what a set of dice makes.
          </p>
          <ol className="rank-ladder">
            {RANK_EXAMPLES.map((example) => (
              <li key={example.category}>
                <span className="rank-name">{CATEGORY_LABELS[example.category]}</span>
                <span className="rank-dice" aria-hidden="true">
                  {example.dice.map((face, i) => (
                    <Die key={i} face={face} label="example" />
                  ))}
                </span>
                <span className="rank-example">{exampleName(example)}</span>
              </li>
            ))}
          </ol>
          <p>
            Higher faces beat lower ones: a pair of 5s beats a pair of 3s. A claim may add a <strong>kicker</strong>, a
            die that isn't part of the pair or set, as in "a pair of 3s and a 5". You can claim any kicker you like:
            the one you hold, a lower one, or a higher one you don't have. When the dice are revealed, their kicker is
            the highest die left over, and a claim is true if the revealed rank is equal to or higher than it. The same
            claim with a higher kicker beats it, and any kicker beats none.
          </p>
          <p>Nobody can top five 6s, so if that is claimed you have to pull.</p>
        </section>
      </div>
    </div>
  );
}

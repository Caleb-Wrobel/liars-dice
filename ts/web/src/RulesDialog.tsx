import { CATEGORY_LABELS } from "@liars-dice/engine";
import { Die } from "./Die.tsx";
import { RANK_EXAMPLES, exampleName } from "./rules/content.ts";
import { useDialog } from "./useDialog.ts";

/**
 * A quick reference for the rules, in the order a player needs them. `advanced`, when given, marks
 * which version of the rules the current game uses.
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

        <p>
          Five dice are passed around the table. Each turn you either <strong>pull</strong> the cup to challenge
          the last claim, or take the dice on and <strong>claim</strong> a higher rank, whether it's true or a
          bluff. Lose a challenge and you lose a life. The last player with lives wins.
        </p>

        <section aria-labelledby="rules-words">
          <h3 id="rules-words">The words</h3>
          <dl>
            <dt>Rank</dt>
            <dd>What a set of dice makes, such as "a pair of 3s and a 5".</dd>
            <dt>Claim</dt>
            <dd>You name a rank. Nobody checks it until someone pulls.</dd>
            <dt>Pull</dt>
            <dd>Lift the cup to challenge the claim. Every die is revealed.</dd>
            <dt>Peer</dt>
            <dd>Look at the hidden dice instead of pulling. You can no longer pull this turn, so you must claim higher.</dd>
            <dt>Peek</dt>
            <dd>Look at the hidden dice again after you roll.</dd>
          </dl>
        </section>

        <section aria-labelledby="rules-turn">
          <h3 id="rules-turn">Your turn, in order</h3>
          <p className="hint">You may skip ahead, but you can never go back.</p>
          <ol>
            <li>You are handed the dice and the last claim.</li>
            <li>
              <strong>Pull</strong> the cup, or <strong>peer</strong> at the hidden dice.
            </li>
            <li>
              <strong>Rearrange</strong>: move dice between the visible set and the hidden set.
            </li>
            <li>
              <strong>Roll</strong> one of the sets.
            </li>
            <li>
              <strong>Peek</strong> at the hidden dice.
            </li>
            <li>
              <strong>Claim</strong> a rank strictly higher than the last one, then pass.
            </li>
          </ol>
          <p>
            A new round starts at step 4: the opener has five random hidden dice and nothing to beat, so they
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
                <td>Required</td>
                <td>Optional</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section aria-labelledby="rules-pull">
          <h3 id="rules-pull">When someone pulls</h3>
          <p>
            All five dice are revealed. If the real rank is <strong>equal to or higher</strong> than the claim, the
            claim was true and the <strong>puller</strong> loses a life. If it's lower, it was a bluff and the{" "}
            <strong>claimer</strong> loses a life. The next round begins with the player after the puller.
          </p>
          <p>Nobody can top five 6s, so if that is claimed you have to pull.</p>
        </section>

        <section aria-labelledby="rules-ranks">
          <h3 id="rules-ranks">Ranks, lowest to highest</h3>
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
            Higher faces beat lower ones: a pair of 5s beats a pair of 3s. A claim may add a{" "}
            <strong>kicker</strong>, the highest die left over, as in "a pair of 3s and a 5". The same claim with
            any kicker beats it without one. There are no straights.
          </p>
        </section>

        <section aria-labelledby="rules-bluff">
          <h3 id="rules-bluff">Bluffing</h3>
          <p>
            Claims are never checked when you make them, and impossible ones are allowed, like "no pair and a
            1". The only rule is that a claim must beat the one before. Claiming lower than what you hold is fine,
            and so is claiming without even looking.
          </p>
        </section>
      </div>
    </div>
  );
}

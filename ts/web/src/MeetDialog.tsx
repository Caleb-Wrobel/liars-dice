import { ARCHETYPES, drawArchetypes, type Rng } from "@liars-dice/engine";
import { useState } from "react";
import { PERSONAS, initialsOf } from "./personas/index.ts";
import { THEMES, type ThemeId } from "./theme.ts";
import { useDialog } from "./useDialog.ts";

/**
 * The characters of a table style, each with a name, a title and a short bio. It never shows how a
 * character plays beyond what the bio hints at, so players get to know them by watching.
 *
 * The cards are shuffled each time the page opens. If they always came in the archetypes' fixed order, the
 * position of a card would give its archetype away, and the same position would mean the same archetype in
 * every table style. The order stays put while the page is open. `rng` is for tests.
 */
export function MeetDialog({ theme, onClose, rng = Math.random }: { theme: ThemeId; onClose: () => void; rng?: Rng }) {
  const closeButton = useDialog(onClose);
  const [order] = useState(() => drawArchetypes(ARCHETYPES.length, rng));
  const title = THEMES.find((t) => t.id === theme)!.meet;

  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="meet-title" className="dialog meet-dialog">
        <header className="rules-header">
          <h2 id="meet-title">{title}</h2>
          <button type="button" ref={closeButton} onClick={onClose}>
            Close
          </button>
        </header>
        <ul className="meet-list">
          {order.map(({ id }) => {
            const persona = PERSONAS[theme][id];
            return (
              <li key={id} className="persona">
                <span className="initials" aria-hidden="true">
                  {initialsOf(persona.name)}
                </span>
                <div>
                  <h3>{persona.name}</h3>
                  <p className="persona-title">{persona.title}</p>
                  <p>{persona.bio}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

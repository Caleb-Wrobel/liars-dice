import { useState } from "react";
import { applyStill, isAnimated, loadStill, prefersReducedMotion, saveStill, type ThemeId } from "./theme.ts";

/**
 * A "Still scenery" checkbox for tables whose scenery moves. It is a native checkbox on purpose: a screen reader reads
 * its name and state ("Still scenery, checkbox, not checked") with no extra code, and it works from the keyboard and by
 * touch or voice. Its label names what ticking it does, so the state is never ambiguous.
 *
 * It is not shown for a table with no movement, nor to someone whose system already asks for reduced motion: they are
 * already given still scenery, and a control would only invite them to undo a choice they made on purpose.
 */
export function MotionToggle({ theme }: { theme: ThemeId }) {
  const [still, setStill] = useState(() => loadStill());
  if (!isAnimated(theme) || prefersReducedMotion()) return null;
  return (
    <label className="motion-toggle">
      <input
        type="checkbox"
        checked={still}
        onChange={(e) => {
          setStill(e.target.checked);
          saveStill(e.target.checked);
          applyStill(e.target.checked);
        }}
      />
      <span>Still scenery</span>
    </label>
  );
}

/**
 * Shown when the turn reaches a human who is not the one who last held the device. It replaces the whole table, so
 * nothing on it, not even in the accessibility tree, can be read before the right person takes over. Bots' turns never
 * come here: in hot-seat everyone may watch the bots, and players trust each other not to spy.
 */
export function Handoff({ name, onShow, onQuit }: { name: string; onShow: () => void; onQuit: () => void }) {
  return (
    <main className="handoff">
      <section className="dialog" aria-labelledby="handoff-title">
        <h1 id="handoff-title">Pass the device to {name}</h1>
        <p>The table is hidden until {name} has the device and taps the button.</p>
        <button type="button" className="primary" autoFocus onClick={onShow}>
          I'm {name}. Show the table
        </button>
        <button type="button" className="link" onClick={onQuit}>
          New game
        </button>
      </section>
    </main>
  );
}

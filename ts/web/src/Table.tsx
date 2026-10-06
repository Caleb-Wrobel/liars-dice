import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { NUM_DICE, Step, formatRank } from "@liars-dice/engine";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ClaimDice } from "./ClaimDice.tsx";
import { ClaimPicker } from "./ClaimPicker.tsx";
import { Die } from "./Die.tsx";
import { MotionToggle } from "./MotionToggle.tsx";
import { Handoff } from "./Handoff.tsx";
import { PullDialog } from "./PullDialog.tsx";
import { RulesDialog } from "./RulesDialog.tsx";
import { PACES, useSession, type Config, type Pace, type Session, type Tray } from "./session.ts";
import { DEFAULT_THEME, type ThemeId } from "./theme.ts";

const PACE_LABELS: Record<Pace, string> = { fast: "Fast", normal: "Normal", slow: "Slow", step: "Step by step" };

/** The fixed turn order, with the engine action each step stands for. */
const STEPS = [
  ["Decide", null],
  ["Rearrange", "rearrange"],
  ["Roll", "roll"],
  ["Peek", "peek"],
  ["Claim", "claim"],
] as const;

function DraggableDie({
  index,
  face,
  movable,
  onTap,
}: {
  index: number;
  face: number | null;
  movable: boolean;
  onTap: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: index,
    disabled: !movable,
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      className={`die-button${movable ? " movable" : ""}${isDragging ? " dragging" : ""}`}
      onClick={movable ? onTap : undefined}
      disabled={!movable}
      {...attributes}
      {...listeners}
    >
      <Die face={face} label={String(index + 1)} />
    </button>
  );
}

function TrayBox({ id, title, children }: { id: Tray; title: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} className={`tray tray-${id}${isOver ? " over" : ""}`} aria-label={title}>
      <h2>{title}</h2>
      <div className="tray-dice">{children}</div>
    </section>
  );
}

/** A local game: the table over a session that runs the engine on this device. */
export function Table({
  config,
  onQuit,
  onRematch,
}: {
  config: Config;
  /** Back to the setup screen. */
  onQuit: () => void;
  /** Start a fresh game with the same settings, keeping the bot pace as it is now. */
  onRematch: (pace: Pace) => void;
}) {
  const session: Session = useSession(config); // typed as a Session, so the table below cannot reach the Game
  return <TableView session={session} theme={config.theme ?? DEFAULT_THEME} onQuit={onQuit} onRematch={onRematch} />;
}

/**
 * The table, drawn from a Session alone: what the viewer may see (`session.view`) and what they can do. It does not
 * know whether the game is running here or somewhere else.
 */
export function TableView({
  session: s,
  theme,
  onQuit,
  onRematch,
}: {
  session: Session;
  theme: ThemeId;
  /** Back to the setup screen. */
  onQuit: () => void;
  /** Start a fresh game with the same settings, keeping the bot pace as it is now. Only a local game has one. */
  onRematch?: (pace: Pace) => void;
}) {
  const [showRules, setShowRules] = useState(false);
  const openRules = () => {
    s.setPaused(true); // the bots wait while you read
    setShowRules(true);
  };
  const closeRules = () => {
    setShowRules(false);
    s.setPaused(false);
  };
  const { view } = s;
  // Only the viewer's own turn has any actions, so these are empty at other times.
  const available = view.available;
  // The turn is mine when the seat to move is the one this screen is for. "A human is to move" would also hold when it
  // is another person's turn at an online table; for a local game the two come to the same thing.
  const myTurn = view.current === s.viewer && view.winner === null && s.pulled === null;
  const canArrange = myTurn && available.includes("rearrange");

  // The view already shows a face only where the viewer may see it, and null otherwise.
  const faceOf = (i: number) => view.dice[i] ?? null;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over?.id === "visible" || over?.id === "hidden") s.moveDie(Number(active.id), over.id);
  };

  const indices = Array.from({ length: NUM_DICE }, (_, i) => i);
  const dieIn = (tray: Tray) =>
    indices
      .filter((i) => s.visibleSet.has(i) === (tray === "visible"))
      .map((i) => (
        <DraggableDie
          key={i}
          index={i}
          face={faceOf(i)}
          movable={canArrange}
          onTap={() => s.moveDie(i, s.visibleSet.has(i) ? "hidden" : "visible")}
        />
      ));

  const humansOut = s.seatKinds.every((kind, i) => kind !== "human" || view.lives[i] === 0);

  const rollable = view.rules.rollable;
  const lockHint =
    available.includes("roll") && !view.rules.rollOptional
      ? "Roll the dice to see them before you claim."
      : "Peek at the hidden dice before you claim.";

  // Once the right person has tapped through a handoff, put focus on the turn so a screen reader starts there.
  const turnHeading = useRef<HTMLHeadingElement>(null);
  const wasHandoff = useRef(false);
  useEffect(() => {
    if (s.handoff !== null) wasHandoff.current = true;
    else if (wasHandoff.current) {
      wasHandoff.current = false;
      turnHeading.current?.focus();
    }
  }, [s.handoff]);

  if (s.handoff !== null) return <Handoff name={view.names[s.handoff]!} onShow={s.acceptHandoff} onQuit={onQuit} />;

  return (
    <main className="table">
      {s.humanCount > 1 && (
        <h1 className="sr-only" tabIndex={-1} ref={turnHeading}>
          {view.names[view.current]}'s turn
        </h1>
      )}
      <header className="scoreboard">
        {view.names.map((name, i) => (
          <div key={i} className={`player${view.current === i && view.winner === null ? " active" : ""}`}>
            <span className="player-name">{name}</span>
            <span className="lives" role="img" aria-label={`${view.lives[i]} lives`}>
              {view.lives[i]! > 0
                ? Array.from({ length: view.lives[i]! }, (_, k) => <span key={k} className="life" aria-hidden="true" />)
                : "out"}
            </span>
          </div>
        ))}
        <div className="table-controls">
          {s.local && (
            <label className="pace">
              Bot pace
              <select value={s.pace} onChange={(e) => s.setPace(e.target.value as Pace)}>
                {PACES.map((p) => (
                  <option key={p} value={p}>
                    {PACE_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="link" onClick={openRules}>
            Rules
          </button>
          <button type="button" className="link" onClick={onQuit}>
            {s.local ? "New game" : "Leave game"}
          </button>
          <MotionToggle theme={theme} />
        </div>
      </header>

      <section className="claim-card" aria-live="polite">
        {view.claimer === null ? (
          <p className="claim-text">New round. Open with any claim.</p>
        ) : (
          <>
            <p className="label">Standing claim</p>
            <p className="claim-text">{formatRank(view.claim)}</p>
            <ClaimDice rank={view.claim} />
            <p className="by">by {view.names[view.claimer]}</p>
          </>
        )}
        {myTurn && view.step === Step.Decide && (
          <div className="decide-buttons">
            <button type="button" className="primary" onClick={s.pullCup}>
              Pull the cup
            </button>
            {available.includes("peer") ? (
              <button type="button" onClick={s.peer}>
                Peer at the hidden dice
              </button>
            ) : (
              <p className="hint">Nothing outranks that claim, so you must pull.</p>
            )}
          </div>
        )}
        {s.botSeat !== null && (
          <div className="thinking" role="status">
            <p>
              {view.names[s.botSeat]} {s.pace === "step" ? "is waiting for you." : "is thinking…"}
            </p>
            {s.pace === "step" && (
              <button type="button" className="primary" onClick={s.nextBotStep}>
                Next move
              </button>
            )}
          </div>
        )}
        {humansOut && view.winner === null && (
          <p className="hint">
            {s.seatKinds.filter((k) => k === "human").length === 1
              ? "You're out. Watching the rest of the game."
              : "Every human is out. Watching the bots finish."}
          </p>
        )}
      </section>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="trays">
          <TrayBox id="visible" title="Visible">
            {dieIn("visible")}
          </TrayBox>
          <TrayBox id="hidden" title="Under the cup">
            {dieIn("hidden")}
          </TrayBox>
        </div>
      </DndContext>

      <ol className="step-rail" aria-label="Turn order">
        {STEPS.map(([label, action], i) => {
          const state =
            view.step > i
              ? "done"
              : view.step === i
                ? "current"
                : action !== null && available.includes(action)
                  ? "open"
                  : "";
          return (
            <li key={label} className={state}>
              {label}
            </li>
          );
        })}
      </ol>

      {myTurn && view.step !== Step.Decide && (
        <section className="actions">
          <div className="roll-buttons">
            {/* The same order as the trays above: visible first, then under the cup. Only advanced play has both rolls, so
                basic play just says Roll dice. */}
            {available.includes("roll") && rollable.includes("visible") && (
              <button type="button" disabled={s.visibleSet.size === 0} onClick={() => s.roll("visible")}>
                Roll visible dice
              </button>
            )}
            {available.includes("roll") && rollable.includes("hidden") && (
              <button
                type="button"
                disabled={NUM_DICE - s.visibleSet.size === 0}
                onClick={() => s.roll("hidden")}
              >
                {rollable.includes("visible") ? "Roll hidden dice" : "Roll dice"}
              </button>
            )}
            {available.includes("peek") && view.rules.peekOptional && (
              <button type="button" onClick={s.peek}>
                Peek at hidden dice
              </button>
            )}
          </div>
          {canArrange && <p className="hint">Drag dice between the trays, or tap one to move it.</p>}
          {available.includes("claim") ? (
            <ClaimPicker
              key={`${view.lives.join(",")}-${formatRank(view.claim)}`}
              standing={view.claim}
              onClaim={s.claim}
            />
          ) : (
            <p className="hint">{lockHint}</p>
          )}
        </section>
      )}

      {s.error && (
        <p role="alert" className="error">
          {s.error}
        </p>
      )}

      <ol className="log" aria-label="Table talk">
        {s.log.slice(-6).map((line, i) => (
          <li key={`${s.log.length}-${i}`}>{line}</li>
        ))}
      </ol>

      {showRules && <RulesDialog onClose={closeRules} advanced={view.rules.rollOptional} />}

      {s.pulled && (
        <PullDialog
          result={s.pulled}
          names={view.names}
          final={view.winner !== null}
          reveal={s.levelReveal}
          onContinue={s.dismissPull}
          onRematch={s.local && onRematch ? () => onRematch(s.pace) : undefined}
          onQuit={onQuit}
        />
      )}
    </main>
  );
}

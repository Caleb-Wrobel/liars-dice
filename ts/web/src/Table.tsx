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
import { useState, type ReactNode } from "react";
import { ClaimDice } from "./ClaimDice.tsx";
import { ClaimPicker } from "./ClaimPicker.tsx";
import { Die } from "./Die.tsx";
import { PullDialog } from "./PullDialog.tsx";
import { RulesDialog } from "./RulesDialog.tsx";
import { HUMAN, PACES, useSession, type Config, type Pace, type Tray } from "./session.ts";

const LABELS = "abcde";
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
      <Die face={face} label={LABELS[index]!} />
      <span className="die-letter" aria-hidden="true">
        {LABELS[index]}
      </span>
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
  const s = useSession(config);
  const [showRules, setShowRules] = useState(false);
  const openRules = () => {
    s.setPaused(true); // the bots wait while you read
    setShowRules(true);
  };
  const closeRules = () => {
    setShowRules(false);
    s.setPaused(false);
  };
  const { game } = s;
  const available = game.available();
  const myTurn = game.current === HUMAN && game.winner === null && s.pulled === null;
  const canArrange = myTurn && available.includes("rearrange");

  // `game.known` is whatever the current player has seen, so only trust it on your own turn.
  const known = game.current === HUMAN ? game.known : game.visible;
  const faceOf = (i: number) => (known.has(i) || s.visibleSet.has(i) ? game.dice[i]! : null);

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

  const rollable = game.rules.rollable;
  const lockHint =
    !game.rolled && !game.rules.rollOptional
      ? "Roll the hidden dice, then peek, before you claim."
      : "Peek at the hidden dice before you claim.";

  return (
    <main className="table">
      <header className="scoreboard">
        {game.names.map((name, i) => (
          <div key={i} className={`player${game.current === i && game.winner === null ? " active" : ""}`}>
            <span className="player-name">{name}</span>
            <span className="lives" role="img" aria-label={`${game.lives[i]} lives`}>
              {game.lives[i]! > 0
                ? Array.from({ length: game.lives[i]! }, (_, k) => <span key={k} className="life" aria-hidden="true" />)
                : "out"}
            </span>
          </div>
        ))}
        <div className="table-controls">
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
          <button type="button" className="link" onClick={openRules}>
            Rules
          </button>
          <button type="button" className="link" onClick={onQuit}>
            New game
          </button>
        </div>
      </header>

      <section className="claim-card" aria-live="polite">
        {game.claimer === null ? (
          <p className="claim-text">New round. Open with any claim.</p>
        ) : (
          <>
            <p className="label">Standing claim</p>
            <p className="claim-text">{formatRank(game.claim)}</p>
            <ClaimDice rank={game.claim} />
            <p className="by">by {game.names[game.claimer]}</p>
          </>
        )}
        {myTurn && game.step === Step.Decide && (
          <div className="decide-buttons">
            <button type="button" className="primary" onClick={s.pullCup}>
              Pull the cup
            </button>
            {game.canPeer ? (
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
              {game.names[s.botSeat]} {s.pace === "step" ? "is waiting for you." : "is thinking…"}
            </p>
            {s.pace === "step" && (
              <button type="button" className="primary" onClick={s.nextBotStep}>
                Next move
              </button>
            )}
          </div>
        )}
        {game.lives[HUMAN] === 0 && game.winner === null && (
          <p className="hint">You're out. Watching the rest of the game.</p>
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
            game.step > i
              ? "done"
              : game.step === i
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

      {myTurn && game.step !== Step.Decide && (
        <section className="actions">
          <div className="roll-buttons">
            {available.includes("roll") && rollable.includes("hidden") && (
              <button
                type="button"
                disabled={NUM_DICE - s.visibleSet.size === 0}
                onClick={() => s.roll("hidden")}
              >
                Roll hidden dice
              </button>
            )}
            {available.includes("roll") && rollable.includes("visible") && (
              <button type="button" disabled={s.visibleSet.size === 0} onClick={() => s.roll("visible")}>
                Roll visible dice
              </button>
            )}
            {available.includes("peek") && (
              <button type="button" onClick={s.peek}>
                Peek at hidden dice
              </button>
            )}
          </div>
          {canArrange && <p className="hint">Drag dice between the trays, or tap one to move it.</p>}
          {available.includes("claim") ? (
            <ClaimPicker
              key={`${game.lives.join(",")}-${formatRank(game.claim)}`}
              standing={game.claim}
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

      {showRules && <RulesDialog onClose={closeRules} advanced={config.advanced} />}

      {s.pulled && (
        <PullDialog
          result={s.pulled}
          names={game.names}
          final={game.winner !== null}
          reveal={
            config.level === "random"
              ? game.names.slice(1).map((name, i) => ({ name, level: s.botLevels[i]! }))
              : undefined
          }
          onContinue={s.dismissPull}
          onRematch={() => onRematch(s.pace)}
          onQuit={onQuit}
        />
      )}
    </main>
  );
}

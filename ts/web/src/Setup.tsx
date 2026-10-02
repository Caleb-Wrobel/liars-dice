import { useState } from "react";
import { BOT_LEVEL_NAMES } from "@liars-dice/engine";
import { pickPlayerName } from "./playerNames.ts";
import { RulesDialog } from "./RulesDialog.tsx";
import { BOT_NAMES, type Config, type LevelChoice, type Pace } from "./session.ts";
import { THEMES, applyTheme, loadTheme, saveTheme, type ThemeId } from "./theme.ts";

const LEVEL_BLURBS: Record<LevelChoice, string> = {
  easy: "Jumpy. Pulls on shaky claims and misreads the odds, so a truthful claim often catches it out.",
  normal: "A balanced opponent.",
  stabby: "Patient. Hides its strength, lets you climb, then stabs when your claim stops being believable.",
  random: "Each bot gets its own level, picked at random. You find out who was who when the game ends.",
};

const LEVEL_CHOICES: readonly LevelChoice[] = [...BOT_LEVEL_NAMES, "random"];

export function Setup({ onStart }: { onStart: (config: Config) => void }) {
  const [theme, setTheme] = useState<ThemeId>(() => loadTheme());
  // A random name from the table style's pool, until the player types their own.
  const [name, setName] = useState(() => pickPlayerName(theme));
  const [nameTyped, setNameTyped] = useState(false);
  const [lives, setLives] = useState(3);
  const [advanced, setAdvanced] = useState(false);
  const [opponents, setOpponents] = useState(1);
  const [level, setLevel] = useState<LevelChoice>("normal");
  const [pace, setPace] = useState<Pace>("normal");
  const [showRules, setShowRules] = useState(false);

  return (
    <main className="setup">
      <header className="setup-header">
        <h1>Liar's Dice</h1>
        <button type="button" className="link" onClick={() => setShowRules(true)}>
          How to play
        </button>
      </header>
      <p className="tagline">Pass the dice. Peer, roll, peek, claim. Bluff well.</p>
      {showRules && <RulesDialog onClose={() => setShowRules(false)} />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onStart({ name: name.trim() || pickPlayerName(theme), lives, advanced, opponents, level, pace });
        }}
      >
        <label>
          Your name
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameTyped(true);
            }}
            maxLength={16}
          />
        </label>
        <div className="field-row">
          <label>
            Lives
            <select value={lives} onChange={(e) => setLives(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Opponents
            <select value={opponents} onChange={(e) => setOpponents(Number(e.target.value))}>
              {BOT_NAMES.map((_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}: {BOT_NAMES.slice(0, i + 1).join(", ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field-row">
          <label>
            Bot level
            <select
              value={level}
              aria-describedby="level-hint"
              onChange={(e) => setLevel(e.target.value as LevelChoice)}
            >
              {LEVEL_CHOICES.map((name) => (
                <option key={name} value={name}>
                  {name[0]!.toUpperCase() + name.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Bot pace
            <select value={pace} onChange={(e) => setPace(e.target.value as Pace)}>
              <option value="fast">Fast</option>
              <option value="normal">Normal</option>
              <option value="slow">Slow, so you can watch</option>
              <option value="step">Step by step, you press Next move</option>
            </select>
          </label>
          <p id="level-hint" className="hint">
            {LEVEL_BLURBS[level]}
          </p>
        </div>
        <fieldset>
          <legend>Rules</legend>
          <label className="choice">
            <input type="radio" name="rules" checked={!advanced} onChange={() => setAdvanced(false)} />
            <span>
              <strong>Basic</strong>: you always roll the hidden dice, then peek at the result.
            </span>
          </label>
          <label className="choice">
            <input type="radio" name="rules" checked={advanced} onChange={() => setAdvanced(true)} />
            <span>
              <strong>Advanced</strong>: roll either set, or skip the roll, or skip the peek. Fewer rules, more
              mischief.
            </span>
          </label>
        </fieldset>
        <label>
          Table style
          <select
            value={theme}
            onChange={(e) => {
              const id = e.target.value as ThemeId;
              setTheme(id);
              if (!nameTyped) setName(pickPlayerName(id));
              applyTheme(id);
              saveTheme(id);
            }}
          >
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="hint">{THEMES.find((t) => t.id === theme)?.blurb}</span>
        </label>
        <button type="submit" className="primary">
          Play
        </button>
      </form>
    </main>
  );
}

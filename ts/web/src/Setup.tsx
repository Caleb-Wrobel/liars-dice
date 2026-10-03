import { useState } from "react";
import { BOT_LEVEL_NAMES } from "@liars-dice/engine";
import { ExternalLink } from "./ExternalLink.tsx";
import { COPYRIGHT, FEEDBACK_URL, LICENSE_URL, NOTICES_URL, REPO_URL } from "./links.ts";
import { MeetDialog } from "./MeetDialog.tsx";
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
  const [opponents, setOpponents] = useState(2);
  const [level, setLevel] = useState<LevelChoice>("normal");
  const [characters, setCharacters] = useState(true);
  // With characters, slow is the default so players can watch the table and get to know who they are up against.
  // Once the player picks a pace themselves, ticking or unticking the box stops changing it.
  const [pace, setPace] = useState<Pace>("slow");
  const [paceChosen, setPaceChosen] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showMeet, setShowMeet] = useState(false);

  return (
    <main className="setup">
      <header className="setup-header">
        <h1>Liar's Dice</h1>
        <nav className="setup-links" aria-label="Help and links">
          <button type="button" className="link" onClick={() => setShowRules(true)}>
            How to play
          </button>
          <ExternalLink href={FEEDBACK_URL}>Feedback</ExternalLink>
          <ExternalLink href={REPO_URL}>Source on GitHub</ExternalLink>
        </nav>
      </header>
      <p className="tagline">Pass the dice. Peer, roll, peek, claim. Bluff well.</p>
      {showRules && <RulesDialog onClose={() => setShowRules(false)} />}
      {showMeet && <MeetDialog theme={theme} onClose={() => setShowMeet(false)} />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onStart({
            name: name.trim() || pickPlayerName(theme),
            lives,
            advanced,
            opponents,
            level,
            pace,
            personas: characters,
            theme,
          });
        }}
      >
        <div className="who-row">
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
          <div className="field-row compact">
            <label>
              Lives
              <select className="digit" value={lives} onChange={(e) => setLives(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Bots
              <select className="digit" value={opponents} onChange={(e) => setOpponents(Number(e.target.value))}>
                {BOT_NAMES.map((_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <label className="choice characters">
              <input
                type="checkbox"
                checked={characters}
                aria-describedby="characters-hint"
                onChange={(e) => {
                  setCharacters(e.target.checked);
                  if (!paceChosen) setPace(e.target.checked ? "slow" : "normal");
                }}
              />
              <span>Use Characters</span>
            </label>
          </div>
        </div>
        <p id="characters-hint" className="hint">
          {characters
            ? "Your opponents are characters from this table, each with habits of their own."
            : "Your opponents are plain bots at the level you pick."}
        </p>
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
            <select
              value={pace}
              onChange={(e) => {
                setPace(e.target.value as Pace);
                setPaceChosen(true);
              }}
            >
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
        <div className="field-row">
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
          </label>
          <button type="button" className="link meet-link" onClick={() => setShowMeet(true)}>
            Meet the {THEMES.find((t) => t.id === theme)!.meet}
          </button>
          <span className="hint">{THEMES.find((t) => t.id === theme)?.blurb}</span>
        </div>
        <button type="submit" className="primary">
          Play
        </button>
      </form>
      <footer className="setup-footer">
        <small>
          {COPYRIGHT} · <ExternalLink href={LICENSE_URL}>MIT licence</ExternalLink> ·{" "}
          <ExternalLink href={NOTICES_URL}>Third-party notices</ExternalLink>
        </small>
      </footer>
    </main>
  );
}

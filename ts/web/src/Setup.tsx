import { useState } from "react";
import { BOT_LEVEL_NAMES } from "@liars-dice/engine";
import { ExternalLink } from "./ExternalLink.tsx";
import { COPYRIGHT, FEEDBACK_URL, LICENSE_URL, NOTICES_URL, REPO_URL } from "./links.ts";
import { MeetDialog } from "./MeetDialog.tsx";
import { pickPlayerName } from "./playerNames.ts";
import { RulesDialog } from "./RulesDialog.tsx";
import { BOT_NAMES, MAX_SEATS, type Config, type LevelChoice, type Pace } from "./session.ts";
import { MotionToggle } from "./MotionToggle.tsx";
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
  // Humans sharing this device: you plus the others, whose names stay blank until typed.
  const [humans, setHumans] = useState(1);
  const [otherNames, setOtherNames] = useState<readonly string[]>([]);
  const [level, setLevel] = useState<LevelChoice>("normal");
  const [characters, setCharacters] = useState(true);
  // With characters, slow is the default so players can watch the table and get to know who they are up against.
  // Once the player picks a pace themselves, ticking or unticking the box stops changing it.
  const [pace, setPace] = useState<Pace>("slow");
  const [paceChosen, setPaceChosen] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showMeet, setShowMeet] = useState(false);

  // A lone human needs a bot to play against, and a table seats at most MAX_SEATS, humans and bots together.
  const minBots = humans === 1 ? 1 : 0;
  const maxBots = Math.min(BOT_NAMES.length, MAX_SEATS - humans);
  const bots = Math.min(Math.max(opponents, minBots), maxBots);
  const botChoices = Array.from({ length: maxBots - minBots + 1 }, (_, i) => minBots + i);
  const others = Array.from({ length: humans - 1 }, (_, i) => otherNames[i] ?? "");

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
            ...(humans > 1 ? { otherHumans: others.map((n, i) => n.trim() || `Player ${i + 2}`) } : {}),
            opponents: bots,
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
              Players
              <select className="digit" value={humans} onChange={(e) => setHumans(Number(e.target.value))}>
                {Array.from({ length: MAX_SEATS }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Bots
              <select className="digit" value={bots} onChange={(e) => setOpponents(Number(e.target.value))}>
                {botChoices.map((n) => (
                  <option key={n} value={n}>
                    {n}
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
        {humans > 1 && (
          <fieldset className="other-players">
            <legend>Other players</legend>
            {others.map((other, i) => (
              <label key={i}>
                {`Player ${i + 2} name`}
                <input
                  value={other}
                  placeholder={`Player ${i + 2}`}
                  maxLength={16}
                  onChange={(e) => setOtherNames(others.map((n, k) => (k === i ? e.target.value : n)))}
                />
              </label>
            ))}
            <p className="hint">
              Players share this device and are seated at random. What you see on one turn you may remember on the
              next, so a bot between two seats of your own is for trying the game out, not for fair play.
            </p>
          </fieldset>
        )}
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
        <MotionToggle theme={theme} />
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

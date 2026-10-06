import { useEffect, useRef, useState } from "react";
import { shareLink } from "./online.ts";
import type { RoomState } from "./roomClient.ts";

/** How many lines of news the list shows; the live region only needs the newest. */
const NEWS_SHOWN = 6;

/**
 * The room before the game starts: its code to share, who is in, and for the host the button that starts it. Who
 * came and went is announced in a polite live region, since nobody is looking at the list while they wait. Marks such
 * as "host" are words, never colour alone, and the code is read out letter by letter.
 */
export function Lobby({
  state,
  onStart,
  onLeave,
}: {
  state: Pick<RoomState, "code" | "lobby" | "you" | "host" | "news" | "error">;
  onStart: () => void;
  onLeave: () => void;
}) {
  const { code, lobby, you, host, news, error } = state;
  const heading = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState("");
  // A screen reader starts at the top of the new screen.
  useEffect(() => heading.current?.focus(), []);
  if (code === null || lobby === null) return null;

  const hostName = lobby.players.find((p) => p.id === lobby.host)?.name ?? "the host";
  const copy = async (what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(what === "code" ? code : shareLink(window.location.href, code));
      setCopied(what === "code" ? "Code copied" : "Link copied");
    } catch {
      setCopied("Could not copy. Select it and copy it by hand.");
    }
  };
  const fill =
    lobby.bots === 0
      ? "The table is full."
      : lobby.bots === 1
        ? "A bot will fill the empty seat."
        : `${lobby.bots} bots will fill the empty seats.`;

  return (
    <main className="lobby">
      <h1 tabIndex={-1} ref={heading}>
        Your room
      </h1>
      <section className="claim-card room-code-card" aria-labelledby="room-code-label">
        <p id="room-code-label" className="label">
          Room code
        </p>
        <p className="room-code">
          <span aria-hidden="true">{code}</span>
          <span className="sr-only">{code.split("").join(", ")}</span>
        </p>
        <div className="room-code-buttons">
          <button type="button" onClick={() => void copy("code")}>
            Copy code
          </button>
          <button type="button" onClick={() => void copy("link")}>
            Copy link
          </button>
        </div>
        <p role="status" className="hint">
          {copied}
        </p>
      </section>
      <section aria-labelledby="players-heading">
        <h2 id="players-heading">{`Players, ${lobby.players.length} of ${lobby.capacity} seats`}</h2>
        <ul className="lobby-players">
          {lobby.players.map((p) => {
            const marks = [p.id === you ? "you" : "", p.id === lobby.host ? "host" : ""].filter(Boolean);
            return <li key={p.id}>{marks.length === 0 ? p.name : `${p.name} (${marks.join(", ")})`}</li>;
          })}
        </ul>
        <p className="hint">{fill}</p>
      </section>
      {host ? (
        <button type="button" className="primary" onClick={onStart}>
          Start game
        </button>
      ) : (
        <p>{`Waiting for ${hostName} to start the game.`}</p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <ol className="log" aria-label="Room news" aria-live="polite">
        {news.slice(-NEWS_SHOWN).map((line, i) => (
          <li key={`${news.length}-${i}`}>{line}</li>
        ))}
      </ol>
      <button type="button" className="link" onClick={onLeave}>
        Leave room
      </button>
    </main>
  );
}

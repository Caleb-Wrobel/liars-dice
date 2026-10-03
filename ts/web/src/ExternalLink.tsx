import type { ReactNode } from "react";

/**
 * A link to another site. It opens in a new tab so a game in progress is not lost, and says so to a screen reader,
 * since a new tab is not something a link announces by itself.
 */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

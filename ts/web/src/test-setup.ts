import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// Vitest has no globals here, so Testing Library can't register its own cleanup.
afterEach(cleanup);

// The default table follows the calendar (October is Spooky), so pin the date to an ordinary month and every test
// sees the Saloon unless it asks otherwise. Only the date is faked: timers and promises run for real.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 5, 15));
});
afterEach(() => vi.useRealTimers());

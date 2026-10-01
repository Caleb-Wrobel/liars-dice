import { describe, expect, it } from "vitest";
import styles from "../styles.css?raw";

describe("the layout stylesheet", () => {
  it("gives controls their own text colour instead of inheriting one", () => {
    // Inside the saloon's parchment claim card the inherited ink is dark brown, and a dark leather
    // button turned its label invisible. Every control must name its text colour.
    const rule = styles.match(/button,\s*select,\s*input\s*{([^}]*)}/);
    expect(rule, "expected a shared rule for button, select and input").not.toBeNull();
    expect(rule![1]).toMatch(/color:\s*var\(--control-ink\)/);
    expect(rule![1]).not.toMatch(/color:\s*inherit/);
  });
});

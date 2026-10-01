import { Category, formatRank, nextRank, rank } from "@liars-dice/engine";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClaimPicker } from "./ClaimPicker.tsx";

const standing = rank(Category.Pair, [3]);

describe("ClaimPicker", () => {
  it("starts on the smallest legal raise", () => {
    render(<ClaimPicker standing={standing} onClaim={() => {}} />);
    const smallest = formatRank(nextRank(standing)!);
    expect(screen.getByRole("button", { name: `Claim ${smallest}` })).toBeEnabled();
  });

  it("claims what the selects describe", async () => {
    const onClaim = vi.fn();
    render(<ClaimPicker standing={standing} onClaim={onClaim} />);
    await userEvent.selectOptions(screen.getByLabelText("Rank"), String(Category.ThreeKind));
    await userEvent.selectOptions(screen.getByLabelText("Face"), "2");
    await userEvent.selectOptions(screen.getByLabelText("Kicker"), "5");
    await userEvent.click(screen.getByRole("button", { name: /^Claim three 2s and a 5$/ }));
    expect(onClaim).toHaveBeenCalledWith(rank(Category.ThreeKind, [2], 5));
  });

  it("refuses a claim that doesn't beat the standing one", async () => {
    const onClaim = vi.fn();
    render(<ClaimPicker standing={standing} onClaim={onClaim} />);
    await userEvent.selectOptions(screen.getByLabelText("Face"), "3");
    await userEvent.selectOptions(screen.getByLabelText("Kicker"), "none");
    const button = screen.getByRole("button", { name: /^Claim a pair of 3s$/ });
    expect(button).toBeDisabled();
    expect(screen.getByText(/You must beat a pair of 3s/)).toBeInTheDocument();
  });

  it("offers the smallest raise as a shortcut", async () => {
    const onClaim = vi.fn();
    render(<ClaimPicker standing={standing} onClaim={onClaim} />);
    await userEvent.click(screen.getByRole("button", { name: /^Smallest raise/ }));
    expect(onClaim).toHaveBeenCalledWith(nextRank(standing));
  });

  it("labels the two faces of a full house and drops the kicker", async () => {
    render(<ClaimPicker standing={standing} onClaim={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText("Rank"), String(Category.FullHouse));
    expect(screen.getByLabelText("Three of")).toBeInTheDocument();
    expect(screen.getByLabelText("Pair of")).toBeInTheDocument();
    expect(screen.queryByLabelText("Kicker")).toBeNull();
  });
});

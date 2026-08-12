import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ResumeDialog } from "@/features/game/components/ResumeDialog";
import { renderWithIntl } from "./_helpers/intl";

const props = {
  homeName: "Your XI",
  awayName: "Rivals",
  score: { home: 2, away: 1 },
  minute: 67,
  onResume: vi.fn(),
  onStartOver: vi.fn(),
};

describe("ResumeDialog", () => {
  it("shows where the match was left", () => {
    renderWithIntl(<ResumeDialog {...props} />);
    expect(screen.getByText("Match in progress")).toBeInTheDocument();
    expect(screen.getByText("2–1")).toBeInTheDocument();
    expect(screen.getByText("67'")).toBeInTheDocument();
  });

  it("resumes", async () => {
    const onResume = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<ResumeDialog {...props} onResume={onResume} />);
    await user.click(screen.getByRole("button", { name: "Resume match" }));
    expect(onResume).toHaveBeenCalledOnce();
  });

  it("starts over", async () => {
    const onStartOver = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<ResumeDialog {...props} onStartOver={onStartOver} />);
    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(onStartOver).toHaveBeenCalledOnce();
  });

  it("is a labelled dialog", () => {
    renderWithIntl(<ResumeDialog {...props} />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Match in progress");
  });
});

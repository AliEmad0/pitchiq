import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ImageZoom } from "@/components/ImageZoom";
import { playerPhotoCandidates } from "@/features/players/player-photo";

import { renderWithIntl } from "./_helpers/intl";

afterEach(() => {
  cleanup();
});

/**
 * TASK-M90 — the lightbox had no failover.
 *
 * `<PlayerImage>` walks `playerPhotoCandidates` and falls to the next src on
 * error (TASK-M28), so a thumbnail never shows a broken box. `<ImageZoom>` sat
 * beside it in the same heroes taking a single `src` with no `onError`, so on a
 * hero whose first candidate 404s the two disagreed: the thumbnail recovered and
 * the lightbox behind it stayed broken (Oliver Glasner, Andoni Iraola).
 *
 * ⚠️ These assert the LIGHTBOX image, not the thumbnail. The existing
 * `player-image.test.tsx` failover assertions passed for the whole time this bug
 * was live, because they only ever looked at the thumbnail.
 */
const lightbox = () => screen.getByRole("dialog").querySelector("img");

async function openZoom(candidates: string[] | string) {
  const user = userEvent.setup();
  renderWithIntl(
    <ImageZoom src={candidates} alt="Oliver Glasner">
      <span>thumb</span>
    </ImageZoom>,
  );
  await user.click(screen.getByRole("button", { name: /enlarge image/i }));
}

describe("<ImageZoom> failover", () => {
  it("advances to the next candidate when the first fails to load", async () => {
    await openZoom(["https://cdn.example/first.png", "https://cdn.example/second.png"]);

    const img = lightbox();
    expect(img).toHaveAttribute("src", "https://cdn.example/first.png");

    // The 404 the PL CDN actually returns for these two managers.
    fireEvent.error(img!);

    expect(lightbox()).toHaveAttribute("src", "https://cdn.example/second.png");
  });

  it("walks the whole chain, not just one step", async () => {
    await openZoom(["a.png", "b.png", "c.png"]);

    fireEvent.error(lightbox()!);
    fireEvent.error(lightbox()!);

    expect(lightbox()).toHaveAttribute("src", "c.png");
  });

  it("shows the alt text instead of a broken box when every candidate fails", async () => {
    await openZoom(["a.png", "b.png"]);

    fireEvent.error(lightbox()!);
    fireEvent.error(lightbox()!);

    expect(lightbox()).toBeNull();
    expect(screen.getByRole("dialog")).toHaveTextContent("Oliver Glasner");
  });

  it("offers no zoom affordance at all when there is no usable image", () => {
    // A monogram has nothing to enlarge, so a lightbox trigger would be a lie.
    renderWithIntl(
      <ImageZoom src={[]} alt="Nobody">
        <span>thumb</span>
      </ImageZoom>,
    );

    expect(screen.queryByRole("button", { name: /enlarge image/i })).toBeNull();
    expect(screen.getByText("thumb")).toBeInTheDocument();
  });

  it("still accepts a plain string (crests pass one url)", async () => {
    await openZoom("https://cdn.example/crest.png");

    expect(lightbox()).toHaveAttribute("src", "https://cdn.example/crest.png");
  });

  it("is fed a REAL multi-candidate chain by the hero helper", () => {
    // Guards the wiring, not just the component: if a hero went back to passing
    // `resolvePlayerPhotoSrc(...)` (candidate ONE), the failover above would be
    // unreachable in production even though every test here still passed.
    const candidates = playerPhotoCandidates("44410", "https://img.example/glasner.jpg");

    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates.at(-1)).toBe("https://img.example/glasner.jpg");
  });
});

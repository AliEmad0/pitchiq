import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  PlayerImage,
  resolvePlayerPhotoSrc,
  playerPhotoCandidates,
  playerInitials,
} from "@/features/players/components/PlayerImage";

describe("PlayerImage deceased treatment (TASK-M40)", () => {
  it("grayscales the photo and shows a mourning ribbon", () => {
    const { container } = render(
      <PlayerImage player={{ name: "Diogo Jota", photo: "340950" }} size="lg" deceased />,
    );
    expect(container.querySelector("img")?.className).toContain("grayscale");
    expect(container.querySelector('[data-testid="mourning-ribbon"]')).not.toBeNull();
  });

  it("grayscales the initials fallback and shows the ribbon", () => {
    const { container } = render(
      <PlayerImage player={{ name: "Old Player", photo: null }} size="lg" deceased />,
    );
    expect(container.querySelector('[data-testid="mourning-ribbon"]')).not.toBeNull();
    // the initials span carries grayscale
    expect(container.textContent).toContain("OP");
  });

  it("renders no ribbon for a living player", () => {
    const { container } = render(
      <PlayerImage player={{ name: "Mohamed Salah", photo: "118748" }} size="lg" />,
    );
    expect(container.querySelector('[data-testid="mourning-ribbon"]')).toBeNull();
    expect(container.querySelector("img")?.className).not.toContain("grayscale");
  });
});

describe("resolvePlayerPhotoSrc / playerPhotoCandidates", () => {
  it("builds the current PL CDN URL from a numeric FPL asset code (no `p`, 110x140)", () => {
    expect(resolvePlayerPhotoSrc("223340")).toBe(
      "https://resources.premierleague.com/premierleague25/photos/players/110x140/223340.png",
    );
  });

  it("offers the legacy CDN path as a fallback candidate (TASK-M28f)", () => {
    expect(playerPhotoCandidates("223340")).toEqual([
      "https://resources.premierleague.com/premierleague25/photos/players/110x140/223340.png",
      "https://resources.premierleague.com/premierleague/photos/players/250x250/p223340.png",
    ]);
  });

  it("passes an absolute http(s) URL through unchanged (absolute-URL path)", () => {
    const url = "https://commons.wikimedia.org/player.jpg";
    expect(resolvePlayerPhotoSrc(url)).toBe(url);
    expect(playerPhotoCandidates(url)).toEqual([url]);
  });

  it("returns null/[] for empty, null, or non-numeric/non-URL strings", () => {
    expect(resolvePlayerPhotoSrc("")).toBeNull();
    expect(resolvePlayerPhotoSrc(null)).toBeNull();
    expect(resolvePlayerPhotoSrc(undefined)).toBeNull();
    expect(resolvePlayerPhotoSrc("not-a-code")).toBeNull();
    expect(playerPhotoCandidates("not-a-code")).toEqual([]);
  });
});

// TASK-M87 — a crawled portrait is a LAST-RESORT source. It must sit after every
// candidate the primary `photo` produces, so publishing one cannot restyle a
// manager whose PL-CDN headshot already loads; it only fills a genuine hole.
describe("playerPhotoCandidates fallback source (TASK-M87)", () => {
  it("appends the fallback AFTER both PL CDN candidates", () => {
    expect(
      playerPhotoCandidates("44410", "https://img.a.transfermarkt.technology/p/22891.jpg"),
    ).toEqual([
      "https://resources.premierleague.com/premierleague25/photos/players/110x140/44410.png",
      "https://resources.premierleague.com/premierleague/photos/players/250x250/p44410.png",
      "https://img.a.transfermarkt.technology/p/22891.jpg",
    ]);
  });

  it("keeps an owner-override absolute URL first, so the override stays authoritative", () => {
    // The M86 lesson: several stored photos were hand-corrected because the
    // automatic source had the wrong person (53250 carried Fernando Velasco).
    expect(
      playerPhotoCandidates(
        "https://override.example/correct.jpg",
        "https://img.a.transfermarkt.technology/wrong.jpg",
      ),
    ).toEqual([
      "https://override.example/correct.jpg",
      "https://img.a.transfermarkt.technology/wrong.jpg",
    ]);
  });

  it("uses the fallback alone when the primary yields nothing", () => {
    const tm = "https://img.a.transfermarkt.technology/p/1.jpg";
    expect(playerPhotoCandidates(null, tm)).toEqual([tm]);
    expect(playerPhotoCandidates("lm-mike-walker", tm)).toEqual([tm]);
    expect(resolvePlayerPhotoSrc("lm-mike-walker", tm)).toBe(tm);
  });

  it("never repeats a candidate the primary already produced", () => {
    const url = "https://img.a.transfermarkt.technology/p/1.jpg";
    expect(playerPhotoCandidates(url, url)).toEqual([url]);
  });

  it("ignores a fallback that is not an absolute URL", () => {
    // A bare id here would silently re-enter the PL-CDN path and mask a real gap.
    expect(playerPhotoCandidates(null, "44410")).toEqual([]);
    expect(playerPhotoCandidates(null, "")).toEqual([]);
    expect(playerPhotoCandidates("223340", undefined)).toEqual([
      "https://resources.premierleague.com/premierleague25/photos/players/110x140/223340.png",
      "https://resources.premierleague.com/premierleague/photos/players/250x250/p223340.png",
    ]);
  });
});

describe("PlayerImage falls through to a crawled portrait (TASK-M87)", () => {
  it("shows the fallback portrait once both PL CDN candidates fail", () => {
    const tm = "https://img.a.transfermarkt.technology/p/22891.jpg";
    const { container } = render(
      <PlayerImage player={{ name: "Oliver Glasner", photo: "44410", photoFallback: tm }} />,
    );
    const img = () => container.querySelector("img")!;
    expect(img().getAttribute("src")).toContain("110x140/44410.png");
    fireEvent.error(img());
    expect(img().getAttribute("src")).toContain("250x250/p44410.png");
    fireEvent.error(img());
    expect(img().getAttribute("src")).toBe(tm);
  });

  it("still lands on initials when the fallback fails too", () => {
    const { container } = render(
      <PlayerImage
        player={{ name: "Oliver Glasner", photo: "44410", photoFallback: "https://img.a.tm/x.jpg" }}
      />,
    );
    for (let i = 0; i < 3; i++) fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("OG");
  });
});

describe("playerInitials", () => {
  it("takes first + last word initials", () => {
    expect(playerInitials("Bukayo Saka")).toBe("BS");
    expect(playerInitials("Virgil van Dijk")).toBe("VD");
  });

  it("takes the first letter of a single-word name", () => {
    expect(playerInitials("Jorginho")).toBe("J");
  });

  it("returns '?' for an empty name", () => {
    expect(playerInitials("   ")).toBe("?");
  });
});

describe("<PlayerImage>", () => {
  it("renders a CDN <img> when photo is an FPL code", () => {
    const { container } = render(
      <PlayerImage player={{ name: "Mohamed Salah", photo: "118748" }} />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toContain("/110x140/118748.png");
    // no initials text when an image renders
    expect(screen.queryByText("MS")).toBeNull();
  });

  it("renders the photo URL directly when photo is an absolute URL", () => {
    const { container } = render(
      <PlayerImage player={{ name: "Some Player", photo: "https://example.com/p.jpg" }} />,
    );
    const img = container.querySelector("img");
    expect(img!.getAttribute("src")).toBe("https://example.com/p.jpg");
  });

  it("renders initials fallback when photo is null", () => {
    const { container } = render(<PlayerImage player={{ name: "Bukayo Saka", photo: null }} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("BS")).toBeInTheDocument();
  });

  it("renders initials fallback when photo is an empty string", () => {
    render(<PlayerImage player={{ name: "Cole Palmer", photo: "" }} />);
    expect(screen.getByText("CP")).toBeInTheDocument();
  });

  it("renders '?' when player is null", () => {
    render(<PlayerImage player={null} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("merges a consumer className over the default size class", () => {
    render(
      <PlayerImage player={{ name: "Cole Palmer", photo: null }} size="md" className="size-7" />,
    );
    const span = screen.getByText("CP");
    expect(span.className).toContain("size-7");
    expect(span.className).not.toContain("size-12");
  });

  it("falls through CDN candidates then to initials when all fail (onError → no broken box)", () => {
    // An FPL code has two candidates (current path, then legacy). The first error
    // falls to the legacy CDN; only when that also fails do we show initials.
    const { container } = render(
      <PlayerImage player={{ name: "Gianluigi Donnarumma", photo: "204936" }} />,
    );
    const img1 = container.querySelector("img")!;
    expect(img1.getAttribute("src")).toContain("/110x140/204936.png");
    fireEvent.error(img1);

    const img2 = container.querySelector("img")!;
    expect(img2).not.toBeNull(); // fell through to the legacy candidate, not initials
    expect(img2.getAttribute("src")).toContain("/250x250/p204936.png");
    fireEvent.error(img2);

    expect(container.querySelector("img")).toBeNull(); // both failed → initials
    expect(screen.getByText("GD")).toBeInTheDocument();
  });

  it("retries the image when the photo changes after a prior failure", () => {
    const { container, rerender } = render(
      <PlayerImage player={{ name: "Some One", photo: "https://a.example/x.jpg" }} />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull(); // fell back to initials

    // A different photo should be attempted, not stay stuck on the fallback.
    rerender(<PlayerImage player={{ name: "Some One", photo: "https://b.example/y.jpg" }} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("https://b.example/y.jpg");
  });
});

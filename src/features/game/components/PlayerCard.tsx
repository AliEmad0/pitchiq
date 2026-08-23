"use client";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  type CSSProperties,
  type ReactElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Flag } from "@/features/players/components/Flag";
import {
  type BackDesign,
  type FrontDesign,
  type ImageKind,
  pickBack,
  pickFront,
} from "@/features/game/domain/card-design";
import { displayName } from "@/features/game/domain/display-name";
import { type CardDim, type EnrichedCard, dimsFor } from "@/features/game/domain/player-card";
import { playerPhotoCandidates } from "@/features/players/player-photo";
import { clubLogo } from "@/utils/club-logo";
import { formatSeasonLabel } from "@/utils/season";

interface Props {
  card: EnrichedCard;
  reduced?: boolean;
  /**
   * Whether the card owns its own click (TASK-1810).
   *
   * ⚠️ `false` renders the FACE ONLY, as a plain element — no button, no flip, no detail
   * side. The Legacy draft needs this: there, a tap on a card means "I choose this player",
   * and a card that is itself a button cannot host that without nesting one button inside
   * another, which the HTML parser resolves by throwing the inner one away.
   */
  interactive?: boolean;
}

// Rendered as data (never a translatable string): the brand mark.
const BRAND = "φ";
const WORDMARK = "PitchIQ";

// The modern PL cutout base (transparent). Any other resolved URL — the legacy
// 250x250 fallback or a Wikimedia photo — carries a background.
const CUTOUT_BASE = "/premierleague25/photos/players/110x140/";

const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

type Fmt = (n: number | null | undefined) => string;
type Photo = { src: string | null; kind: ImageKind; onError: () => void };
type Face = { card: EnrichedCard; d: Fmt; name: string; photo: Photo };

/**
 * A season key is the START year, so a bare "2008" is ambiguous — it means 2008-09.
 * Always render the range, matching every other surface in the app. Locale is
 * pinned to English: the card face is English-only, and `bidiIsolate` is a no-op
 * for LTR so this stays a clean "2008-09".
 */
const seasonLabel = (season: number) => formatSeasonLabel(season, "en");

const clubAbbr = (name: string) =>
  (name.replace(/[^A-Za-z]/g, "").slice(0, 3) || "TBD").toUpperCase();
const footLetter = (f: string | null) =>
  f === "left" ? "L" : f === "right" ? "R" : f === "both" ? "B" : "";
const roleTags = (card: EnrichedCard): string[] =>
  [...card.altRoles.slice(0, 2), footLetter(card.foot)].filter(Boolean);
const stateClass = (k: ImageKind) =>
  k === "cutout" ? "pc-cut-s" : k === "photo" ? "pc-photo-s" : "pc-none-s";

/**
 * Resolves the player photo AND its kind reactively: a numeric FPL code is
 * assumed a transparent cutout, but if that modern image 404s we fall back to
 * the legacy candidate — which has a background — and report the kind as
 * "photo" so the card can switch from the floating-cutout layout to a full
 * bleed. A missing image resolves to nothing (no initials monogram).
 */
function usePlayerPhoto(photo: string | null): Photo {
  const candidates = playerPhotoCandidates(photo);
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [photo]);
  const src = candidates[idx] ?? null;
  const kind: ImageKind = src == null ? "none" : src.includes(CUTOUT_BASE) ? "cutout" : "photo";
  return { src, kind, onError: () => setIdx((i) => i + 1) };
}

/** Shrinks the font until the (single-line) text fits its box — never wraps. */
function FitText({ text, className }: { text: string; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useIsoLayout(() => {
    const el = ref.current;
    if (!el) return;
    el.style.fontSize = "";
    const avail = el.clientWidth;
    const full = el.scrollWidth;
    if (avail > 0 && full > avail) {
      const base = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = `${Math.max(7, (base * avail) / full - 0.4)}px`;
    }
  }, [text]);
  return (
    <div ref={ref} className={className} style={{ whiteSpace: "nowrap", overflow: "hidden" }}>
      {text}
    </div>
  );
}

function CardImg({ photo }: { photo: Photo }) {
  if (photo.src == null || photo.kind === "none") return null;
  const img = (
    <Image
      src={photo.src}
      alt=""
      fill
      sizes="200px"
      unoptimized
      draggable={false}
      onError={photo.onError}
      className={photo.kind === "photo" ? "pc-fill" : undefined}
    />
  );
  return photo.kind === "cutout" ? <span className="pc-cut">{img}</span> : img;
}

function Crest({ card }: { card: EnrichedCard }) {
  const [failed, setFailed] = useState(false);
  if (card.teamId == null || failed) return null;
  return (
    <Image
      src={clubLogo(card.teamId, card.season)}
      alt=""
      width={15}
      height={15}
      unoptimized
      className="pc-crest"
      onError={() => setFailed(true)}
    />
  );
}

// An era with no input for a dimension shows this, never a fabricated 0 — a
// goalkeeper before 2008 has no `saves`, and 0 would read as "terrible".
const EM_DASH = "–";

/** One face number, from either the shared ratings or the goalkeeper block. */
function dimValue(card: EnrichedCard, dim: CardDim): string {
  const source =
    dim.source === "gk"
      ? (card.ratings?.gk as Record<string, number | null> | undefined)
      : (card.ratings as unknown as Record<string, number | null> | undefined);
  const v = source?.[dim.key];
  return v == null ? EM_DASH : String(v);
}

// Goalkeepers get REF/HAN/KIC/POS/CMD; everyone else ATT/CRE/DEF/PHY/DIS.
const Stats = ({ card }: { card: EnrichedCard }) => (
  <div className="pc-stats">
    {dimsFor(card.role).map((dim) => (
      <div key={dim.key} className="pc-stat">
        <div className="pc-sv">{dimValue(card, dim)}</div>
        <div className="pc-sk">{dim.label}</div>
      </div>
    ))}
  </div>
);

/* ---------- Family A — Vault (gold / onyx) ---------- */
function FamilyA({ card, d, name, photo, skin }: Face & { skin: string }) {
  return (
    <div className={`pc-card pc-fam-a ${skin} ${stateClass(photo.kind)}`}>
      <div className="pc-mat" />
      <CardImg photo={photo} />
      {photo.kind === "photo" && <div className="pc-sct" />}
      <div className="pc-fade" />
      <div className="pc-a-ovr">
        <div className="pc-ovr">{d(card.ratings?.overall)}</div>
        <div className="pc-role">{card.role ?? ""}</div>
        <div className="pc-alts">
          {roleTags(card).map((r) => (
            <span key={r} className="pc-altchip">
              {r}
            </span>
          ))}
        </div>
      </div>
      <div className="pc-wm">{BRAND}</div>
      <div className="pc-a-bottom">
        <FitText text={name} className="pc-a-name" />
        <div className="pc-a-meta">
          <Flag code={card.nationalityCode} name={card.nationality} />
          <Crest card={card} />
          <span className="pc-cl">{clubAbbr(card.club)}</span>
          {card.age != null && <span>· {d(card.age)}</span>}
          <span>· {seasonLabel(card.season)}</span>
        </div>
        <div className="pc-a-stats">
          <Stats card={card} />
        </div>
      </div>
    </div>
  );
}

/* ---------- Family B — Cinematic ---------- */
function FamilyB({ card, d, name, photo, skin }: Face & { skin: string }) {
  return (
    <div className={`pc-card pc-fam-b ${skin} ${stateClass(photo.kind)}`}>
      <div className="pc-mat" />
      <CardImg photo={photo} />
      <div className="pc-b-scrim" />
      <div className="pc-b-ovr">
        <span className="pc-ovr">{d(card.ratings?.overall)}</span>
        <span className="pc-role">{card.role ?? ""}</span>
      </div>
      <div className="pc-b-tags">
        {roleTags(card).map((r) => (
          <span key={r}>{r}</span>
        ))}
      </div>
      <div className="pc-wm">{BRAND}</div>
      <div className="pc-b-bottom">
        <FitText text={name} className="pc-b-name" />
        <div className="pc-b-sub">
          <Flag code={card.nationalityCode} name={card.nationality} />
          <Crest card={card} />
          <span className="pc-b-club">
            <span className="pc-b-cn">{card.club}</span>
            <span className="pc-b-ag">
              {card.age != null
                ? `${d(card.age)} · ${seasonLabel(card.season)}`
                : seasonLabel(card.season)}
            </span>
          </span>
        </div>
        <div className="pc-b-line" />
        <Stats card={card} />
      </div>
    </div>
  );
}

/* ---------- Family C — Dossier ---------- */
function FamilyC({ card, d, name, photo, skin }: Face & { skin: string }) {
  const tagline = roleTags(card).join(" · ");
  return (
    <div className={`pc-card pc-fam-c ${skin} ${stateClass(photo.kind)}`}>
      <div className="pc-mat" style={{ background: "var(--pc-cpan)" }} />
      <div className="pc-c-photo">
        <CardImg photo={photo} />
      </div>
      <div className="pc-c-top">
        <span className="pc-ovr">{d(card.ratings?.overall)}</span>
        <span className="pc-role">{card.role ?? ""}</span>
      </div>
      <div className="pc-wm">{BRAND}</div>
      <div className="pc-c-panel">
        <FitText text={name} className="pc-c-name" />
        <div className="pc-c-meta">
          <Flag code={card.nationalityCode} name={card.nationality} />
          <Crest card={card} />
          <span>{clubAbbr(card.club)}</span>
          {card.age != null && <span>· {d(card.age)}</span>}
          <span>· {seasonLabel(card.season)}</span>
        </div>
        {tagline && <div className="pc-c-tags">{tagline}</div>}
        <div className="pc-c-stats">
          <Stats card={card} />
        </div>
      </div>
    </div>
  );
}

/* ---------- Family D — Index ---------- */
function FamilyD({ card, d, name, photo, skin }: Face & { skin: string }) {
  const tagline = roleTags(card).join(" · ");
  return (
    <div className={`pc-card pc-fam-d ${skin} ${stateClass(photo.kind)}`}>
      <div className="pc-mat" />
      <div className="pc-d-photo">
        <CardImg photo={photo} />
        <div className="pc-d-fade" />
      </div>
      <div className="pc-d-frame" />
      <div className="pc-d-ovr">
        <div className="pc-ovr">{d(card.ratings?.overall)}</div>
        <div className="pc-role">{card.role ?? ""}</div>
      </div>
      <div className="pc-wm">{BRAND}</div>
      <div className="pc-d-info">
        <FitText text={name} className="pc-d-name" />
        <div className="pc-d-meta">
          <Flag code={card.nationalityCode} name={card.nationality} />
          <Crest card={card} />
          <span>{clubAbbr(card.club)}</span>
          {card.age != null && <span>· {d(card.age)}</span>}
          <span>· {seasonLabel(card.season)}</span>
        </div>
        {tagline && <div className="pc-d-tags">{tagline}</div>}
      </div>
      <div className="pc-d-stats">
        <Stats card={card} />
      </div>
    </div>
  );
}

const FRONTS: Record<FrontDesign, (f: Face) => ReactElement> = {
  A1: (f) => <FamilyA {...f} skin="pc-gold" />,
  A2: (f) => <FamilyA {...f} skin="pc-onyx" />,
  B1: (f) => <FamilyB {...f} skin="pc-bgold" />,
  B2: (f) => <FamilyB {...f} skin="pc-bmid" />,
  B3: (f) => <FamilyB {...f} skin="pc-bbrand" />,
  C1: (f) => <FamilyC {...f} skin="pc-cream" />,
  D1: (f) => <FamilyD {...f} skin="pc-paper" />,
  D2: (f) => <FamilyD {...f} skin="pc-noir" />,
};

const BACK_STYLES: Record<BackDesign, { root: CSSProperties; ov: CSSProperties; wm: string }> = {
  K01: {
    root: { background: "repeating-linear-gradient(90deg,#141922 0 7px,#1b2333 7px 8px)" },
    ov: { background: "radial-gradient(60% 50% at 50% 40%,rgba(231,193,91,.18),transparent)" },
    wm: "#e7c15b",
  },
  K02: {
    root: { background: "radial-gradient(#d59e30,#8a5f16)" },
    ov: {
      background: "radial-gradient(rgba(255,255,255,.5) 1px,transparent 1.4px)",
      backgroundSize: "9px 9px",
    },
    wm: "#241802",
  },
  K07: {
    root: { background: "radial-gradient(120% 90% at 50% 0,#3a1030,#0a0710)" },
    ov: {
      background: "radial-gradient(rgba(224,33,138,.4) 1px,transparent 1.4px)",
      backgroundSize: "11px 11px",
    },
    wm: "#e0218a",
  },
  K09: {
    root: { background: "#0b1018" },
    ov: {
      background:
        "linear-gradient(90deg,rgba(46,197,182,.16) 1px,transparent 0),linear-gradient(0deg,rgba(46,197,182,.16) 1px,transparent 0)",
      backgroundSize: "18px 18px",
    },
    wm: "#2ec5b6",
  },
};

/** Exported for TASK-1835: Match Night deals both squads face-down on these backs. */
export function CardBack({ card, back }: { card: EnrichedCard; back: BackDesign }) {
  const s = BACK_STYLES[back];
  return (
    <div className="pc-back" style={s.root}>
      <div className="pc-back-ov" style={s.ov} />
      <div className="pc-back-wm" style={{ color: s.wm }}>
        {BRAND}
      </div>
      <div className="pc-back-word">{WORDMARK}</div>
      <div className="pc-back-yr">{seasonLabel(card.season)}</div>
    </div>
  );
}

export function PlayerCard({ card, reduced, interactive = true }: Props) {
  const t = useTranslations("game");
  const [flipped, setFlipped] = useState(false);
  // The card face is English-only in every locale (owner decision): a FUT-style card
  // is a fixed artifact, and Eastern-Arabic numerals made the same player's OVR read
  // differently per locale. `locale` is kept in the props for the accessible label.
  const d: Fmt = (n) => String(n ?? 0);
  const name = displayName(card.name);
  const reactive = usePlayerPhoto(card.photo);
  /**
   * The BAKED photo is preferred — it is pixel-accurate about cutout-vs-background, which
   * only a build-time fetch can know — but it must be recoverable.
   *
   * ⛔ Owner-reported, 2026-08-20: Andrew Robertson's card rendered with no image at all.
   * The code, the CDN and the PNG were all fine (75 kB, 220×280); what was wrong was the
   * URL BAKED BESIDE THEM. `resolvePhoto` fetches the modern CDN at build time with a
   * 4-second timeout and, on ANY failure, records the LEGACY 250×250 URL — which now
   * answers 403 for most codes. So one transient build-time timeout became a permanently
   * broken image, and because `photoKind != null` the runtime candidate chain was skipped
   * exactly where it was needed.
   *
   * ⚠️ `bakedFailed` is what makes it recoverable: the first error abandons the baked URL
   * and hands the card back to the reactive chain, which starts at the modern CDN again.
   * Passing `reactive.onError` alone did nothing — it advanced an index the `src` did not
   * come from.
   */
  const [bakedFailed, setBakedFailed] = useState(false);
  useEffect(() => setBakedFailed(false), [card.photoUrl]);
  const photo: Photo =
    card.photoKind != null && !bakedFailed
      ? {
          src: card.photoUrl ?? null,
          kind: card.photoKind,
          onError: () => setBakedFailed(true),
        }
      : reactive;
  const front = FRONTS[pickFront(card, photo.kind)]({ card, d, name, photo });

  // Face only: no button, no flip, nothing to click. The caller owns the interaction.
  if (!interactive) {
    return (
      <div dir="ltr" className="block" style={{ width: 176, aspectRatio: "11 / 16" }}>
        <div className="relative h-full w-full">{front}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      aria-label={t(flipped ? "cardDetailsAria" : "cardAria", { name: card.name })}
      // English-only face → force LTR so "· 27 · 2019" keeps its order on /ar.
      dir="ltr"
      className="block [perspective:900px]"
      style={{ width: 176, aspectRatio: "11 / 16" }}
    >
      <div
        className="relative h-full w-full [transform-style:preserve-3d]"
        style={{
          transform: flipped ? "rotateY(180deg)" : "none",
          transition: reduced ? "none" : "transform 500ms cubic-bezier(.4,0,.2,1)",
        }}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">{front}</div>
        <div
          className="absolute inset-0 [backface-visibility:hidden]"
          style={{ transform: "rotateY(180deg)" }}
        >
          <CardBack card={card} back={pickBack(card)} />
        </div>
      </div>
    </button>
  );
}

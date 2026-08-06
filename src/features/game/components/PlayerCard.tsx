"use client";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { type CSSProperties, type ReactElement, useState } from "react";
import { Flag } from "@/features/players/components/Flag";
import {
  type BackDesign,
  type FrontDesign,
  imageKind,
  pickBack,
  pickFront,
} from "@/features/game/domain/card-design";
import { displayName } from "@/features/game/domain/display-name";
import { CARD_DIMS, type EnrichedCard } from "@/features/game/domain/player-card";
import { playerPhotoCandidates } from "@/features/players/player-photo";
import { clubLogo } from "@/utils/club-logo";
import { localizeDigits } from "@/utils/format";

interface Props {
  card: EnrichedCard;
  locale: string;
  reduced?: boolean;
}

// Rendered as data (never a translatable string): a brand mark and catalogue tag.
const BRAND = "φ";
const WORDMARK = "PitchIQ";
const CAT_TAG = "PIQ";

type Fmt = (n: number | null | undefined) => string;
type Face = { card: EnrichedCard; d: Fmt; name: string };

const clubAbbr = (name: string) =>
  (name.replace(/[^A-Za-z]/g, "").slice(0, 3) || "TBD").toUpperCase();
const footLetter = (f: string | null) =>
  f === "left" ? "L" : f === "right" ? "R" : f === "both" ? "B" : "";
const roleTags = (card: EnrichedCard): string[] =>
  [...card.altRoles.slice(0, 2), footLetter(card.foot)].filter(Boolean);
const stateClass = (photo: string | null) => {
  const k = imageKind(photo);
  return k === "cutout" ? "pc-cut-s" : k === "photo" ? "pc-photo-s" : "pc-none-s";
};

/** Photo layer with the same candidate fallback as PlayerImage, but no initials —
 *  a missing image resolves to nothing (the card material shows through). */
function CardImage({ photo, variant }: { photo: string | null; variant: "fill" | "cut" }) {
  const candidates = playerPhotoCandidates(photo);
  const [idx, setIdx] = useState(0);
  const src = candidates[idx];
  if (!src) return null;
  const img = (
    <Image
      src={src}
      alt=""
      fill
      sizes="200px"
      unoptimized
      draggable={false}
      onError={() => setIdx((i) => i + 1)}
      className={variant === "fill" ? "pc-fill" : undefined}
    />
  );
  return variant === "cut" ? <span className="pc-cut">{img}</span> : img;
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

const Stats = ({ card, d }: { card: EnrichedCard; d: Fmt }) => (
  <div className="pc-stats">
    {CARD_DIMS.map((dim) => (
      <div key={dim.key} className="pc-stat">
        <div className="pc-sv">{d(card.ratings?.[dim.key])}</div>
        <div className="pc-sk">{dim.label}</div>
      </div>
    ))}
  </div>
);

const Photo = ({ card, variant }: { card: EnrichedCard; variant: "fill" | "cut" }) => {
  const k = imageKind(card.photo);
  if (variant === "fill" && k === "photo") return <CardImage photo={card.photo} variant="fill" />;
  if (variant === "cut" && k === "cutout") return <CardImage photo={card.photo} variant="cut" />;
  return null;
};

/* ---------- Family A — Vault (gold / onyx) ---------- */
function FamilyA({ card, d, name, skin }: Face & { skin: string }) {
  const photo = imageKind(card.photo);
  return (
    <div className={`pc-card pc-fam-a ${skin} ${stateClass(card.photo)}`}>
      <div className="pc-mat" />
      <Photo card={card} variant="fill" />
      {photo === "photo" && <div className="pc-sct" />}
      <Photo card={card} variant="cut" />
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
        <div className="pc-a-name">{name}</div>
        <div className="pc-a-meta">
          <Flag code={card.nationalityCode} name={card.nationality} />
          <Crest card={card} />
          <span className="pc-cl">{clubAbbr(card.club)}</span>
          {card.age != null && <span>· {d(card.age)}</span>}
          <span>· {d(card.season)}</span>
        </div>
        <div className="pc-a-stats">
          <Stats card={card} d={d} />
        </div>
      </div>
    </div>
  );
}

/* ---------- Family B — Cinematic ---------- */
function FamilyB({ card, d, name, skin }: Face & { skin: string }) {
  return (
    <div className={`pc-card pc-fam-b ${skin} ${stateClass(card.photo)}`}>
      <div className="pc-mat" />
      <Photo card={card} variant="fill" />
      <Photo card={card} variant="cut" />
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
        <div className="pc-b-name">{name}</div>
        <div className="pc-b-sub">
          <Flag code={card.nationalityCode} name={card.nationality} />
          <Crest card={card} />
          <span className="pc-b-club">
            <span className="pc-b-cn">{card.club}</span>
            <span className="pc-b-ag">
              {card.age != null ? `${d(card.age)} · ${d(card.season)}` : d(card.season)}
            </span>
          </span>
        </div>
        <div className="pc-b-line" />
        <Stats card={card} d={d} />
      </div>
    </div>
  );
}

/* ---------- Family C — Dossier ---------- */
function FamilyC({ card, d, name, skin }: Face & { skin: string }) {
  const tagline = roleTags(card).join(" ");
  return (
    <div className={`pc-card pc-fam-c ${skin} ${stateClass(card.photo)}`}>
      <div className="pc-mat" style={{ background: "var(--pc-cpan)" }} />
      <div className="pc-c-photo">
        <Photo card={card} variant="fill" />
        <Photo card={card} variant="cut" />
      </div>
      <div className="pc-c-top">
        <span className="pc-ovr">{d(card.ratings?.overall)}</span>
        <span className="pc-role">{card.role ?? ""}</span>
      </div>
      <div className="pc-wm">{BRAND}</div>
      <div className="pc-c-panel">
        <div className="pc-c-name">{name}</div>
        <div className="pc-c-meta">
          <Flag code={card.nationalityCode} name={card.nationality} />
          <Crest card={card} />
          <span>{card.club}</span>
          {card.age != null && <span>· {d(card.age)}</span>}
          {tagline && <span>· {tagline}</span>}
          <span>· {d(card.season)}</span>
        </div>
        <div className="pc-c-stats">
          <Stats card={card} d={d} />
        </div>
      </div>
    </div>
  );
}

/* ---------- Family D — Index ---------- */
function FamilyD({ card, d, name, skin }: Face & { skin: string }) {
  const tagline = roleTags(card).join(" · ");
  return (
    <div className={`pc-card pc-fam-d ${skin} ${stateClass(card.photo)}`}>
      <div className="pc-mat" />
      <div className="pc-d-photo">
        <Photo card={card} variant="fill" />
        <Photo card={card} variant="cut" />
        <div className="pc-d-fade" />
      </div>
      <div className="pc-d-frame" />
      <div className="pc-d-num">
        {CAT_TAG} · {d(card.season)}
      </div>
      <div className="pc-d-ovr">
        <div className="pc-ovr">{d(card.ratings?.overall)}</div>
        <div className="pc-role">{card.role ?? ""}</div>
      </div>
      <div className="pc-d-info">
        <div className="pc-d-name">{name}</div>
        <div className="pc-d-meta">
          <Flag code={card.nationalityCode} name={card.nationality} />
          <Crest card={card} />
          <span>{card.club}</span>
          {tagline && <span className="pc-tsep">{tagline}</span>}
        </div>
      </div>
      <div className="pc-d-stats">
        <Stats card={card} d={d} />
      </div>
      <div className="pc-wm">{BRAND}</div>
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

function CardBack({ card, back, d }: { card: EnrichedCard; back: BackDesign; d: Fmt }) {
  const s = BACK_STYLES[back];
  return (
    <div className="pc-back" style={s.root}>
      <div className="pc-back-ov" style={s.ov} />
      <div className="pc-back-wm" style={{ color: s.wm }}>
        {BRAND}
      </div>
      <div className="pc-back-word">{WORDMARK}</div>
      <div className="pc-back-yr">{d(card.season)}</div>
    </div>
  );
}

export function PlayerCard({ card, locale, reduced }: Props) {
  const t = useTranslations("game");
  const [flipped, setFlipped] = useState(false);
  const d: Fmt = (n) => localizeDigits(n ?? 0, locale);
  const name = displayName(card.name);
  const front = FRONTS[pickFront(card)]({ card, d, name });

  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      aria-label={t(flipped ? "cardDetailsAria" : "cardAria", { name: card.name })}
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
          <CardBack card={card} back={pickBack(card)} d={d} />
        </div>
      </div>
    </button>
  );
}

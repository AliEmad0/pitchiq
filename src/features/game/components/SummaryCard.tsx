"use client";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef } from "react";
import {
  CARD_H,
  CARD_W,
  FOOTER_TOP,
  scorerLayout,
  scorerLine,
  summaryFilename,
  type SummaryCardData,
} from "@/features/game/domain/summary-card";
import { localizeDigits } from "@/utils/format";

/**
 * OG proportions — the card is meant to be pasted into a chat as an image.
 *
 * ⛔ Re-exported from the domain, never restated. The scorer block's layout is computed
 * there against exactly these numbers, and a second copy here is how the two came to
 * disagree about where the footer starts.
 */
const W = CARD_W;
const H = CARD_H;

const GROUND = "#060a0f";
const LIFT = "#12202c";
const CYAN = "#22d3ee";
const WHITE = "#ffffff";
const SOFT = "#9fb3c8";
const FAINT = "rgba(159,179,200,.45)";

/**
 * The shareable match card — design concept 12, "Card Frame", chosen from the thirty.
 *
 * ⚠️ This component only PAINTS. Every decision about what the card SAYS lives in
 * `domain/summary-card.ts`, because jsdom has no 2D context and anything computed inside a
 * paint function is untestable by construction.
 */
export function SummaryCard({ data, locale }: { data: SummaryCardData; locale: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const t = useTranslations("game");
  const fullTime = t("playFullTime");

  const paint = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      // Read the app's own face rather than naming one, so the card cannot drift from the
      // UI when the font changes.
      const body = getComputedStyle(document.body);
      const sans = body.fontFamily || "system-ui, sans-serif";
      const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
      // ⛔ The app's own helper, NOT `Intl.NumberFormat(locale)`. Measured in the browser:
      // `new Intl.NumberFormat("ar").format(20260817)` returns "20,260,817" — Western
      // digits — so the card would have printed 3–1 beside a UI printing ٣–١.
      const num = (n: number) => localizeDigits(n, locale);

      const text = (
        s: string,
        x: number,
        y: number,
        o: {
          size: number;
          weight?: number;
          color?: string;
          font?: string;
          align?: CanvasTextAlign;
          spacing?: number;
        },
      ) => {
        ctx.fillStyle = o.color ?? WHITE;
        ctx.textAlign = o.spacing ? "left" : (o.align ?? "left");
        ctx.textBaseline = "alphabetic";
        ctx.font = `${o.weight ?? 400} ${o.size}px ${o.font ?? sans}`;
        if (o.spacing == null) {
          ctx.fillText(s, x, y);
          return;
        }
        // Canvas letterSpacing is not universally supported, so track manually.
        const chars = [...s];
        const widths = chars.map((c) => ctx.measureText(c).width + o.spacing!);
        const total = widths.reduce((a, b) => a + b, 0) - o.spacing!;
        let cx = o.align === "center" ? x - total / 2 : o.align === "right" ? x - total : x;
        chars.forEach((c, i) => {
          ctx.fillText(c, cx, y);
          cx += widths[i]!;
        });
      };

      /** Shrink until it fits — team names and long shapes must never overflow the frame. */
      const fitted = (s: string, max: number, start: number, weight: number, font: string) => {
        let n = start;
        for (;;) {
          ctx.font = `${weight} ${n}px ${font}`;
          if (ctx.measureText(s).width <= max || n <= 11) return n;
          n -= 1;
        }
      };

      // ---- ground + double keyline (the concept's signature) --------------
      const g = ctx.createRadialGradient(W / 2, -H * 0.1, 0, W / 2, -H * 0.1, H * 1.4);
      g.addColorStop(0, LIFT);
      g.addColorStop(1, GROUND);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = "rgba(34,211,238,.35)";
      ctx.lineWidth = 3;
      ctx.strokeRect(40, 40, W - 80, H - 80);
      ctx.strokeStyle = "rgba(34,211,238,.15)";
      ctx.lineWidth = 1;
      ctx.strokeRect(56, 56, W - 112, H - 112);

      // ---- the result -----------------------------------------------------
      text(fullTime.toUpperCase(), W / 2, 120, {
        size: 15,
        weight: 700,
        color: CYAN,
        align: "center",
        spacing: 8,
      });

      const score = `${num(data.score.home)}–${num(data.score.away)}`;
      text(score, W / 2, 285, {
        size: fitted(score, W - 260, 130, 900, mono),
        weight: 900,
        align: "center",
        font: mono,
      });

      const fixture = `${data.home}   v   ${data.away}`;
      text(fixture, W / 2, 340, {
        size: fitted(fixture, W - 200, 26, 400, sans),
        color: SOFT,
        align: "center",
      });

      ctx.fillStyle = "rgba(159,179,200,.2)";
      ctx.fillRect(W / 2 - 200, 372, 400, 2);

      // ---- scorers --------------------------------------------------------
      // ⛔ The geometry comes from `scorerLayout`, which is the only thing that knows where
      // the footer begins. Six scorers used to be painted straight through it.
      const layout = scorerLayout(data.scorers.length);
      const shown = data.scorers.slice(0, layout.shown);
      shown.forEach((s, i) => {
        const withLocalDigits = scorerLine(s).replace(/^\d+/, (d) => num(Number(d)));
        text(withLocalDigits, W / 2, layout.first + i * layout.step, {
          size: layout.size,
          color: SOFT,
          align: "center",
        });
      });
      if (layout.overflow > 0) {
        text(`+${num(layout.overflow)}`, W / 2, layout.first + shown.length * layout.step, {
          size: Math.max(13, layout.size - 3),
          color: FAINT,
          align: "center",
        });
      }

      // ---- footer ---------------------------------------------------------
      // ⚠️ A short URL, NOT the share code: a real code runs to ~150 characters and cannot
      // be set legibly here. The copied LINK is the replayable artefact, not a screenshot.
      text(`${data.formationName}  ·  ${t("playSeed")} ${num(data.seed)}`, W / 2, FOOTER_TOP, {
        size: 16,
        color: FAINT,
        align: "center",
        font: mono,
      });
      // ⛔ The route the match was actually played on — `/game/draft` cannot replay a
      // Legacy match, because it does not carry that club's cards.
      text(`${window.location.host}${data.path}`, W / 2, H - 44, {
        size: 17,
        color: "rgba(34,211,238,.55)",
        align: "center",
        font: mono,
      });
    },
    [data, locale, fullTime, t],
  );

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    // jsdom has no 2D context, and a browser may refuse one. The controls still render;
    // only the image is missing.
    if (canvas == null || ctx == null) return;

    let cancelled = false;
    const draw = () => {
      if (cancelled) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(ctx);
    };

    // ⚠️ Canvas does not repaint when a webfont arrives, so painting before the font loads
    // bakes a fallback face into the downloaded image.
    void document.fonts.ready.then(draw);
    return () => {
      cancelled = true;
    };
  }, [paint]);

  const download = () => {
    ref.current?.toBlob((blob) => {
      if (blob == null) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = summaryFilename(data);
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  return (
    <div className="mb-6">
      <canvas
        ref={ref}
        width={W}
        height={H}
        role="img"
        // Localized here too, so the accessible name matches the painted card — and so
        // the digit convention is assertable in a test, which pixels are not.
        aria-label={`${data.home} ${localizeDigits(data.score.home, locale)}–${localizeDigits(
          data.score.away,
          locale,
        )} ${data.away}`}
        className="w-full max-w-full rounded-2xl ring-1 ring-cyan-400/20"
      />
      <button
        type="button"
        onClick={download}
        className="bg-primary text-primary-foreground mt-3 rounded-md px-5 py-2 text-sm font-bold"
      >
        {t("shareDownload")}
      </button>
    </div>
  );
}

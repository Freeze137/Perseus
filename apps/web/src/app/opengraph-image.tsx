import { ImageResponse } from "next/og";
import { SITE_TAGLINE } from "@/lib/site";

/**
 * The card WhatsApp and every other unfurler paints for a PERSEUS link.
 *
 * Generated rather than committed as a PNG so it can never drift from the
 * palette in globals.css: the colours below are the same tokens the app itself
 * is built from, and a redesign that changes them changes this too.
 *
 * Deliberately no custom font. Satori has to be handed font binaries, which
 * means a fetch at build time for every deploy in exchange for a typeface
 * nobody reads at this size — the fallback sans is the honest trade.
 */
export const alt = "PERSEUS — treino de digitação";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The palette, from globals.css. */
const OBSIDIAN = "#070b0a";
const SLATE = "#101917";
const MINT = "#7df5c4";
const EMERALD = "#1db981";
const ASH = "#6e7f87";
const BONE = "#e6efea";

/**
 * Typed and untyped — the two halves the typing area is always showing.
 *
 * The spaces are non-breaking on purpose. Each fragment below is its own flex
 * child, and an ordinary leading or trailing space inside one is collapsed away
 * by the layout engine: the line comes out as "constvelocidade=palavras".
 */
const SAMPLE: ReadonlyArray<readonly [string, string]> = [
  ["const\u00A0", MINT],
  ["velocidade", MINT],
  ["\u00A0=\u00A0", MINT],
  ["palavras", ASH],
  ["\u00A0/\u00A0", ASH],
  ["minuto", ASH],
];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: OBSIDIAN,
          padding: "80px 90px",
          // The faint corner glow the app's star field leaves behind it.
          backgroundImage: `radial-gradient(1000px 520px at 88% 8%, rgba(29,185,129,0.20), transparent 65%)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              background: MINT,
              boxShadow: `0 0 40px ${MINT}`,
            }}
          />
          <div
            style={{
              fontSize: 26,
              letterSpacing: 10,
              textTransform: "uppercase",
              color: ASH,
            }}
          >
            treinador de digitação
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 168,
            fontWeight: 700,
            letterSpacing: 14,
            marginTop: 28,
            backgroundImage: `linear-gradient(120deg, ${BONE}, ${MINT} 55%, ${EMERALD})`,
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          PERSEUS
        </div>

        <div style={{ display: "flex", fontSize: 38, color: BONE, marginTop: 12 }}>
          {SITE_TAGLINE}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 56,
            padding: "28px 34px",
            borderRadius: 20,
            background: SLATE,
            border: `1px solid rgba(125,245,196,0.16)`,
            fontSize: 40,
          }}
        >
          {SAMPLE.map(([text, color]) => (
            <div key={text} style={{ display: "flex", color }}>
              {text}
            </div>
          ))}
          {/* The caret, parked where the untyped half begins. */}
          <div
            style={{
              width: 4,
              height: 46,
              marginLeft: 6,
              borderRadius: 2,
              background: MINT,
              boxShadow: `0 0 24px ${MINT}`,
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}

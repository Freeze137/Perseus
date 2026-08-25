import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/**
 * O cartão que o WhatsApp e afins desenham pro link do site.
 *
 * Gerado em vez de PNG commitado pra não descolar da paleta do globals.css.
 * As cores abaixo são os mesmos tokens do app: mexeu lá, mexe aqui.
 *
 * Sem fonte custom de propósito. O Satori precisa receber o binário da fonte,
 * o que dá um fetch por deploy em troca de uma tipografia que ninguém lê
 * nesse tamanho.
 */
export const alt = `${SITE_NAME} — treino de digitação`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Paleta, do globals.css. */
const OBSIDIAN = "#070b0a";
const SLATE = "#101917";
const MINT = "#7df5c4";
const EMERALD = "#1db981";
const ASH = "#6e7f87";
const BONE = "#e6efea";

/**
 * Digitado e não digitado, as duas metades que a área de digitação sempre mostra.
 *
 * Espaços não-quebráveis de propósito. Cada pedaço abaixo é um filho flex, e
 * espaço comum na ponta o layout engine come — sai "constvelocidade=palavras".
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
          // O brilho fraco de canto que o campo de estrelas deixa.
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

        {/* Oito letras nesse tamanho dão uns 1045px e o padding deixa 1020.
            Parece corte e não é: o que passa é o tracking do fim e a lateral
            do glifo, não tinta. Medido no cartão gerado, o último S para a
            uns 160px da borda. Passar disso aí sim come letra. */}
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
          {SITE_NAME}
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

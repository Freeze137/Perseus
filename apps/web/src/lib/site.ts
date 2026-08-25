/**
 * The origin this deploy answers from.
 *
 * Only ever read for absolute URLs that leave the page — Open Graph images, the
 * canonical link, the JSON-LD. Everything the browser fetches for itself stays
 * relative, so a preview deploy never links back at production.
 *
 * The Vercel variable is the fallback rather than the source: it names the
 * deployment, which for production is the project domain but for a preview is a
 * hash nobody will ever type. A custom domain belongs in NEXT_PUBLIC_SITE_URL.
 *
 * Empty counts as absent, and that is the whole reason this is written with a
 * helper rather than with `??`. A variable declared and left blank is what a
 * .env.example produces the first time somebody copies it, and `??` would hand
 * that empty string to `new URL()` — which fails the build with "Invalid URL"
 * and says nothing about where the empty string came from.
 */
function set(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

const vercel = set(process.env.VERCEL_PROJECT_PRODUCTION_URL);

const configured =
  set(process.env.NEXT_PUBLIC_SITE_URL) ?? (vercel ? `https://${vercel}` : undefined);

export const SITE_URL = (configured ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Nome do produto. Dois esses, igual ao domínio.
 *
 * Parece typo pra quem vê frio. Está escrito num lugar só justamente por
 * isso: não tem o que "corrigir" solto por aí.
 */
export const SITE_NAME = "PERSEUSS";

export const SITE_TAGLINE = "Treino de digitação — português, inglês e código.";

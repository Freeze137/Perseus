import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { AmbientBackground } from "@/features/ambient/ambient-background";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import "./globals.css";

// next/font self-hosts these at build time — no blocking request to a font CDN,
// and no layout shift when they land.
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

// Monospace is non-negotiable in the typing area: a proportional font would
// shift the text sideways whenever a wrong character is wider than the right one.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const DESCRIPTION =
  "Treinador de digitação em português e inglês, para texto corrido e para código. Aprenda o teclado sem olhar.";

/**
 * What a link to the site looks like somewhere else.
 *
 * `metadataBase` is what turns the relative image path Next generates into the
 * absolute URL every unfurler insists on — without it the card silently ships
 * a broken image in production and works perfectly on localhost, which is the
 * worst possible way for it to fail.
 *
 * An unfurler reads only Open Graph: no `og:image` means a bare blue
 * link, and `og:image` without width and height means the client guesses at the
 * layout and often picks the small square one. Next fills the dimensions in
 * from opengraph-image.tsx, which is why the card is generated there rather
 * than pointed at by hand.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — treino de digitação`,
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — treino de digitação`,
    description: SITE_TAGLINE,
    url: SITE_URL,
    locale: "pt_BR",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — treino de digitação`,
    description: SITE_TAGLINE,
  },
  icons: {
    // icon.png and apple-icon.png beside this file are picked up by convention;
    // named here only so the small monochrome mark has somewhere to live.
    shortcut: "/icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#05070A",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${display.variable} ${mono.variable} ${sans.variable}`}
    >
      <body>
        <AmbientBackground />
        {children}
      </body>
    </html>
  );
}

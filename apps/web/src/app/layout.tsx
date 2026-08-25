import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { ConsoleSignature } from "@/components/shell/console-signature";
import { AmbientBackground } from "@/features/ambient/ambient-background";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import "./globals.css";

// next/font hospeda no build. Sem request pra CDN de fonte e sem pulo de
// layout quando chegam.
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

// Mono é obrigatório na área de digitação: fonte proporcional empurra o texto
// pro lado toda vez que o caractere errado é mais largo que o certo.
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
 * Como o link do site aparece em outro lugar.
 *
 * `metadataBase` transforma o caminho relativo da imagem em URL absoluta.
 * Sem ele o cartão quebra em produção e funciona em localhost — o pior jeito
 * possível de falhar.
 *
 * Unfurler só lê Open Graph. Sem `og:image` vira link azul pelado; com
 * `og:image` mas sem largura e altura o cliente chuta e costuma pegar o
 * quadradinho. O Next preenche as medidas a partir do opengraph-image.tsx,
 * por isso o cartão é gerado lá e não apontado na mão.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — treino de digitação`,
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  // Vira <meta name="author"> e <link rel="author">. Crawler não abre painel
  // de configurações nem lê humans.txt.
  authors: [{ name: "Rafael Souza Costa", url: "https://github.com/Freeze137" }],
  creator: "Rafael Souza Costa",
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
    // icon.png e apple-icon.png do lado deste arquivo o Next pega sozinho.
    // Só está escrito aqui pra marca pequena ter onde morar.
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
        <ConsoleSignature />
        {children}
      </body>
    </html>
  );
}

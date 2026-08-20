import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { AmbientBackground } from "@/features/ambient/ambient-background";
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

export const metadata: Metadata = {
  title: "PERSEUS — treino de digitação",
  description:
    "Treinador de digitação em português e inglês, para texto corrido e para código. Aprenda o teclado sem olhar.",
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

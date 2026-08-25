"use client";

import { useEffect } from "react";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * The signature for whoever opens the devtools.
 *
 * This product is for people who type code, and that person opens the console
 * on sites that interest them. It is the one credit here the actual audience
 * has a real chance of finding unprompted — and it costs zero pixels, which is
 * the condition for existing at all on a screen that belongs to the text being
 * typed.
 *
 * The guard is module-level rather than effect-level: StrictMode mounts every
 * component twice in development, and a signature printed twice stops reading
 * as a signature.
 */
let signed = false;

/** From the palette in globals.css: the console cannot see CSS variables. */
const MINT = "#7df5c4";
const ASH = "#6e7f87";

export function ConsoleSignature() {
  useEffect(() => {
    if (signed) return;
    signed = true;

    console.log(
      `%c${SITE_NAME}%c\nEscrito por Rafael Souza Costa — github.com/Freeze137\n${SITE_URL.replace(/^https?:\/\//, "")} · /humans.txt`,
      `color:${MINT};font-weight:700;letter-spacing:0.3em`,
      `color:${ASH};line-height:1.7`,
    );
  }, []);

  return null;
}

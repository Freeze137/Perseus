"use client";

import { useEffect } from "react";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * Assinatura no console.
 *
 * Quem digita código abre o devtools. É o único crédito que dá pra achar
 * sozinho sem gastar pixel de tela.
 *
 * Aponta pro humans.txt em vez de despejar portfólio, GitHub e LinkedIn aqui:
 * assinatura de cinco linhas no console vira log.
 *
 * Guarda de módulo porque StrictMode monta duas vezes em dev e sai duplicado.
 */
let signed = false;

/** Da paleta do globals.css. Console não lê variável CSS. */
const MINT = "#7df5c4";
const ASH = "#6e7f87";

const host = () => SITE_URL.replace(/^https?:\/\//, "");

export function ConsoleSignature() {
  useEffect(() => {
    if (signed) return;
    signed = true;

    console.log(
      [
        `%c${SITE_NAME}%c`,
        "Escrito por Rafael Souza Costa",
        `${host()}/humans.txt`,
      ].join("\n"),
      `color:${MINT};font-weight:700;letter-spacing:0.3em`,
      `color:${ASH};line-height:1.7`,
    );
  }, []);

  return null;
}

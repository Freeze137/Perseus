"use strict";

const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

/**
 * PERSEUS numa janela própria.
 *
 * Tudo na tela é o site, sem alteração e carregado pela rede — esta casca não
 * contém cópia do treinador e por isso nunca fica atrás de um deploy. O que ela
 * acrescenta é uma janela sem barra de endereço, escura desde o primeiro
 * quadro, que trata link externo como link externo.
 *
 * Ela nasceu para abrir o socket local do Discord, que uma aba não alcança.
 * Esse motivo saiu do projeto; a janela ficou, porque continua sendo uma janela
 * melhor para digitar do que uma aba.
 */

/** Which deployment to open. Overridable for pointing the shell at localhost. */
const SITE = process.env.PERSEUS_URL ?? "https://perseuss.tech";

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    // The trainer paints its own night sky; a white flash before it loads is
    // the one thing the shell could add that the website cannot fix.
    backgroundColor: "#070b0a",
    show: false,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // The page is remote. All three of these are what keep it a page.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  void window.loadURL(SITE);

  const origin = new URL(SITE).origin;

  // A link to somewhere else opens in the real browser, where the address bar
  // is. This window has none, and a window with no address bar is not a place
  // to open a page nobody vouched for.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin === origin) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  return window;
}

app.whenReady().then(() => {
  createWindow();

  // macOS keeps the process alive with no windows; clicking the dock icon is
  // how a window comes back.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

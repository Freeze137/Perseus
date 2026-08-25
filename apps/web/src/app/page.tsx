"use client";

import type { SessionConfig } from "@perseus/contracts";
import { generate, reachableShare } from "@perseus/corpus";
import { isFinished, metrics } from "@perseus/engine";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppHeader } from "@/components/shell/app-header";
import { Drawer } from "@/components/shell/drawer";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { NewDuelPanel } from "@/features/multiplayer/new-duel-panel";
import { LiveStatsPanel } from "@/features/panels/live-stats-panel";
import { RankingPanel } from "@/features/panels/ranking-panel";
import { AccountPanel } from "@/features/auth/account-panel";
import { ResultCard } from "@/features/result/result-card";
import { useResultSync } from "@/features/sync/use-result-sync";
import {
  useSettings,
  useSettingsHydration,
} from "@/features/settings/use-settings";
import { KeyboardPanel } from "@/features/settings/keyboard-panel";
import { PerformancePanel } from "@/features/settings/performance-panel";
import { CreditsPanel } from "@/features/settings/credits-panel";
import { useFrameRate } from "@/features/settings/use-frame-rate";
import { StartBar } from "@/features/typing/start-bar";
import { TypingArea } from "@/features/typing/typing-area";
import { useTypingSession } from "@/features/typing/use-typing-session";
import { bagSeed, useBag, useBagHydration } from "@/features/typing/use-bag";

/** Live metrics refresh rate — fast enough to feel live, cheap enough to be free. */
const TICK_MS = 100;
/**
 * Quanto tempo o texto fica abaixado enquanto um cancelamento o troca. Longo o
 * bastante pra ler como ação e curto o bastante pra ninguém esperar — um
 * cancelamento que só substitui a tela parece que o app perdeu a corrida.
 */
const SWAP_MS = 150;
/** Long enough for the cleared live region to register as a change. */
const ANNOUNCE_MS = 60;

type Drawers = "ranking" | "stats" | null;

export default function Home() {
  useSettingsHydration();
  useBagHydration();

  const {
    language,
    kind,
    syntax,
    length,
    keyboardLayout,
    performance: tier,
    setKeyboardLayout,
    setLanguage,
    setPerformance,
  } = useSettings();
  const bag = useBag();
  // A seed é a posição da sacola escrita por extenso. Sai daqui na config,
  // viaja com a corrida e é o que deixa o servidor redistribuir a mesma sacola.
  const seed = bagSeed(bag);
  const [drawer, setDrawer] = useState<Drawers>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [duelOpen, setDuelOpen] = useState(false);
  const [now, setNow] = useState(0);
  const [focusSignal, setFocusSignal] = useState(0);
  const [swapping, setSwapping] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  /** Held so an unmount mid-dip cannot land a setState on a dead component. */
  const cancelTimers = useRef<number[]>([]);

  const isCode = kind === "code";

  const config = useMemo<SessionConfig>(
    // `syntax` viaja em toda config mas só é lido pelo builder de código, então
    // fica preso em null no resto — uma sintaxe perdida numa corrida de prosa
    // faria duas configs de prosa idênticas caírem em duas sementes diferentes.
    () => ({
      language,
      kind,
      length,
      seed,
      durationMs: null,
      syntax: isCode ? syntax : null,
      keyboardLayout,
    }),
    [language, kind, length, seed, isCode, syntax, keyboardLayout],
  );

  /**
   * A config de que o *texto* é montado, uma batida atrás da que os controles
   * mostram.
   *
   * Mudar uma configuração regera o alvo, o que re-renderiza todo caractere da
   * tela atrás do diálogo e faz a área de digitação remedir o cursor — um
   * reflow forçado da página inteira, no mesmo commit em que o painel de
   * configurações está tentando começar uma animação. Adiar deixa o painel
   * commitar em prioridade cheia e o texto correr atrás em prioridade baixa,
   * fora do caminho crítico da animação.
   *
   * Texto e sync leem a mesma config adiada de propósito. Eles nunca podem
   * discordar: o servidor regera o alvo a partir da config que o envio nomear,
   * então corrida mandada sob a config mais nova reproduziria contra um texto
   * que quem digitou nunca viu, e seria recusada.
   */
  const deferredConfig = useDeferredValue(config);
  const text = useMemo(() => generate(deferredConfig), [deferredConfig]);
  const { session, input, backspace, restart } = useTypingSession(text, {
    autoIndent: isCode,
  });

  const running = session.startedAt !== null && !isFinished(session);
  // Amostrado só enquanto se digita, e só num nível que ainda tem o que
  // entregar — no 'minimal' não há oferta a fazer, então não há motivo pra
  // gastar um callback de frame descobrindo.
  const frames = useFrameRate(running && tier !== "minimal");
  const done = isFinished(session);
  // Dispara uma vez por corrida terminada. Desligado quando não há Supabase.
  const sync = useResultSync(session, deferredConfig);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(performance.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [running]);

  /**
   * Tira as próximas frases da sacola.
   *
   * Anda o cursor pelo tanto que a corrida atual consumiu, e não por um número
   * fixo: uma corrida de 180 caracteres come três frases e uma de 600 come
   * dez. Andar menos repetiria; andar mais puliria frases que ninguém viu.
   */
  const newTest = useCallback(
    () => bag.next(deferredConfig),
    [bag, deferredConfig],
  );
  const takeFocusBack = useCallback(() => setFocusSignal((n) => n + 1), []);

  /**
   * Escape sai fora da corrida.
   *
   * De propósito não é a mesma tecla de recomeçar. Enter repete o texto com que
   * você acabou de brigar; Escape abandona e sorteia outro. Juntar os dois
   * faria a única saída de um texto ruim ser uma corrida que você não queria
   * repetir.
   *
   * Nada é registrado na saída: resetSession() joga fora as teclas e o relógio
   * antes de existir resultado, então corrida abandonada não pode ser pontuada,
   * enviada nem classificada. Também não emite tecla, e é isso que impede o
   * campo de estrelas de piscar por uma corrida que está sendo descartada.
   */
  const cancelRun = useCallback(() => {
    // Painel aberto é dono do Escape — o aperto que o fecha para ali.
    if (drawer !== null || settingsOpen || duelOpen) return;
    // Nada em andamento: sem reset, sem semente nova, sem render nenhum.
    if (!running) return;
    // Reset e avanço juntos: o avanço é quem fornece texto novo, o reset é
    // quem garante sessão limpa mesmo se uma semente um dia repetir o texto.
    restart();
    bag.next(deferredConfig);

    setSwapping(true);
    // Limpo antes de ser escrito: uma região viva não fala nada quando o texto
    // que ela já tem é atribuído de novo, e cancelar duas vezes seguidas tem
    // que ser audível nas duas.
    setAnnouncement("");
    cancelTimers.current.forEach(window.clearTimeout);
    cancelTimers.current = [
      window.setTimeout(() => setSwapping(false), SWAP_MS),
      window.setTimeout(
        () => setAnnouncement("Digitação cancelada. Texto novo carregado."),
        ANNOUNCE_MS,
      ),
    ];
    // `bag` e `deferredConfig` entram aqui porque o avanço lê os dois. Sem
    // eles o Esc andaria a partir do cursor que existia quando este callback
    // foi criado, e cancelar duas vezes seguidas devolveria o mesmo texto.
  }, [drawer, settingsOpen, duelOpen, running, restart, bag, deferredConfig]);

  useEffect(
    () => () => cancelTimers.current.forEach(window.clearTimeout),
    [],
  );

  const closeDrawer = useCallback(() => {
    setDrawer(null);
    takeFocusBack();
  }, [takeFocusBack]);

  const stats = metrics(session, now);
  // O que o teclado custa nesta corrida específica, e não uma frase sobre
  // teclado em geral. Números iguais querem dizer que não custa nada e o painel
  // não fala nada — a consequência só aparece onde ela existe.
  const share = reachableShare(config);

  return (
    <div className="relative z-10 flex h-dvh flex-col">
      <AppHeader
        dimmed={running}
        onOpenRanking={() => setDrawer("ranking")}
        onOpenDuel={() => setDuelOpen(true)}
        onOpenStats={() => setDrawer("stats")}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* One column, centred. The text is the interface; everything else is
          summoned when wanted and gone the rest of the time. */}
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-8 px-6 pb-16">
        {/* Cancelling is silent on screen by design — the text simply changes.
            Without this the only feedback is visual, and there is none to hear. */}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>

        <StartBar onNewText={newTest} dimmed={running} />

        {done ? (
          <ResultCard
            session={session}
            kind={kind}
            sync={sync}
            frames={frames}
            tier={tier}
            onEase={() => setPerformance(tier === "full" ? "light" : "minimal")}
            onRestart={restart}
            onNewText={newTest}
          />
        ) : (
          <>
            <div className="flex items-end justify-between">
              <p className="flex items-baseline gap-2">
                <span className="display text-7xl tabular-nums text-mint">
                  {Math.round(stats.wpm)}
                </span>
                <span className="label">ppm</span>
              </p>
              {/* Lives in the HUD rather than the start bar: the start bar is
                  down to a quarter opacity by the time this matters. */}
              <p
                data-visible={running}
                className="pb-1 font-mono text-xs tracking-wide text-ash opacity-0 transition-opacity duration-200 data-[visible=true]:opacity-70"
              >
                {/* A tecla em caixa alta, a ação em caixa baixa: quem procura
                    isto no meio de uma corrida está procurando a tecla, e ela
                    precisa saltar antes da frase que a explica. */}
                <span className="uppercase tracking-wider text-bone">esc</span>{" "}
                — cancelar
              </p>
              <p className="flex items-baseline gap-2">
                <span className="display text-2xl tabular-nums text-bone">
                  {Math.round(stats.accuracy)}%
                </span>
                <span className="label">precisão</span>
              </p>
            </div>

            <TypingArea
              session={session}
              layout={isCode ? "code" : "prose"}
              onInput={input}
              onBackspace={backspace}
              onRestart={restart}
              onCancel={cancelRun}
              swapping={swapping}
              focusSignal={focusSignal}
            />

            <div className="flex items-center justify-center gap-4">
              <Button variant="quiet" size="sm" onClick={restart}>
                ⏎ Reiniciar
              </Button>
              <span aria-hidden="true" className="h-4 w-px bg-slate" />
              <Button variant="quiet" size="sm" onClick={newTest}>
                Novo texto
              </Button>
            </div>
          </>
        )}
      </main>

      <Drawer
        open={drawer === "ranking"}
        onClose={closeDrawer}
        title="Ranking"
        side="left"
      >
        <RankingPanel kind={kind} language={language} syntax={syntax} />
      </Drawer>

      <Drawer
        open={drawer === "stats"}
        onClose={closeDrawer}
        title="Nesta sessão"
        side="right"
      >
        <LiveStatsPanel session={session} now={now} />
      </Drawer>

      <Modal
        open={duelOpen}
        onClose={() => {
          setDuelOpen(false);
          takeFocusBack();
        }}
        title="Duelo"
      >
        <NewDuelPanel />
      </Modal>

      <Modal
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          takeFocusBack();
        }}
        title="Configurações"
      >
        <div className="flex flex-col gap-4">
          <AccountPanel />

          <div className="rule" />

          {/* The syntax picker moved to the start bar, beside the mode that
              gives it meaning. What stays here is the hardware — set once, on
              the day the machine was set up — rather than a per-run choice. */}
          <KeyboardPanel
            layout={keyboardLayout}
            onLayoutChange={setKeyboardLayout}
            share={share}
            onUseEnglish={() => setLanguage("en")}
          />

          <div className="rule" />

          <PerformancePanel tier={tier} onTierChange={setPerformance} />
          {/* "Mostrar teclado" used to live here, switching nothing: the
              keyboard it refers to does not exist yet. The preference stays in
              the store, ready for it — a control that lies is worse than one
              that is missing. */}
          <p className="text-sm leading-relaxed text-ash">
            O mapa estelar do teclado e os testes por tempo chegam nas próximas
            fases. Ranking online e partidas com amigos vêm com elas.
          </p>

          <div className="rule" />

          <CreditsPanel />
        </div>
      </Modal>
    </div>
  );
}

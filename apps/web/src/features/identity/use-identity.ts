"use client";

import {
  TIER_ORDER,
  type Identity,
  type Patente,
  type PlayerCredentials,
  type Standing,
  type TierId,
} from "@perseus/contracts";
import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createPlayer,
  readIdentity,
  recoverPlayer,
  type ApiError,
} from "@/lib/api";

/**
 * Uma patente que acabou de nascer ou de subir de degrau.
 *
 * O que o anúncio precisa saber, e nada além: qual patente é agora, e de onde
 * ela veio. `previousTier` nulo é a primeira de uma família — a quinta corrida
 * válida —, e é o único caso em que a frase é "sua patente é" em vez de "você
 * subiu para".
 */
export type PatenteArrival = {
  patente: Patente;
  previousTier: TierId | null;
};

/**
 * O passaporte, como o navegador o guarda.
 *
 * Uma string, e só ela: `<id do jogador>.<assinatura>`. Não é a identidade — a
 * identidade inteira mora no servidor, com as corridas e a patente. Isto é a
 * chave que prova qual delas é a sua, e é por isso que perdê-la não perde nada
 * além da prova: o código de recuperação emite outra.
 *
 * Fica no `localStorage`, que sobrevive a fechar o navegador e a desligar a
 * máquina, e não sobrevive a limpar os dados do site, a uma janela anônima nem
 * a outro computador. Essa lista é exatamente a razão de o código de
 * recuperação existir, e é dita na cara de quem cria uma identidade em vez de
 * ficar escrita só aqui.
 */
type IdentityStore = {
  passport: string | null;
  /** O cartão, como o servidor o devolveu. Null enquanto não foi lido. */
  identity: Identity | null;
  /**
   * O código de recuperação, enquanto a tela que o mostra está aberta.
   *
   * Fora do `persist` de propósito — ver o `partialize` lá embaixo. Ele existe
   * na memória desta aba e morre com ela: guardá-lo em disco desfaria a única
   * propriedade que ele tem, que é o servidor não conseguir mostrá-lo de novo.
   */
  freshCode: string | null;
  /** A patente a anunciar, enquanto ninguém fechou o anúncio. */
  arrival: PatenteArrival | null;
  /**
   * O que já foi anunciado nesta aba, como `família:degrau`.
   *
   * Sem isto, toda releitura do cartão depois do anúncio traria a mesma patente
   * "nova" e reabriria a janela que a pessoa acabou de fechar — e o duelo relê o
   * cartão mais de uma vez de propósito, esperando a corrida cair no ranking.
   */
  announced: string | null;
  setPassport: (passport: string | null) => void;
  setIdentity: (identity: Identity | null) => void;
  clearCode: () => void;
};

const useStore = create<IdentityStore>()(
  persist(
    (set) => ({
      passport: null,
      identity: null,
      freshCode: null,
      arrival: null,
      announced: null,
      setPassport: (passport) =>
        set({ passport, identity: null, arrival: null, announced: null }),
      setIdentity: (identity) => set({ identity }),
      clearCode: () => set({ freshCode: null }),
    }),
    {
      name: "perseus:passport",
      // Só o passaporte é guardado. O cartão é cache de rede e é relido; o
      // código de recuperação não pode tocar o disco.
      partialize: (state) => ({ passport: state.passport }),
      skipHydration: true,
    },
  ),
);

/** Lido uma vez no cliente, como o resto das preferências. */
export function useIdentityHydration(): void {
  useEffect(() => {
    void useStore.persist.rehydrate();
  }, []);
}

export type IdentityState = {
  passport: string | null;
  identity: Identity | null;
  /** O código recém-criado, pra tela que tem que mostrá-lo uma vez. */
  freshCode: string | null;
};

export function useIdentity(): IdentityState {
  const passport = useStore((state) => state.passport);
  const identity = useStore((state) => state.identity);
  const freshCode = useStore((state) => state.freshCode);

  /**
   * Relê o cartão quando o passaporte muda, e mais nada.
   *
   * Sem intervalo e sem revalidação em foco: a patente muda quando *você*
   * corre, e é a própria resposta do envio que traz a versão nova. Ficar
   * perguntando ao servidor o que ele acabou de contar seria gastar rede pra
   * chegar na mesma resposta.
   */
  useEffect(() => {
    if (!passport) return;
    let alive = true;
    readIdentity(passport)
      .then((next) => {
        if (alive) useStore.setState({ identity: next });
      })
      .catch((error: ApiError) => {
        // 401 é passaporte que este servidor não assinou — outro deploy, outro
        // segredo, ou uma string mexida à mão. Some com ele em vez de deixar a
        // interface prometer uma identidade que não existe mais.
        if (alive && error.status === 401) {
          useStore.setState({ passport: null, identity: null });
        }
      });
    return () => {
      alive = false;
    };
  }, [passport]);

  return { passport, identity, freshCode };
}

/** Cria a identidade e guarda as duas chaves — uma no disco, outra na tela. */
export async function claimName(username: string): Promise<PlayerCredentials> {
  const credentials = await createPlayer(username);
  useStore.setState({
    passport: encode(credentials),
    identity: null,
    freshCode: credentials.recoveryCode,
  });
  return credentials;
}

/** Volta a ser quem você era, nesta máquina. */
export async function restoreName(code: string): Promise<PlayerCredentials> {
  const credentials = await recoverPlayer(code);
  // Sem `freshCode`: recuperar não sorteia um código novo. O que a pessoa
  // acabou de usar continua sendo o dela, e mostrar um segundo aqui faria
  // parecer que o primeiro morreu.
  useStore.setState({ passport: encode(credentials), identity: null });
  return credentials;
}

/**
 * Esquece o passaporte nesta máquina.
 *
 * Não apaga identidade nenhuma, e a tela diz isso: as corridas e a patente
 * continuam no servidor, e o código de recuperação traz tudo de volta. É o
 * equivalente honesto de "sair" num produto que não tem contas pra fechar.
 */
export function forgetPassport(): void {
  useStore.setState({
    passport: null,
    identity: null,
    freshCode: null,
    arrival: null,
    announced: null,
  });
}

/**
 * Relê o cartão e, se a patente mudou, guarda o que anunciar.
 *
 * O cartão do servidor é a fonte, e não o que esta aba achava que era verdade:
 * a comparação é entre o que já estava lido e o que acabou de chegar, por
 * família. Patente que nasce — a quinta corrida válida — e patente que troca de
 * degrau são o mesmo evento visto do mesmo lugar, e é por isso que só existe um
 * caminho aqui.
 *
 * Não anuncia nada quando ainda não havia cartão lido. A primeira leitura de
 * uma aba recém-aberta traria a patente inteira como novidade, e abrir o
 * anúncio a cada visita transformaria a conquista em aviso de cookie.
 */
export async function refreshIdentity(
  passport: string,
  options: { announce?: boolean } = {},
): Promise<Identity | null> {
  const before = useStore.getState().identity;
  let next: Identity;
  try {
    next = await readIdentity(passport);
  } catch (error) {
    // 401 é passaporte que este servidor não assinou. Mesma decisão do efeito
    // de leitura: some com ele em vez de deixar a interface prometer uma
    // identidade que não existe mais.
    if ((error as ApiError).status === 401) {
      useStore.setState({ passport: null, identity: null });
    }
    return null;
  }

  useStore.setState({ identity: next });
  if (options.announce === false || !before) return next;

  for (const patente of next.patentes) {
    const previous = before.patentes.find(
      (one) => one.family === patente.family,
    );
    if (!rose(previous?.tier ?? null, patente.tier)) continue;
    announce({ patente, previousTier: previous?.tier ?? null });
    break;
  }
  return next;
}

/**
 * Anuncia a patente que a resposta de um envio solo já trouxe.
 *
 * O solo não precisa reler nada: o servidor devolve a classificação na mesma
 * ida e volta, com o degrau anterior dentro. Pedir o cartão de novo pra
 * descobrir o que a resposta já disse seria uma requisição paga pra chegar na
 * mesma frase.
 */
export function announceStanding(standing: Standing): void {
  const { patente, previousTier } = standing;
  if (!patente || !rose(previousTier, patente.tier)) return;
  announce({ patente, previousTier });
}

/**
 * Se a patente subiu — nasceu, ou passou pra um degrau mais quente.
 *
 * Descer também é uma mudança de degrau, e não é um anúncio. A patente é a
 * média das cinco últimas corridas válidas, então ela desce sozinha depois de
 * uma tarde ruim, e uma janela no meio da tela dizendo isso seria o produto
 * interrompendo alguém pra apontar que ele piorou. O painel continua mostrando
 * a verdade; ela só não vira evento.
 */
function rose(previous: TierId | null, next: TierId): boolean {
  if (previous === null) return true;
  return TIER_ORDER.indexOf(next) > TIER_ORDER.indexOf(previous);
}

/** As esperas entre uma pergunta e a seguinte, em milissegundos. */
const RANKED_WAITS = [0, 900, 2_200, 4_000] as const;

/**
 * Espera a corrida de duelo cair no ranking, e relê o cartão quando ela cair.
 *
 * O duelo não devolve classificação: o servidor arquiva a partida e só então
 * pontua as duas corridas, depois de a resposta do envio já ter ido. Então
 * quem pergunta é esta aba, algumas vezes, com espera crescente — e para no
 * instante em que o total de corridas do cartão sobe, que é o sinal de que a
 * escrita caiu.
 *
 * As esperas são poucas e curtas de propósito. Isto é uma tela de resultado que
 * a pessoa fecha em segundos; ficar perguntando depois disso seria rede gasta
 * numa resposta que ninguém está mais olhando.
 */
export async function awaitRankedRun(passport: string): Promise<void> {
  const before = useStore.getState().identity?.totalRuns ?? null;
  for (const wait of RANKED_WAITS) {
    if (wait > 0) await sleep(wait);
    const next = await refreshIdentity(passport);
    if (!next) return;
    if (before === null || next.totalRuns > before) return;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Guarda o anúncio, uma vez por patente. */
function announce(arrival: PatenteArrival): void {
  const key = `${arrival.patente.family}:${arrival.patente.tier}`;
  if (useStore.getState().announced === key) return;
  useStore.setState({ arrival, announced: key });
}

/** A patente a anunciar agora, pra janela que a mostra. */
export function usePatenteArrival(): PatenteArrival | null {
  return useStore((state) => state.arrival);
}

/** Fecha o anúncio. O que foi anunciado continua anunciado. */
export function dismissArrival(): void {
  useStore.setState({ arrival: null });
}

export function dismissCode(): void {
  useStore.getState().clearCode();
}

function encode(credentials: PlayerCredentials): string {
  return `${credentials.passport.playerId}.${credentials.passport.signature}`;
}

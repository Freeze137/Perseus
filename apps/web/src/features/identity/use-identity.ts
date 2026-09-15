"use client";

import type { Identity, PlayerCredentials } from "@perseus/contracts";
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
      setPassport: (passport) => set({ passport, identity: null }),
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
  useStore.setState({ passport: null, identity: null, freshCode: null });
}

export function dismissCode(): void {
  useStore.getState().clearCode();
}

function encode(credentials: PlayerCredentials): string {
  return `${credentials.passport.playerId}.${credentials.passport.signature}`;
}

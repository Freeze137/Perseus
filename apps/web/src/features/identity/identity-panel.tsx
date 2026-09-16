"use client";

import { TIERS } from "@perseus/contracts";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { PatenteMark } from "./patente-mark";
import {
  claimName,
  dismissCode,
  forgetPassport,
  restoreName,
  useIdentity,
} from "./use-identity";

type Mode = "new" | "recover";
type Status = "idle" | "working" | "failed";

/**
 * Onde alguém vira um nome no ranking.
 *
 * O que havia aqui antes era um formulário de e-mail. Ele saiu porque a
 * pergunta que ele fazia não era necessária: o que este produto guarda de
 * alguém é uma velocidade de digitação e um apelido, e pedir um e-mail por isso
 * era recolher um passivo em troca de nada. O duelo já provava que dava pra não
 * pedir — ele sempre pediu um nome, não uma conta.
 *
 * O que ficou no lugar são duas chaves e uma frase honesta sobre cada uma: o
 * passaporte, que este navegador guarda e perde junto com os dados do site, e
 * o código de recuperação, que é a única forma de voltar em outra máquina.
 */
export function IdentityPanel() {
  const { passport, identity, freshCode } = useIdentity();
  const [mode, setMode] = useState<Mode>("new");
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [problem, setProblem] = useState<string | null>(null);

  if (freshCode) return <CodeOnce code={freshCode} />;

  if (passport) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {identity?.patentes[0] ? (
              <PatenteMark
                tier={identity.patentes[0].tier}
                size={36}
                state={identity.patentes[0].dormant ? "dormant" : "earned"}
              />
            ) : null}
            <p className="min-w-0 truncate text-sm text-ash">
              No ranking como{" "}
              <span className="text-bone">
                {identity?.player.username ?? "…"}
              </span>
            </p>
          </div>
          <Button variant="quiet" size="sm" onClick={forgetPassport}>
            Esquecer aqui
          </Button>
        </div>

        {identity ? (
          <p className="text-sm leading-relaxed text-ash">
            {identity.totalRuns} corrida{identity.totalRuns === 1 ? "" : "s"}{" "}
            guardada{identity.totalRuns === 1 ? "" : "s"}.{" "}
            {identity.patentes.length === 0
              ? "A patente aparece na quinta corrida de cada família."
              : identity.patentes
                  .map(
                    (p) =>
                      `${TIERS[p.tier].star} em ${p.family === "code" ? "código" : "prosa"}`,
                  )
                  .join(" · ")}
          </p>
        ) : null}

        <p className="text-xs leading-relaxed text-ash">
          Esquecer aqui apaga só a chave deste navegador. As corridas e a
          patente continuam no servidor, e o código de recuperação traz tudo de
          volta.
        </p>
      </div>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = value.trim();
    if (!text) return;
    setStatus("working");
    setProblem(null);

    const work = mode === "new" ? claimName(text) : restoreName(text);
    work
      .then(() => {
        setValue("");
        setStatus("idle");
      })
      .catch((error: unknown) => {
        setStatus("failed");
        setProblem(explain(error, mode));
      });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="perseus-identity" className="label">
        {mode === "new" ? "Seu nome no ranking" : "Seu código de recuperação"}
      </label>

      <div className="flex gap-2">
        <input
          id="perseus-identity"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          placeholder={
            mode === "new" ? "três a vinte caracteres" : "seis palavras"
          }
          className="min-w-0 flex-1 rounded-md border border-slate bg-obsidian px-3 py-2 text-sm text-bone placeholder:text-ash"
        />
        <Button type="submit" size="sm" disabled={status === "working"}>
          {mode === "new" ? "Criar" : "Voltar"}
        </Button>
      </div>

      {problem ? <p className="text-sm text-rust">{problem}</p> : null}

      <p className="text-sm leading-relaxed text-ash">
        {mode === "new"
          ? "Sem e-mail e sem senha. Você recebe seis palavras para guardar, e são elas que trazem sua patente de volta em outra máquina."
          : "As seis palavras que apareceram quando você criou o nome."}
      </p>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "new" ? "recover" : "new");
          setValue("");
          setProblem(null);
        }}
        className="self-start text-xs text-ash underline decoration-slate underline-offset-4 hover:text-bone"
      >
        {mode === "new" ? "Já tenho um nome" : "Criar um nome novo"}
      </button>
    </form>
  );
}

/**
 * O código, mostrado uma vez.
 *
 * Sem botão de "ver de novo", e a frase diz por quê. O servidor guarda só o
 * hash — um produto capaz de mostrar seu código outra vez é um produto que
 * guardou seu código.
 */
function CodeOnce({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <p className="label">Guarde estas seis palavras</p>

      <p className="select-all rounded-md border border-jade bg-obsidian px-3 py-3 font-mono text-sm leading-relaxed text-mint">
        {code.split("-").join(" ")}
      </p>

      <p className="text-sm leading-relaxed text-ash">
        É a única forma de voltar a ser você em outra máquina, ou depois de
        limpar os dados deste navegador. Não dá para mostrar de novo: o servidor
        guarda só um resumo delas, nunca as palavras.
      </p>

      <div className="flex gap-2">
        <Button
          variant="quiet"
          size="sm"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(code)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          {copied ? "Copiado" : "Copiar"}
        </Button>
        <Button size="sm" onClick={dismissCode}>
          Guardei
        </Button>
      </div>
    </div>
  );
}

function explain(error: unknown, mode: Mode): string {
  if (error instanceof ApiError) {
    if (error.code === "username_taken") return "Esse nome já está em uso.";
    if (error.code === "recovery_unknown")
      return "Essas palavras não correspondem a nenhuma identidade.";
    if (error.code === "ranking_off")
      return "O ranking não está ligado neste ambiente. O treino funciona normalmente sem ele.";
    if (error.status === 429)
      return "Muitas tentativas. Espere alguns minutos.";
    if (error.status === 400)
      return mode === "new"
        ? "Nome inválido: de três a vinte caracteres, letras, números, espaço, hífen ou sublinhado."
        : "O código tem seis palavras, separadas por espaço ou hífen.";
  }
  return "Não deu para falar com o servidor agora.";
}

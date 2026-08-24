"use client";

import type { Language, TextKind } from "@perseus/contracts";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useSettings } from "@/features/settings/use-settings";
import { SYNTAX_OPTIONS } from "@/features/settings/syntax-options";
import { TEXT_LENGTHS } from "@/features/settings/text-lengths";

const LANGUAGES = [
  { value: "pt-BR", label: "Português" },
  { value: "en", label: "English" },
] as const satisfies readonly { value: Language; label: string }[];

const KINDS = [
  { value: "words", label: "Palavras" },
  { value: "quote", label: "Frase" },
  { value: "punctuation", label: "Pontuação" },
  { value: "numbers", label: "Números" },
  { value: "code", label: "Código" },
] as const satisfies readonly { value: TextKind; label: string }[];



type Props = {
  onNewText: () => void;
  /** Fades out once the run is underway — the choices are already made. */
  dimmed: boolean;
};

export function StartBar({ onNewText, dimmed }: Props) {
  const {
    language,
    kind,
    syntax,
    length,
    setLanguage,
    setKind,
    setSyntax,
    setLength,
  } = useSettings();
  // Enter is a character in code, so it cannot also be the restart shortcut
  // there. The hint has to say the truth for the mode you are actually in.
  const isCode = kind === "code";

  return (
    <div className="mx-auto flex flex-col items-center gap-2">
    <div
      data-dimmed={dimmed}
      className="flex items-center gap-1.5 rounded-full bg-obsidian/70 px-3 py-1.5 opacity-100 transition-opacity duration-300 data-[dimmed=true]:opacity-25 hover:opacity-100"
    >
      {/* Hidden in code: the prose language does not pick the syntax, and a
          control that changes nothing is worse than no control. Its slot is
          taken by the syntax picker below, so the bar stays one row either
          way — one "which language" control, whichever axis is in play. */}
      {isCode ? null : (
        <>
          <Select
            label="Idioma"
            value={language}
            options={LANGUAGES}
            onValueChange={setLanguage}
          />
          <Divider />
        </>
      )}
      <Select label="Tipo de texto" value={kind} options={KINDS} onValueChange={setKind} />
      <Divider />
      {/* Right beside the mode it belongs to: picking "Código" and then hunting
          through settings for which code is the one step nobody should have to
          take. Mounted only in code, where it is the only control that matters. */}
      {isCode ? (
        <>
          <Select
            label="Linguagem de programação"
            value={syntax}
            options={SYNTAX_OPTIONS}
            onValueChange={setSyntax}
          />
          <Divider />
        </>
      ) : null}
      <Select
        label="Tamanho do texto"
        value={String(length)}
        options={TEXT_LENGTHS}
        onValueChange={(value) => setLength(Number(value))}
      />
      <Divider />
      <Button variant="quiet" size="sm" onClick={onNewText}>
        Novo texto
      </Button>
    </div>

      {/* The two ways out of a run, spelled out because they are not
          interchangeable: Enter is for beating a text you already know, Escape
          is for leaving one you do not want. Hidden once the run starts —
          by then the reminder is in the HUD, where it stays readable. */}
      <p
        data-dimmed={dimmed}
        className="font-mono text-xs text-ash opacity-60 transition-opacity duration-300 data-[dimmed=true]:opacity-0"
      >
        {isCode ? (
          <>
            <Key>enter</Key> quebra a linha · <Key>ctrl</Key>+<Key>enter</Key>{" "}
            repete o mesmo código · <Key>esc</Key> abandona e sorteia outro
          </>
        ) : (
          <>
            <Key>enter</Key> repete o mesmo texto · <Key>esc</Key> abandona e
            sorteia outro
          </>
        )}
      </p>
    </div>
  );
}

function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded-xs bg-slate px-1 py-0.5 font-mono text-[0.6875rem] uppercase tracking-wider text-bone">
      {children}
    </kbd>
  );
}

function Divider() {
  return <span aria-hidden="true" className="h-4 w-px bg-slate" />;
}

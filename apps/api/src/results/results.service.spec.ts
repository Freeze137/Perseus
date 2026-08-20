import { BadRequestException } from '@nestjs/common';
import {
  CORPUS_VERSION,
  TIMELINE_LIMITS,
  type SessionConfig,
  type SubmitResult,
} from '@perseus/contracts';
import { generate } from '@perseus/corpus';
import { applyInput, createSession } from '@perseus/engine';
import { ResultsService } from './results.service';
import { RunTicketService } from '../runs/run-ticket.service';
import type { SupabaseService } from '../supabase/supabase.service';

/** The service needs Supabase only to write; scoring is pure. */
const offline = { enabled: false } as unknown as SupabaseService;
const tickets = new RunTicketService();

function config(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    language: 'pt-BR',
    kind: 'words',
    length: 90,
    seed: 'perseus',
    durationMs: null,
    syntax: null,
    keyboardLayout: 'abnt2',
    ...overrides,
  };
}

/**
 * Types the whole target honestly, around one character every `gap`
 * milliseconds.
 *
 * The wobble is not decoration. A hand does not strike two keys the same number
 * of milliseconds apart twice in a row, and the server now refuses timelines
 * that claim it does — so a fixture without jitter would be testing the server
 * against something no typist produces.
 */
function honestRun(cfg: SessionConfig, gap = 120): SubmitResult {
  const target = generate(cfg);
  let session = createSession(target, { autoIndent: cfg.kind === 'code' });
  let at = 0;
  let step = 0;
  while (session.typed.length < session.target.length) {
    const next = session.target[session.typed.length];
    // Deterministic, so a failure is reproducible; uneven, so it is human.
    at += gap + (((step * 37) % 13) - 6) * 6;
    step += 1;
    session = applyInput(session, next, at);
  }
  return {
    config: cfg,
    corpusVersion: CORPUS_VERSION,
    run: tickets.issue(),
    keystrokes: session.keystrokes.map(({ char, at: t, index }) => ({
      char,
      at: Math.round(t),
      index,
    })),
  };
}

describe('ResultsService.score', () => {
  const service = new ResultsService(offline, tickets);

  it('scores an honest run', () => {
    const scored = service.score(honestRun(config()));
    expect(scored.accuracy).toBe(100);
    expect(scored.incorrect).toBe(0);
    expect(scored.wpm).toBeGreaterThan(0);
    expect(scored.cpm).toBeGreaterThan(scored.wpm);
  });

  it('scores a code run and does not pay for auto-indentation', () => {
    const scored = service.score(
      honestRun(config({ kind: 'code', syntax: 'python' })),
    );
    expect(scored.accuracy).toBe(100);
    expect(scored.incorrect).toBe(0);
  });

  it('ignores what the client thought its speed was', () => {
    // There is nowhere in the payload to put a speed. That is the design: the
    // only thing a client can send is what it did and when, and this is the
    // proof. The ticket is the server's own, not a number the client chose.
    const payload = honestRun(config());
    expect(Object.keys(payload).sort()).toEqual([
      'config',
      'corpusVersion',
      'keystrokes',
      'run',
    ]);
  });

  it('refuses a run that never reached the end', () => {
    const payload = honestRun(config());
    payload.keystrokes = payload.keystrokes.slice(0, 10);
    expect(() => service.score(payload)).toThrow(BadRequestException);
  });

  it('refuses keystrokes pointing past the text', () => {
    const payload = honestRun(config());
    payload.keystrokes.push({ char: 'x', at: 999_999, index: 100_000 });
    expect(() => service.score(payload)).toThrow(BadRequestException);
  });

  it('refuses a corpus version it cannot regenerate, and says which', () => {
    const payload = {
      ...honestRun(config()),
      corpusVersion: CORPUS_VERSION + 1,
    };
    expect(() => service.score(payload)).toThrow(BadRequestException);
    // The code is what lets the interface tell "reload the page" apart from
    // "your run looked forged", which are not the same news.
    expect(refusalOf(() => service.score(payload))).toMatchObject({
      code: 'corpus_version',
      expected: CORPUS_VERSION,
    });
  });

  it('scores wrong characters as wrong however they are labelled', () => {
    const payload = honestRun(config());
    // Swap every character for one that cannot match, then claim it was fine.
    payload.keystrokes = payload.keystrokes.map((k) => ({
      ...k,
      char: '¤',
    }));
    const scored = service.score(payload);
    expect(scored.accuracy).toBe(0);
    expect(scored.correct).toBe(0);
  });

  it('cannot be sped up by claiming the run took no time', () => {
    const payload = honestRun(config());
    payload.keystrokes = payload.keystrokes.map((k) => ({ ...k, at: 0 }));
    expect(() => service.score(payload)).toThrow(BadRequestException);
  });

  it('cannot be sped up by compressing the timeline', () => {
    // The hole this whole check exists for. Every character correct, every
    // position honest, the clock squeezed to a millisecond a key: the old
    // server scored this at sixty thousand words a minute and stored it.
    const payload = honestRun(config());
    payload.keystrokes = payload.keystrokes.map((k, i) => ({ ...k, at: i }));

    expect(refusalOf(() => service.score(payload))).toMatchObject({
      code: 'implausible',
    });
  });

  it('cannot be sped up by a rhythm no hand has', () => {
    // Believable speed, machine-perfect spacing.
    const payload = honestRun(config());
    payload.keystrokes = payload.keystrokes.map((k, i) => ({
      ...k,
      at: i * 100,
    }));

    expect(refusalOf(() => service.score(payload))).toMatchObject({
      code: 'implausible',
    });
  });

  it('refuses a timeline whose clock runs backwards', () => {
    const payload = honestRun(config());
    const strokes = payload.keystrokes;
    const tenth = strokes[10];
    if (tenth) strokes[10] = { ...tenth, at: 0 };

    expect(refusalOf(() => service.score(payload))).toMatchObject({
      code: 'invalid_timeline',
    });
  });

  it('refuses a run that claims more time than the server watched pass', () => {
    // Two minutes of typing, in a window the server saw last for one second.
    const payload = honestRun(config({ length: 300 }), 400);
    const now = Date.now();
    expect(
      refusalOf(() => service.score(payload, { issuedAt: now - 1_000, now })),
    ).toMatchObject({ code: 'implausible' });
  });

  it('accepts an honest run against the clock the server watched', () => {
    const payload = honestRun(config());
    const now = Date.now();
    const started = now - 10 * 60_000;

    expect(() =>
      service.score(payload, { issuedAt: started, now }),
    ).not.toThrow();
  });

  it('accepts a genuinely fast typist', () => {
    // Around 200 words a minute. Rare, real, and not to be thrown off a board
    // by a ceiling set to whatever the author of the check could type.
    const payload = honestRun(config(), 60);
    const scored = service.score(payload);

    expect(scored.wpm).toBeGreaterThan(150);
    expect(scored.cpm).toBeLessThan(TIMELINE_LIMITS.maxCpm);
  });

  it('derives the same numbers from the same timeline every time', () => {
    const payload = honestRun(config());
    const a = service.score(payload);
    const b = service.score(payload);
    expect({ ...a, completedAt: '' }).toEqual({ ...b, completedAt: '' });
  });
});

describe('RunTicketService', () => {
  it('accepts a ticket it issued', () => {
    const service = new RunTicketService();
    expect(service.verify(service.issue()).ok).toBe(true);
  });

  it('refuses a ticket signed by nobody', () => {
    const service = new RunTicketService();
    const ticket = { ...service.issue(), signature: 'a'.repeat(64) };
    expect(service.verify(ticket).ok).toBe(false);
  });

  it('refuses a ticket whose timestamp was edited', () => {
    // Moving the clock back is how a submission would buy itself room to claim
    // a longer run than it had time for; the signature covers the timestamp.
    const service = new RunTicketService();
    const ticket = service.issue();
    expect(
      service.verify({ ...ticket, issuedAt: ticket.issuedAt - 60_000 }).ok,
    ).toBe(false);
  });

  it('refuses an expired ticket', () => {
    const service = new RunTicketService();
    const ticket = service.issue(Date.now() - 5 * 60 * 60 * 1_000);
    expect(service.verify(ticket).ok).toBe(false);
  });

  it('refuses a ticket from another process', () => {
    // A process that was not configured with a secret invents one, so a second
    // instance signs with something this one has never seen — which is exactly
    // why a deployment with more than one instance has to set RUN_TICKET_SECRET.
    const mine = new RunTicketService();
    const theirs = new RunTicketService(Buffer.from('a different deployment'));
    expect(mine.verify(theirs.issue()).ok).toBe(false);
  });
});

/** Runs `act`, expecting a refusal, and hands back the body it carried. */
function refusalOf(act: () => unknown): Record<string, unknown> {
  try {
    act();
  } catch (error) {
    if (error instanceof BadRequestException) {
      return error.getResponse() as Record<string, unknown>;
    }
    throw error;
  }
  throw new Error('expected the submission to be refused');
}

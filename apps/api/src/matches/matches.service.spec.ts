import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  MATCH_COUNTDOWN_MS,
  MATCH_GRACE_MS,
  MATCH_MAX_RUN_MS,
  type CreateMatch,
  type MatchEvent,
  type SessionConfig,
  type SubmittedKeystroke,
} from '@perseus/contracts';
import { generate } from '@perseus/corpus';
import { applyInput, createSession } from '@perseus/engine';
import { MatchRegistryService } from './match-registry.service';
import { MatchTokenService } from './match-token.service';
import { MatchesService } from './matches.service';
import type { MatchStoreService } from './match-store.service';
import { ResultsService } from '../results/results.service';
import { RunTicketService } from '../runs/run-ticket.service';
import type { SupabaseService } from '../supabase/supabase.service';

/** Scoring is pure; the database is only ever written to. */
const offline = { enabled: false } as unknown as SupabaseService;

const REQUEST: CreateMatch = {
  displayName: 'rafael',
  language: 'pt-BR',
  kind: 'words',
  // Short on purpose: the whole timeline has to fit inside the clock slack the
  // scorer allows, and these tests move the clock by hand.
  length: 60,
  syntax: null,
  keyboardLayout: 'abnt2',
};

/**
 * Types the room's own text, honestly, at a chosen pace.
 *
 * The jitter is load-bearing rather than decorative: a timeline with a perfectly
 * even rhythm is refused as machine-made, so a fixture without it would be
 * testing the duel against something no hand produces.
 */
function honestRun(config: SessionConfig, gap = 120): SubmittedKeystroke[] {
  const target = generate(config);
  let session = createSession(target, { autoIndent: config.kind === 'code' });
  let at = 0;
  let step = 0;

  while (session.typed.length < session.target.length) {
    at += gap + (((step * 37) % 13) - 6) * 4;
    step += 1;
    session = applyInput(session, session.target[session.typed.length], at);
  }

  return session.keystrokes.map(({ char, at: t, index }) => ({
    char,
    at: Math.round(t),
    index,
  }));
}

function build() {
  const registry = new MatchRegistryService();
  // Held as loose functions rather than reached through the object: a mock read
  // off a class instance is an unbound method, and the assertions below want the
  // spy, not the method.
  const save = jest.fn().mockResolvedValue(undefined);
  const summaries = jest.fn().mockResolvedValue([]);
  const store = {
    enabled: false,
    save,
    summaries,
  } as unknown as MatchStoreService;
  const service = new MatchesService(
    registry,
    new MatchTokenService(),
    store,
    new ResultsService(offline, new RunTicketService()),
  );
  return { registry, save, service };
}

/** A room with both players in and the countdown already spent. */
function running(service: MatchesService) {
  const host = service.create(REQUEST);
  const guest = service.join(host.match.inviteCode, { displayName: 'amiga' });
  jest.advanceTimersByTime(MATCH_COUNTDOWN_MS);
  return { host, guest, config: host.match.config };
}

describe('MatchesService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('opens a room with a text and a code nobody chose', () => {
    const { service } = build();
    const created = service.create(REQUEST);

    expect(created.slot).toBe(1);
    expect(created.match.state).toBe('lobby');
    expect(created.match.inviteCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(created.match.startsAt).toBeNull();
    // The seed is the server's. A host that picked it could have typed the
    // text once before opening the room.
    expect(created.match.config.seed.length).toBeGreaterThan(0);
    expect(generate(created.match.config).length).toBeGreaterThan(0);
  });

  it('starts the countdown when the second player arrives', () => {
    const { service } = build();
    const host = service.create(REQUEST);
    const guest = service.join(host.match.inviteCode, { displayName: 'amiga' });

    expect(guest.slot).toBe(2);
    expect(guest.match.state).toBe('countdown');
    expect(guest.match.startsAt).toBe(
      guest.match.serverNow + MATCH_COUNTDOWN_MS,
    );
    expect(guest.match.players).toHaveLength(2);
    // Both play the same text, and neither was sent it.
    expect(guest.match.config).toEqual(host.match.config);

    jest.advanceTimersByTime(MATCH_COUNTDOWN_MS);
    expect(service.forPlayer(host.match.id, host.token).match.state).toBe(
      'running',
    );
  });

  it('refuses a third player and an invite nobody issued', () => {
    const { service } = build();
    const host = service.create(REQUEST);
    service.join(host.match.inviteCode, { displayName: 'amiga' });

    expect(() =>
      service.join(host.match.inviteCode, { displayName: 'terceiro' }),
    ).toThrow(ConflictException);
    expect(() => service.join('ZZZZZZ', { displayName: 'ninguem' })).toThrow(
      NotFoundException,
    );
  });

  it('does not take somebody else’s word for which player they are', () => {
    const { service } = build();
    const { host } = running(service);

    expect(() => service.progress(host.match.id, 'forged', 1)).toThrow(
      UnauthorizedException,
    );
    expect(() =>
      service.finish(host.match.id, undefined, { keystrokes: [] }),
    ).toThrow(UnauthorizedException);
    // A real token, for a different room.
    const other = build().service.create(REQUEST);
    expect(() => service.progress(host.match.id, other.token, 1)).toThrow(
      UnauthorizedException,
    );
  });

  it('refuses a run submitted before the keys unlock', () => {
    const { service } = build();
    const host = service.create(REQUEST);
    service.join(host.match.inviteCode, { displayName: 'amiga' });

    expect(() =>
      service.finish(host.match.id, host.token, {
        keystrokes: honestRun(host.match.config),
      }),
    ).toThrow(BadRequestException);
  });

  it('carries the other player’s caret and never walks it backwards', () => {
    const { registry, service } = build();
    const { host } = running(service);
    const seen: MatchEvent[] = [];
    registry.subscribe(host.match.id, (event) => seen.push(event));

    service.progress(host.match.id, host.token, 12);
    service.progress(host.match.id, host.token, 4);
    service.progress(host.match.id, host.token, 30);

    const positions = seen
      .filter((event) => event.type === 'progress')
      .map((event) => (event.type === 'progress' ? event.index : -1));
    expect(positions).toEqual([12, 30]);
  });

  it('scores both timelines itself and gives the duel to the faster one', () => {
    const { save, service } = build();
    const { host, guest, config } = running(service);

    service.finish(host.match.id, host.token, {
      keystrokes: honestRun(config, 120),
    });
    const settled = service.finish(host.match.id, guest.token, {
      keystrokes: honestRun(config, 220),
    });

    expect(settled.state).toBe('done');
    expect(settled.winnerSlot).toBe(1);
    expect(settled.players[0].outcome).toBe('won');
    expect(settled.players[1].outcome).toBe('lost');
    expect(settled.players[0].score!.wpm).toBeGreaterThan(
      settled.players[1].score!.wpm,
    );
    // Written down once, and only because it finished.
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('gives the second typist the grace period and no longer', () => {
    const { service } = build();
    const { host, guest, config } = running(service);

    const first = service.finish(host.match.id, host.token, {
      keystrokes: honestRun(config, 120),
    });
    expect(first.state).toBe('running');
    expect(first.graceEndsAt).toBe(first.serverNow + MATCH_GRACE_MS);

    jest.advanceTimersByTime(MATCH_GRACE_MS);

    const after = service.forPlayer(host.match.id, guest.token).match;
    expect(after.state).toBe('done');
    expect(after.winnerSlot).toBe(1);
    // Stated as what happened, not as a verdict on the person.
    expect(after.players[1].outcome).toBe('unfinished');
    expect(after.players[1].score).toBeNull();
  });

  it('closes a room where nobody ever finished, and records nothing', () => {
    const { save, service } = build();
    const { host } = running(service);

    jest.advanceTimersByTime(MATCH_MAX_RUN_MS);

    const after = service.forPlayer(host.match.id, host.token).match;
    expect(after.state).toBe('abandoned');
    expect(after.winnerSlot).toBeNull();
    expect(after.players.every((one) => one.outcome === 'abandoned')).toBe(
      true,
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses a second submission from the same player', () => {
    const { service } = build();
    const { host, config } = running(service);

    service.finish(host.match.id, host.token, {
      keystrokes: honestRun(config, 120),
    });
    expect(() =>
      service.finish(host.match.id, host.token, {
        keystrokes: honestRun(config, 120),
      }),
    ).toThrow(ConflictException);
  });

  it('closes the room when the host walks out of an empty lobby', () => {
    const { save, service } = build();
    const host = service.create(REQUEST);

    const left = service.leave(host.match.id, host.token);

    expect(left.state).toBe('abandoned');
    expect(left.winnerSlot).toBeNull();
    expect(left.players[0].outcome).toBe('abandoned');
    // Nobody typed, so there is nothing to remember.
    expect(save).not.toHaveBeenCalled();
  });

  it('ends the duel for both when one leaves during the countdown', () => {
    const { service } = build();
    const host = service.create(REQUEST);
    const guest = service.join(host.match.inviteCode, { displayName: 'amiga' });

    service.leave(host.match.id, host.token);

    // The one left behind sees an ending, not a bar that stopped moving.
    const seen = service.forPlayer(host.match.id, guest.token).match;
    expect(seen.state).toBe('abandoned');
    expect(seen.players.every((one) => one.outcome === 'abandoned')).toBe(true);
  });

  it('publishes the ending to whoever is watching', () => {
    const { registry, service } = build();
    const { host } = running(service);
    const seen: MatchEvent[] = [];
    registry.subscribe(host.match.id, (event) => seen.push(event));

    service.leave(host.match.id, host.token);

    const states = seen
      .filter((event) => event.type === 'match')
      .map((event) => (event.type === 'match' ? event.match.state : ''));
    expect(states).toContain('abandoned');
  });

  it('gives the duel to whoever finished when the other one leaves', () => {
    const { save, service } = build();
    const { host, guest, config } = running(service);

    service.finish(host.match.id, host.token, {
      keystrokes: honestRun(config, 120),
    });
    const left = service.leave(host.match.id, guest.token);

    // Leaving mid-race is not a way to deny somebody the run they finished.
    expect(left.state).toBe('done');
    expect(left.winnerSlot).toBe(1);
    expect(left.players[0].outcome).toBe('won');
    expect(left.players[1].outcome).toBe('unfinished');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('settles once when both players leave', () => {
    const { save, service } = build();
    const { host, guest } = running(service);

    const first = service.leave(host.match.id, host.token);
    const second = service.leave(host.match.id, guest.token);

    expect(first.state).toBe('abandoned');
    expect(second.state).toBe('abandoned');
    expect(second.finishedAt).toBe(first.finishedAt);
    expect(save).not.toHaveBeenCalled();
  });

  it('accepts leaving a duel that is already over', () => {
    const { save, service } = build();
    const { host, guest, config } = running(service);

    service.finish(host.match.id, host.token, {
      keystrokes: honestRun(config, 120),
    });
    service.finish(host.match.id, guest.token, {
      keystrokes: honestRun(config, 220),
    });

    const after = service.leave(host.match.id, host.token);

    // The scoreboard stands: a late button press is not a second ending.
    expect(after.state).toBe('done');
    expect(after.winnerSlot).toBe(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does not let a stranger end somebody else’s duel', () => {
    const { service } = build();
    const { host } = running(service);

    expect(() => service.leave(host.match.id, 'forged')).toThrow(
      UnauthorizedException,
    );
    expect(service.forPlayer(host.match.id, host.token).match.state).toBe(
      'running',
    );
  });

  it('answers a history from memory, and says it is not stored', async () => {
    const { service } = build();
    const { host, guest, config } = running(service);

    service.finish(host.match.id, host.token, {
      keystrokes: honestRun(config, 120),
    });
    service.finish(host.match.id, guest.token, {
      keystrokes: honestRun(config, 220),
    });

    const history = await service.summaries([host.match.id]);
    expect(history.status).toBe('unavailable');
    expect(history.matches).toHaveLength(1);
    expect(history.matches[0].players.map((one) => one.displayName)).toEqual([
      'rafael',
      'amiga',
    ]);
  });
});

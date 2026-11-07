import { describe, expect, it } from 'vitest';
import {
  canSwap,
  chooseCoach,
  createDraft,
  currentPool,
  dailySeed,
  eligibleSlots,
  finishSeason,
  getEngine,
  GreedySkillBot,
  pickSixthMan,
  pickStarter,
  respinEra,
  respinTeam,
  spin,
  swapSlots,
  grantBonusRespin,
  canRespin,
  type DraftState,
  type Player,
} from '../src/engine';

const engine = getEngine();

function spinSequence(seed: number): string[] {
  let s = createDraft('daily', seed);
  const seq: string[] = [];
  while (s.phase === 'starters') {
    s = spin(engine, s);
    seq.push(`${s.current!.team}|${s.current!.decade}`);
    const p = currentPool(engine, s)[0];
    s = pickStarter(s, p, eligibleSlots(s, p)[0]);
  }
  s = spin(engine, s);
  seq.push(`${s.current!.team}|${s.current!.decade}`);
  return seq;
}

describe('draft rules', () => {
  it('Daily: same date -> identical wheel sequence, independent of picks', () => {
    const seed = dailySeed('2026-11-07');
    expect(spinSequence(seed)).toEqual(spinSequence(seed));
    // Picks don't influence the wheel: a different drafting strategy sees the same spins.
    const greedy = GreedySkillBot.draft(engine, seed, 'daily');
    expect(greedy.phase).toBe('done');
    expect(spinSequence(dailySeed('2026-11-08'))).not.toEqual(spinSequence(seed));
  });

  it('respins are limited (1 team + 1 era) and deterministic', () => {
    let s = spin(engine, createDraft('classic', 99));
    const first = s.current!;
    const t1 = respinTeam(engine, s);
    expect(t1.current!.decade).toBe(first.decade);
    expect(t1.current!.team).not.toBe(first.team);
    expect(respinTeam(engine, s)).toEqual(t1); // deterministic
    const e1 = respinEra(engine, t1);
    expect(e1.current!.team).toBe(t1.current!.team);
    expect(e1.current!.decade).not.toBe(t1.current!.decade);
    expect(canRespin(e1, 'team')).toBe(false);
    expect(canRespin(e1, 'era')).toBe(false);
    expect(respinTeam(engine, e1)).toBe(e1);
    // A granted bonus respin (e.g. rewarded ad) works on either wheel once.
    s = grantBonusRespin(e1);
    const b = respinTeam(engine, s);
    expect(b.current!.team).not.toBe(s.current!.team);
    expect(canRespin(b, 'era')).toBe(false);
  });

  it('cannot draft the same person twice or into an ineligible slot', () => {
    let s = spin(engine, createDraft('classic', 5));
    const p = currentPool(engine, s)[0];
    const slot = eligibleSlots(s, p)[0];
    const bad = (['PG', 'SG', 'SF', 'PF', 'C'] as const).find((x) => !p.pos.includes(x))!;
    expect(() => pickStarter(s, p, bad)).toThrow();
    s = pickStarter(s, p, slot);
    expect(eligibleSlots(s, p)).toEqual([]);
    const twin: Player = { ...p, id: `${p.pid}:XXX:2020s` };
    expect(eligibleSlots(s, twin)).toEqual([]);
  });

  it('combo positions can swap slots with one call', () => {
    const combo = engine.dataset.players.find((p) => p.pos.includes('PG') && p.pos.includes('SG'))!;
    const sg = engine.dataset.players.find((p) => p.pos.length === 1 && p.pos[0] === 'SG' && p.pid !== combo.pid)!;
    const s: DraftState = { ...createDraft('classic', 1), lineup: { PG: combo } };
    expect(canSwap(s, 'PG', 'SG')).toBe(true);
    const moved = swapSlots(s, 'PG', 'SG');
    expect(moved.lineup.SG).toBe(combo);
    expect(moved.lineup.PG).toBeUndefined();
    const blocked: DraftState = { ...s, lineup: { PG: combo, SG: sg } };
    expect(canSwap(blocked, 'PG', 'SG')).toBe(false); // the pure SG can't play PG
  });

  it('full flow: 5 starters -> 6th man -> coach -> locked season', () => {
    let s = createDraft('classic', 2024);
    while (s.phase === 'starters') {
      s = spin(engine, s);
      const p = currentPool(engine, s)[0];
      s = pickStarter(s, p, eligibleSlots(s, p)[0]);
    }
    expect(s.phase).toBe('sixthMan');
    s = spin(engine, s);
    s = pickSixthMan(s, currentPool(engine, s)[0]);
    expect(() => finishSeason(engine, s)).toThrow();
    s = chooseCoach(s, 'gritGrind');
    const a = finishSeason(engine, s);
    const b = finishSeason(engine, s);
    expect(a).toEqual(b);
  });
});

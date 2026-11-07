import { describe, expect, it } from 'vitest';
import {
  createRater,
  dailySeed,
  getEngine,
  hashString,
  mulberry32,
  opponentLabel,
  rosterKey,
  simulateSeason,
  teamRating,
  winProbability,
  SIM,
  SYNERGY,
  type Lineup,
  type Player,
} from '../src/engine';
import { validate } from '../scripts/validatePools';
import playersFile from '../src/data/players.min.json';
import opponentsFile from '../src/data/opponents.min.json';

const engine = getEngine();
const { rater } = engine;

/** Synthetic card helper for synergy unit tests (fixed 2010s era context). */
function card(over: Partial<Player> & { id: string }): Player {
  return {
    pid: over.id,
    realName: over.id,
    aliasName: over.id,
    team: 'BOS',
    decade: '2010s',
    season: 2015,
    pos: ['SF'],
    g: 82,
    mpg: 32,
    ppg: 14,
    rpg: 5,
    apg: 3,
    spg: 1,
    bpg: 0.5,
    ts: 0.55,
    tpa: 0,
    tpp: 0,
    ftp: 0.7,
    defEst: false,
    ...over,
  };
}
const lineup = (players: Player[]): Lineup => ({ PG: players[0], SG: players[1], SF: players[2], PF: players[3], C: players[4] });
const five = (f: (i: number) => Partial<Player>) => Array.from({ length: 5 }, (_, i) => card({ id: `p${i}`, ...f(i) }));

describe('data validation (npm run validate:data)', () => {
  it('bundled data has no NaN/undefined stats and every active pool covers all 5 positions', () => {
    const r = validate(playersFile, opponentsFile);
    expect(r.errors).toEqual([]);
    expect(r.active).toBeGreaterThan(160);
  });

  it('the wheel lands exactly on the pools the validator checks', () => {
    const r = validate(playersFile, opponentsFile);
    expect([...engine.active].sort()).toEqual(r.activeKeys);
    expect(engine.active).not.toContain('CHA|1980s'); // 1 season (1988-89): inactive
  });
});

describe('PRNG', () => {
  it('mulberry32 is deterministic and in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('daily seed is stable per date and differs across dates', () => {
    expect(dailySeed('2026-11-07')).toBe(dailySeed('2026-11-07'));
    expect(dailySeed('2026-11-07')).not.toBe(dailySeed('2026-11-08'));
    expect(() => dailySeed('7/11/2026')).toThrow();
    expect(hashString('a')).not.toBe(hashString('b'));
  });
});

describe('Stage 1 — era-normalised individual rating', () => {
  it('normalises by decade: the same raw line rates higher in a low-scoring era', () => {
    const line = { ppg: 25, rpg: 8, apg: 5, spg: 1.5, bpg: 1, ts: 0.56 };
    const sixties = rater.rate(card({ id: 'a', decade: '2010s', season: 2015, ...line }));
    const slow = rater.rate(card({ id: 'b', decade: '2000s', season: 2005, ...line }));
    const fast = rater.rate(card({ id: 'c', decade: '1960s', season: 1965, ...line, defEst: true }));
    expect(slow.norm.pts).toBeGreaterThan(fast.norm.pts);
    expect(sixties.ir).toBeGreaterThan(0);
  });

  it('pre-1973-74 players get a positional defensive coefficient, not an inflated flat bonus', () => {
    const r = createRater(engine.dataset);
    const base = r.positionalDefense.get('C')!;
    const bigEst = r.rate(card({ id: 'big60', decade: '1960s', season: 1965, pos: ['C'], rpg: 24, defEst: true, spg: 9, bpg: 9 }));
    // Ignores the (display-only) estimate and stays within the archetype band of the C baseline.
    expect(bigEst.norm.blk).toBeLessThanOrEqual(base.blk * 1.3 + 1e-9);
    expect(bigEst.norm.blk).toBeGreaterThanOrEqual(base.blk * 0.75 - 1e-9);
    expect(bigEst.norm.stl).toBeLessThanOrEqual(base.stl * 1.2 + 1e-9);
  });

  it('ranks known all-time peaks near the top of the bundled data', () => {
    const top = engine.dataset.players.map((p) => rater.rate(p)).sort((a, b) => b.ir - a.ir).slice(0, 40).map((r) => r.player.realName);
    for (const name of ['Michael Jordan', 'LeBron James', 'Nikola Jokić', 'Wilt Chamberlain']) expect(top).toContain(name);
  });
});

describe('Stage 2 — TeamRating with synergy inside the rating', () => {
  const plain = five(() => ({}));
  const base = teamRating(rater, lineup(plain)).total;

  it('spacing: 2+ shooters add rating, 4+ non-shooters subtract it', () => {
    const spaced = five((i) => (i < 2 ? { tpa: 6, tpp: 0.4 } : {}));
    const r = teamRating(rater, lineup(spaced));
    expect(r.counts.shooters).toBe(2);
    expect(r.spacing).toBeCloseTo(SYNERGY.SPACING_BONUS_2);
    expect(teamRating(rater, lineup(plain)).spacing).toBe(SYNERGY.SPACING_PENALTY_5);
    expect(r.total).toBeGreaterThan(base);
  });

  it('playmaking: an APG >= 7.5 creator adds a bonus', () => {
    const withPg = five((i) => (i === 0 ? { apg: 9 } : {}));
    expect(teamRating(rater, lineup(withPg)).playmaking).toBe(SYNERGY.ELITE_PLAYMAKER);
  });

  it('usage: stacking 5 high-usage scorers has diminishing returns', () => {
    const scorers = five(() => ({ ppg: 28 }));
    const r = teamRating(rater, lineup(scorers));
    expect(r.counts.highUsage).toBe(5);
    expect(r.usage).toBeCloseTo(-SYNERGY.USAGE_K * Math.pow(3, 1.5));
    const two = teamRating(rater, lineup(five((i) => (i < 2 ? { ppg: 28 } : {}))));
    expect(two.usage).toBe(0);
  });

  it('defense: rim protector (BPG >= 2) + perimeter defender (SPG >= 1.8) are rewarded as a pair', () => {
    const d = teamRating(rater, lineup(five((i) => (i === 4 ? { bpg: 2.5 } : i === 0 ? { spg: 2.1 } : {}))));
    expect(d.defense).toBe(SYNERGY.RIM + SYNERGY.PERIMETER + SYNERGY.BALANCED_DEFENSE);
    expect(teamRating(rater, lineup(plain)).defense).toBe(SYNERGY.NO_DEFENDER);
  });

  it('bonus round: 6th man and coach fit move the rating before the logistic', () => {
    const star = card({ id: 'sixth', ppg: 24, rpg: 7, apg: 5 });
    const scrub = card({ id: 'scrub', ppg: 3, rpg: 1, apg: 0.5 });
    expect(teamRating(rater, lineup(plain), star).total).toBeGreaterThan(teamRating(rater, lineup(plain), scrub).total);
    const shooters = five(() => ({ tpa: 7, tpp: 0.41 }));
    const space = teamRating(rater, lineup(shooters), null, 'paceSpace');
    const grit = teamRating(rater, lineup(shooters), null, 'gritGrind');
    expect(space.coachFit).toBeGreaterThan(grit.coachFit);
    expect(space.total).toBeGreaterThan(grit.total);
    expect(space.coachMultiplier).toBeLessThanOrEqual(SYNERGY.COACH_MIN + SYNERGY.COACH_RANGE);
  });
});

describe('Stage 3 — logistic p_win and seeded season', () => {
  it('p_win is monotonic and capped at P_MAX in [0.960, 0.965]', () => {
    expect(SIM.P_MAX).toBeGreaterThanOrEqual(0.96);
    expect(SIM.P_MAX).toBeLessThanOrEqual(0.965);
    expect(winProbability(500, 0)).toBe(SIM.P_MAX);
    expect(winProbability(70, 80)).toBeLessThan(winProbability(80, 80));
    expect(winProbability(80, 80)).toBeCloseTo(0.5);
  });

  const pick = (team: string, decade: string) => engine.pools.get(`${team}|${decade}` as never)!;
  const chi = pick('CHI', '1990s');
  const sample: Lineup = {
    PG: chi.find((p) => p.pos.includes('PG'))!,
    SG: chi.find((p) => p.pos.includes('SG'))!,
    SF: chi.find((p) => p.pos.includes('SF'))!,
    PF: chi.find((p) => p.pos.includes('PF'))!,
    C: chi.find((p) => p.pos.includes('C'))!,
  };

  it('is locked to runSeed + roster: re-simulating returns the identical season', () => {
    const a = simulateSeason(rater, engine.dataset.opponents, 1234, sample, null, 'motion');
    const b = simulateSeason(rater, engine.dataset.opponents, 1234, sample, null, 'motion');
    expect(b).toEqual(a);
    expect(a.games).toHaveLength(82);
    expect(a.wins + a.losses).toBe(82);
    const other = simulateSeason(rater, engine.dataset.opponents, 98765, sample, null, 'motion');
    expect(other.games.map((g) => g.win)).not.toEqual(a.games.map((g) => g.win));
  });

  it('every game has an opponentStrength and losses record the historical opponent and margin', () => {
    const weak: Lineup = Object.fromEntries(Object.entries(sample).map(([k, p]) => [k, { ...p!, id: `${p!.id}-w`, ppg: 2, rpg: 1, apg: 0.5, spg: 0.2, bpg: 0.1 }]));
    const r = simulateSeason(rater, engine.dataset.opponents, 7, weak, null, null);
    expect(r.losses).toBeGreaterThan(0);
    for (const g of r.games) expect(Number.isFinite(g.opponentStrength)).toBe(true);
    for (const l of r.lostTo) {
      expect(l.label).toMatch(/^'\d{2} [A-Z][A-Za-z .]+ [A-Z][a-z]+$/);
      expect(l.margin).toBeGreaterThan(0);
    }
    expect(r.lostTo).toHaveLength(r.losses);
  });

  it('labels historical opponents without club nicknames', () => {
    const bulls96 = engine.dataset.opponents.find((o) => o.team === 'CHI' && o.season === 1996)!;
    expect(opponentLabel(bulls96)).toBe("'96 Chicago Red");
    const gsw17 = engine.dataset.opponents.find((o) => o.team === 'GSW' && o.season === 2017)!;
    expect(opponentLabel(gsw17)).toBe("'17 Golden State Sun");
  });

  it('roster key covers slots, 6th man and coach', () => {
    expect(rosterKey(sample, null, 'motion')).not.toBe(rosterKey(sample, null, 'paceSpace'));
  });
});

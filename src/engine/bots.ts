/**
 * Reference bots used for balance calibration.
 *  - RandomBot: uniform random legal choices, never respins.
 *  - GreedySkillBot: picks the (player, slot) that maximises the synergy-aware
 *    TeamRating at every step, takes the best 6th man and best-fitting coach.
 *    Uses its free respins when the spun pool's best option is weak.
 */
import {
  canRespin,
  chooseCoach,
  createDraft,
  currentPool,
  eligibleSlots,
  pickSixthMan,
  pickStarter,
  respinEra,
  respinTeam,
  spin,
  type DraftState,
  type Engine,
  type GameMode,
} from './draft';
import { mulberry32, type Rng } from './prng';
import { COACH_SYSTEMS, ratingFromRated, teamRating, type CoachSystem, type RatedPlayer } from './simulator';
import { POSITIONS, type Player, type Position } from './types';

export interface Bot {
  name: string;
  draft(engine: Engine, runSeed: number, mode?: GameMode): DraftState;
}

export const RandomBot: Bot = {
  name: 'RandomBot',
  draft(engine, runSeed, mode = 'classic') {
    const rng: Rng = mulberry32(runSeed ^ 0x9e3779b9);
    let s = createDraft(mode, runSeed);
    while (s.phase === 'starters') {
      s = spin(engine, s);
      const pool = currentPool(engine, s);
      const p = pool[Math.floor(rng() * pool.length)];
      const slots = eligibleSlots(s, p);
      s = pickStarter(s, p, slots[Math.floor(rng() * slots.length)]);
    }
    s = spin(engine, s);
    const bench = currentPool(engine, s);
    s = pickSixthMan(s, bench[Math.floor(rng() * bench.length)]);
    return chooseCoach(s, COACH_SYSTEMS[Math.floor(rng() * COACH_SYSTEMS.length)]);
  },
};

/** Best (player, slot) for the current spin by resulting TeamRating total. */
function bestStarterMove(engine: Engine, s: DraftState): { player: Player; slot: Position; score: number } | null {
  let best: { player: Player; slot: Position; score: number } | null = null;
  const rated: RatedPlayer[] = [];
  for (const pos of POSITIONS) if (s.lineup[pos]) rated.push(engine.rater.rate(s.lineup[pos]!));
  for (const p of currentPool(engine, s)) {
    rated.push(engine.rater.rate(p));
    const score = ratingFromRated(rated).total;
    rated.pop();
    if (!best || score > best.score) best = { player: p, slot: p.pos[0], score };
  }
  // Slot choice doesn't change the rating; take the first eligible slot.
  if (best) best.slot = eligibleSlots(s, best.player)[0];
  return best;
}

/** Below this individual rating the greedy bot burns a respin, if it has one. */
export const GREEDY_RESPIN_IR = 72;

export const GreedySkillBot: Bot = {
  name: 'GreedySkillBot',
  draft(engine, runSeed, mode = 'classic') {
    let s = createDraft(mode, runSeed);
    while (s.phase === 'starters') {
      s = spin(engine, s);
      let move = bestStarterMove(engine, s)!;
      for (const kind of ['team', 'era'] as const) {
        if (engine.rater.rate(move.player).ir >= GREEDY_RESPIN_IR || !canRespin(s, kind)) continue;
        const rerolled = kind === 'team' ? respinTeam(engine, s) : respinEra(engine, s);
        if (rerolled === s) continue;
        s = rerolled;
        move = bestStarterMove(engine, s)!;
      }
      s = pickStarter(s, move.player, move.slot);
    }
    s = spin(engine, s);
    let bench = currentPool(engine, s)[0];
    for (const p of currentPool(engine, s)) if (engine.rater.rate(p).ir > engine.rater.rate(bench).ir) bench = p;
    s = pickSixthMan(s, bench);
    let coach: CoachSystem = COACH_SYSTEMS[0];
    let bestTotal = -Infinity;
    for (const c of COACH_SYSTEMS) {
      const t = teamRating(engine.rater, s.lineup, s.sixthMan, c).total;
      if (t > bestTotal) {
        bestTotal = t;
        coach = c;
      }
    }
    return chooseCoach(s, coach);
  },
};

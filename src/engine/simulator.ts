/**
 * Hybrid simulation engine:
 *   Stage 1  era-normalised individual rating (IR)
 *   Stage 2  deterministic TeamRating with synergy, 6th man and coach fit
 *            baked in BEFORE the win-probability curve
 *   Stage 3  logistic per-game p_win (capped at P_MAX) + seeded 82-game season
 */
import { FRANCHISES } from '../config/franchises';
import { rngFor } from './prng';
import { POSITIONS, type Dataset, type Decade, type OpponentSeason, type Player, type Position } from './types';

// ---------------------------------------------------------------------------
// Tunables (verified by tests/calibration.test.ts; explore with `npm run calibrate -- 10000 <seed> --sweep`)
// ---------------------------------------------------------------------------
export const SIM = {
  GAMES: 82,
  /** Per-game win-probability ceiling: 0.9625^82 ≈ 4.4 % best-case 82-0 odds. */
  P_MAX: 0.9625,
  /** Logistic scale (rating points per e-fold of odds). */
  LOGISTIC_SCALE: 5,
  /** Opponent strength = OPP_BASE + OPP_SRS_K * historical SRS. */
  OPP_BASE: 77,
  OPP_SRS_K: 1.0,
};

// ---------------------------------------------------------------------------
// Stage 1 — individual rating
// ---------------------------------------------------------------------------
export interface RatedPlayer {
  player: Player;
  /** Era-normalised individual rating (~40 bench, ~55 starter, 85+ star). */
  ir: number;
  norm: { pts: number; reb: number; ast: number; stl: number; blk: number; tsRel: number };
  /** Defensive impact score (era-normalised stl/blk blend). */
  def: number;
  shooter: boolean;
  highUsage: boolean;
  elitePlaymaker: boolean;
  ballHandler: boolean;
  rimProtector: boolean;
  perimeterDefender: boolean;
  rebounder: boolean;
}

export const THRESHOLDS = {
  ELITE_APG: 7.5,
  HANDLER_APG: 4.5,
  RIM_BPG: 2.0,
  PERIMETER_SPG: 1.8,
  /** Era-relative scoring share (ppg / era mean) that marks a high-usage scorer. */
  HIGH_USAGE_PTS: 1.6,
  REBOUNDER_REB: 1.7,
};

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

function primaryPos(p: Player): Position {
  return p.pos[0];
}

/** Outside shooter: real 3-point volume+accuracy vs. era, or FT% proxy before the 3-point line. */
function isShooter(p: Player, era: Dataset['eras'][Decade]): boolean {
  if (p.season >= 1980 && era.tpa > 0) {
    const volume = p.tpa >= Math.max(1.0, 0.75 * era.tpa);
    const accuracy = p.tpp >= era.tpp - 0.015;
    if (volume && accuracy) return true;
    if (p.season >= 1990) return false;
  }
  // Pre-3pt (and early-3pt) era proxy: elite free-throw shooters on the perimeter.
  const pos = primaryPos(p);
  return p.ftp >= 0.8 && (pos === 'PG' || pos === 'SG' || pos === 'SF');
}

export function createRater(dataset: Dataset) {
  const { eras } = dataset;

  // Positional defensive baselines from tracked (1973-74+) cards, in era-normalised units.
  const sums = new Map<Position, { stl: number; blk: number; reb: number; ast: number; n: number }>();
  for (const p of dataset.players) {
    if (p.defEst) continue;
    const e = eras[p.decade];
    const s = sums.get(primaryPos(p)) ?? { stl: 0, blk: 0, reb: 0, ast: 0, n: 0 };
    s.stl += p.spg / e.spg;
    s.blk += p.bpg / e.bpg;
    s.reb += p.rpg / e.rpg;
    s.ast += p.apg / e.apg;
    s.n++;
    sums.set(primaryPos(p), s);
  }
  const posDef = new Map(
    POSITIONS.map((pos) => {
      const s = sums.get(pos)!;
      return [pos, { stl: s.stl / s.n, blk: s.blk / s.n, reb: s.reb / s.n, ast: s.ast / s.n }];
    }),
  );

  const cache = new Map<Player, RatedPlayer>();

  function rate(p: Player): RatedPlayer {
    const hit = cache.get(p);
    if (hit) return hit;
    const e = eras[p.decade];
    const pts = p.ppg / e.ppg;
    const reb = p.rpg / e.rpg;
    const ast = p.apg / e.apg;
    let stl: number;
    let blk: number;
    if (p.defEst) {
      // Pre-1973-74: no tracked steals/blocks. Instead of a flat inflated bonus,
      // give the position's average defensive value, nudged by archetype
      // (rebounding share -> rim protection, playmaking share -> ball pressure).
      const base = posDef.get(primaryPos(p))!;
      blk = base.blk * clamp(Math.sqrt(reb / base.reb), 0.75, 1.3);
      stl = base.stl * clamp(Math.sqrt(ast / base.ast), 0.85, 1.2);
    } else {
      stl = p.spg / e.spg;
      blk = p.bpg / e.bpg;
    }
    const tsRel = p.ts - e.ts;
    const composite =
      1.0 * Math.min(pts, 3) +
      0.4 * Math.min(reb, 3) +
      0.45 * Math.min(ast, 3.5) +
      0.3 * Math.min(stl, 3) +
      0.25 * Math.min(blk, 4) +
      6 * clamp(tsRel, -0.12, 0.12) * Math.min(pts, 2);
    const ir = Math.round((14 + 17 * composite) * 10) / 10;
    const def = 0.5 * Math.min(stl, 3) + 0.5 * Math.min(blk, 4);
    const r: RatedPlayer = {
      player: p,
      ir,
      norm: { pts, reb, ast, stl, blk, tsRel },
      def,
      shooter: isShooter(p, e),
      highUsage: pts >= THRESHOLDS.HIGH_USAGE_PTS,
      elitePlaymaker: p.apg >= THRESHOLDS.ELITE_APG,
      ballHandler: p.apg >= THRESHOLDS.HANDLER_APG,
      rimProtector: p.bpg >= THRESHOLDS.RIM_BPG,
      perimeterDefender: p.spg >= THRESHOLDS.PERIMETER_SPG,
      rebounder: reb >= THRESHOLDS.REBOUNDER_REB,
    };
    cache.set(p, r);
    return r;
  }

  return { rate, positionalDefense: posDef };
}
export type Rater = ReturnType<typeof createRater>;

// ---------------------------------------------------------------------------
// Stage 2 — TeamRating
// ---------------------------------------------------------------------------
export const COACH_SYSTEMS = ['paceSpace', 'motion', 'gritGrind'] as const;
export type CoachSystem = (typeof COACH_SYSTEMS)[number];

export const COACH_INFO: Record<CoachSystem, { label: string; blurb: string }> = {
  paceSpace: { label: 'Pace & Space', blurb: 'Rewards shooters and a lead playmaker.' },
  motion: { label: 'Motion / Triangle', blurb: 'Rewards passing across the lineup and positional versatility.' },
  gritGrind: { label: 'Grit & Grind', blurb: 'Rewards rim protection, perimeter defense and rebounding.' },
};

export type Lineup = Partial<Record<Position, Player>>;

export interface TeamRatingBreakdown {
  /** Mean individual rating of the filled starters. */
  base: number;
  spacing: number;
  playmaking: number;
  usage: number;
  defense: number;
  bench: number;
  /** Coach fit in [0, 1] and the resulting multiplier on the pre-coach rating. */
  coachFit: number;
  coachMultiplier: number;
  total: number;
  counts: { shooters: number; nonShooters: number; highUsage: number; elitePlaymakers: number; rimProtectors: number; perimeterDefenders: number };
}

export const SYNERGY = {
  SPACING_BONUS_2: 1.5,
  SPACING_BONUS_EXTRA: 0.5, // per shooter beyond 2, up to 4
  SPACING_PENALTY_4: -3.0,
  SPACING_PENALTY_5: -4.5,
  ELITE_PLAYMAKER: 2.0,
  NO_HANDLER: -1.5,
  /** Diminishing returns: -USAGE_K * (n-2)^1.5 for n >= 3 high-usage scorers (-5.2 at five). */
  USAGE_K: 1.0,
  RIM: 1.5,
  PERIMETER: 1.0,
  BALANCED_DEFENSE: 0.5,
  NO_DEFENDER: -1.0,
  BENCH_K: 0.12,
  BENCH_PIVOT: 50,
  COACH_MIN: 0.97,
  COACH_RANGE: 0.07,
};

export function coachFit(coach: CoachSystem, starters: readonly RatedPlayer[]): number {
  const n = starters.length || 1;
  switch (coach) {
    case 'paceSpace': {
      const shooters = starters.filter((r) => r.shooter).length;
      const lead = starters.some((r) => r.elitePlaymaker) ? 1 : starters.some((r) => r.ballHandler) ? 0.5 : 0;
      return clamp(0.75 * Math.min(shooters, 4) / 4 + 0.25 * lead, 0, 1);
    }
    case 'motion': {
      const passers = starters.filter((r) => r.norm.ast >= 1.0).length;
      const versatile = starters.filter((r) => r.player.pos.length > 1).length;
      const scorers = starters.filter((r) => r.highUsage).length;
      return clamp(0.55 * passers / n + 0.25 * Math.min(versatile, 3) / 3 + 0.2 * (scorers <= 2 ? 1 : 0), 0, 1);
    }
    case 'gritGrind': {
      const defAvg = starters.reduce((s, r) => s + r.def, 0) / n;
      const rim = starters.some((r) => r.rimProtector) ? 1 : 0;
      const reb = starters.filter((r) => r.rebounder).length;
      return clamp(0.5 * clamp((defAvg - 0.8) / 0.8, 0, 1) + 0.3 * rim + 0.2 * Math.min(reb, 2) / 2, 0, 1);
    }
  }
}

export function teamRating(
  rater: Rater,
  lineup: Lineup,
  sixthMan?: Player | null,
  coach?: CoachSystem | null,
): TeamRatingBreakdown {
  const starters: RatedPlayer[] = [];
  for (const pos of POSITIONS) {
    const p = lineup[pos];
    if (p) starters.push(rater.rate(p));
  }
  return ratingFromRated(starters, sixthMan ? rater.rate(sixthMan) : null, coach);
}

/** TeamRating from already-rated starters (allocation-light hot path for bots). */
export function ratingFromRated(
  starters: readonly RatedPlayer[],
  sixth?: RatedPlayer | null,
  coach?: CoachSystem | null,
): TeamRatingBreakdown {
  const n = starters.length;
  const counts = { shooters: 0, nonShooters: 0, highUsage: 0, elitePlaymakers: 0, rimProtectors: 0, perimeterDefenders: 0 };
  let irSum = 0;
  let handlers = 0;
  for (const r of starters) {
    irSum += r.ir;
    if (r.shooter) counts.shooters++;
    else counts.nonShooters++;
    if (r.highUsage) counts.highUsage++;
    if (r.elitePlaymaker) counts.elitePlaymakers++;
    if (r.ballHandler) handlers++;
    if (r.rimProtector) counts.rimProtectors++;
    if (r.perimeterDefender) counts.perimeterDefenders++;
  }
  const base = n ? irSum / n : 0;

  let spacing = 0;
  if (counts.shooters >= 2) spacing += SYNERGY.SPACING_BONUS_2 + SYNERGY.SPACING_BONUS_EXTRA * (Math.min(counts.shooters, 4) - 2);
  if (counts.nonShooters >= 5) spacing += SYNERGY.SPACING_PENALTY_5;
  else if (counts.nonShooters >= 4) spacing += SYNERGY.SPACING_PENALTY_4;

  let playmaking = 0;
  if (counts.elitePlaymakers > 0) playmaking += SYNERGY.ELITE_PLAYMAKER;
  if (n === 5 && handlers === 0) playmaking += SYNERGY.NO_HANDLER;

  const usage = counts.highUsage >= 3 ? -SYNERGY.USAGE_K * Math.pow(counts.highUsage - 2, 1.5) : 0;

  let defense = 0;
  const rim = counts.rimProtectors > 0;
  const per = counts.perimeterDefenders > 0;
  if (rim) defense += SYNERGY.RIM;
  if (per) defense += SYNERGY.PERIMETER;
  if (rim && per) defense += SYNERGY.BALANCED_DEFENSE;
  if (n === 5 && !rim && !per) defense += SYNERGY.NO_DEFENDER;

  const bench = sixth ? SYNERGY.BENCH_K * (sixth.ir - SYNERGY.BENCH_PIVOT) : 0;

  const fit = coach ? coachFit(coach, starters) : 0;
  const coachMultiplier = coach ? SYNERGY.COACH_MIN + SYNERGY.COACH_RANGE * fit : 1;

  const total = (base + spacing + playmaking + usage + defense + bench) * coachMultiplier;
  return { base, spacing, playmaking, usage, defense, bench, coachFit: fit, coachMultiplier, total, counts };
}

// ---------------------------------------------------------------------------
// Stage 3 — logistic p_win + seeded 82-game season
// ---------------------------------------------------------------------------
export function opponentStrength(o: OpponentSeason): number {
  return SIM.OPP_BASE + SIM.OPP_SRS_K * o.srs;
}

export function winProbability(teamRatingTotal: number, oppStrength: number): number {
  const p = 1 / (1 + Math.exp(-(teamRatingTotal - oppStrength) / SIM.LOGISTIC_SCALE));
  return p > SIM.P_MAX ? SIM.P_MAX : p;
}

export interface GameResult {
  game: number;
  opponent: OpponentSeason;
  opponentStrength: number;
  pWin: number;
  win: boolean;
  /** Final margin from our perspective (+ win, - loss). */
  margin: number;
}

export interface SeasonResult {
  runSeed: number;
  rosterKey: string;
  rating: TeamRatingBreakdown;
  wins: number;
  losses: number;
  perfect: boolean;
  games: GameResult[];
  lostTo: { game: number; label: string; margin: number }[];
}

/** Display label for an opponent season, e.g. "'96 Chicago Red". Never uses official nicknames. */
export function opponentLabel(o: OpponentSeason): string {
  return `'${String(o.season % 100).padStart(2, '0')} ${FRANCHISES[o.team].name}`;
}

/** Canonical key for a roster: slot order + 6th man + coach. */
export function rosterKey(lineup: Lineup, sixthMan?: Player | null, coach?: CoachSystem | null): string {
  return [...POSITIONS.map((p) => lineup[p]?.id ?? '-'), sixthMan?.id ?? '-', coach ?? '-'].join(',');
}

/**
 * The run's schedule depends only on the runSeed; the outcomes depend on the
 * runSeed + roster. Re-simulating the same roster in the same run therefore
 * always returns the same season ("re-sim" exploit protection).
 */
export function buildSchedule(opponents: OpponentSeason[], runSeed: number): OpponentSeason[] {
  const rng = rngFor(runSeed, 'schedule');
  const out: OpponentSeason[] = [];
  for (let i = 0; i < SIM.GAMES; i++) out.push(opponents[Math.floor(rng() * opponents.length)]);
  return out;
}

export function simulateSeason(
  rater: Rater,
  opponents: OpponentSeason[],
  runSeed: number,
  lineup: Lineup,
  sixthMan: Player | null,
  coach: CoachSystem | null,
  opts: { detail?: boolean; schedule?: OpponentSeason[] } = {},
): SeasonResult {
  const rating = teamRating(rater, lineup, sixthMan, coach);
  const key = rosterKey(lineup, sixthMan, coach);
  const schedule = opts.schedule ?? buildSchedule(opponents, runSeed);
  const rng = rngFor(runSeed, 'season', key);
  const detail = opts.detail ?? true;
  const games: GameResult[] = [];
  const lostTo: SeasonResult['lostTo'] = [];
  let wins = 0;
  for (let g = 0; g < SIM.GAMES; g++) {
    const opp = schedule[g];
    const strength = opponentStrength(opp);
    const pWin = winProbability(rating.total, strength);
    const win = rng() < pWin;
    const edge = Math.abs(rating.total - strength);
    const u = rng();
    // Margins: wins scale with the rating edge; losses are mostly close.
    const margin = win
      ? 1 + Math.floor(u * (4 + edge * 0.8))
      : -(1 + Math.floor(u * u * (8 + Math.max(0, strength - rating.total) * 0.8)));
    if (win) wins++;
    else lostTo.push({ game: g + 1, label: opponentLabel(opp), margin: -margin });
    if (detail) games.push({ game: g + 1, opponent: opp, opponentStrength: strength, pWin, win, margin });
  }
  return { runSeed, rosterKey: key, rating, wins, losses: SIM.GAMES - wins, perfect: wins === SIM.GAMES, games, lostTo };
}

/** Exact probability of 82-0 for a rating against a given schedule (for analysis/tests). */
export function perfectSeasonProbability(total: number, schedule: OpponentSeason[]): number {
  let logP = 0;
  for (const o of schedule) logP += Math.log(winProbability(total, opponentStrength(o)));
  return Math.exp(logP);
}

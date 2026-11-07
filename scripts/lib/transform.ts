/**
 * Pure, deterministic transform from Basketball-Reference style season rows
 * to the game's compact dataset. Kept free of I/O so it can be unit-tested
 * against the fixture CSVs in tests/fixtures.
 */
import { toFranchise, type FranchiseCode } from '../../src/config/franchises';
import {
  DECADES,
  POSITIONS,
  decadeOf,
  type Decade,
  type EraBaseline,
  type OpponentSeason,
  type Player,
  type Position,
} from '../../src/engine/types';

export const FIRST_SEASON = 1960; // 1959-60
export const LAST_SEASON = 2026; // 2025-26 (last completed season)
export const MIN_GAMES = 20;
export const MIN_MPG = 10;
/** Keep the N most-used players (by total minutes in the stint) per franchise-decade. */
export const MAX_CARDS_PER_POOL = 20;
/** Each position keeps at least this many cards per pool when the source has them. */
export const MIN_PER_POSITION_DEPTH = 2;
/** Steals and blocks became official stats in 1973-74. */
export const FIRST_DEF_STATS_SEASON = 1974;

const num = (s: string | undefined): number => {
  if (s === undefined || s === '' || s === 'NA') return NaN;
  return Number(s);
};
const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

interface SeasonRow {
  playerId: string;
  name: string;
  season: number;
  team: FranchiseCode;
  pos: Position;
  g: number;
  mpg: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number; // NaN pre-1974
  bpg: number; // NaN pre-1974
  ts: number;
  tpa: number;
  tpp: number;
  ftp: number;
}

const NAME_SUFFIXES = new Set(['Jr.', 'Sr.', 'II', 'III', 'IV', 'V']);

/** "Michael Jordan" -> "M. Jordan"; "Gary Payton II" -> "G. Payton II"; "Nenê" -> "Nenê". */
export function makeAlias(realName: string): string {
  const parts = realName.replace(/\*/g, '').trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? realName;
  let suffix = '';
  if (NAME_SUFFIXES.has(parts[parts.length - 1]) && parts.length > 2) suffix = ' ' + parts.pop();
  const last = parts.pop()!;
  return `${parts[0][0]}. ${last}${suffix}`;
}

function normalizePos(p: string): Position | null {
  const first = p.split('-')[0];
  return (POSITIONS as readonly string[]).includes(first) ? (first as Position) : null;
}

export function readSeasonRows(
  perGame: Record<string, string>[],
  advanced: Record<string, string>[],
): SeasonRow[] {
  const tsIndex = new Map<string, number>();
  for (const a of advanced) {
    if (a.lg !== 'NBA') continue;
    tsIndex.set(`${a.season}|${a.player_id}|${a.team}`, num(a.ts_percent));
  }
  const out: SeasonRow[] = [];
  for (const r of perGame) {
    if (r.lg !== 'NBA') continue;
    const season = Number(r.season);
    if (season < FIRST_SEASON || season > LAST_SEASON) continue;
    const team = toFranchise(r.team); // skips 2TM/3TM/TOT aggregate rows
    if (!team) continue;
    const pos = normalizePos(r.pos);
    if (!pos) continue;
    const g = num(r.g);
    const mpg = num(r.mp_per_game);
    if (!(g >= MIN_GAMES) || !(mpg >= MIN_MPG)) continue;
    const ppg = num(r.pts_per_game);
    const fga = num(r.fga_per_game);
    const fta = num(r.fta_per_game);
    let ts = tsIndex.get(`${r.season}|${r.player_id}|${r.team}`) ?? NaN;
    if (!Number.isFinite(ts) && fga + fta > 0) ts = ppg / (2 * (fga + 0.44 * fta));
    const tpa = num(r.x3pa_per_game);
    const tpp = num(r.x3p_percent);
    const ftp = num(r.ft_percent);
    const row: SeasonRow = {
      playerId: r.player_id,
      name: r.player.replace(/\*/g, ''),
      season,
      team,
      pos,
      g,
      mpg,
      ppg,
      rpg: num(r.trb_per_game),
      apg: num(r.ast_per_game),
      spg: season >= FIRST_DEF_STATS_SEASON ? num(r.stl_per_game) : NaN,
      bpg: season >= FIRST_DEF_STATS_SEASON ? num(r.blk_per_game) : NaN,
      ts: Number.isFinite(ts) ? ts : 0.5,
      tpa: Number.isFinite(tpa) ? tpa : 0,
      tpp: Number.isFinite(tpp) ? tpp : 0,
      ftp: Number.isFinite(ftp) ? ftp : 0.7,
    };
    if (![row.ppg, row.rpg, row.apg].every(Number.isFinite)) continue;
    out.push(row);
  }
  return out;
}

/** Minutes-weighted league means per decade (stl/blk from tracked seasons only). */
export function computeEraBaselines(rows: SeasonRow[]): Record<Decade, EraBaseline> {
  const acc = new Map<Decade, Record<keyof EraBaseline, [number, number]>>();
  for (const r of rows) {
    const d = decadeOf(r.season)!;
    let a = acc.get(d);
    if (!a) {
      a = { ppg: [0, 0], rpg: [0, 0], apg: [0, 0], spg: [0, 0], bpg: [0, 0], ts: [0, 0], tpa: [0, 0], tpp: [0, 0], ftp: [0, 0] };
      acc.set(d, a);
    }
    const w = r.mpg * r.g;
    const add = (k: keyof EraBaseline, v: number, weight = w) => {
      if (!Number.isFinite(v)) return;
      a![k][0] += v * weight;
      a![k][1] += weight;
    };
    add('ppg', r.ppg);
    add('rpg', r.rpg);
    add('apg', r.apg);
    add('spg', r.spg);
    add('bpg', r.bpg);
    add('ts', r.ts);
    add('ftp', r.ftp);
    if (r.season >= 1980) {
      add('tpa', r.tpa);
      if (r.tpa >= 1) add('tpp', r.tpp, r.tpa * r.g);
    }
  }
  const out = {} as Record<Decade, EraBaseline>;
  // 1960s has no tracked stl/blk: borrow 1970s (1974-79) means so ratios stay defined.
  for (const d of DECADES) {
    const a = acc.get(d);
    if (!a) throw new Error(`No data for ${d}`);
    const mean = (k: keyof EraBaseline) => (a[k][1] > 0 ? a[k][0] / a[k][1] : NaN);
    out[d] = {
      ppg: r3(mean('ppg')),
      rpg: r3(mean('rpg')),
      apg: r3(mean('apg')),
      spg: r3(mean('spg')),
      bpg: r3(mean('bpg')),
      ts: r3(mean('ts')),
      tpa: r3(mean('tpa') || 0),
      tpp: r3(mean('tpp') || 0),
      ftp: r3(mean('ftp')),
    };
  }
  if (!Number.isFinite(out['1960s'].spg)) {
    out['1960s'].spg = out['1970s'].spg;
    out['1960s'].bpg = out['1970s'].bpg;
  }
  return out;
}

/** Peak-season score used only to choose which season represents a card. */
const peakScore = (r: SeasonRow) =>
  r.ppg + 0.6 * r.rpg + 0.8 * r.apg + (Number.isFinite(r.spg) ? r.spg : 0) + (Number.isFinite(r.bpg) ? 0.7 * r.bpg : 0);

/**
 * Positional means of stl/blk from the first tracked seasons (1974-79), used to
 * display an estimate for 1960s/early-70s cards. The engine itself rates these
 * players with an archetype coefficient, not with the estimate.
 */
function positionalDefense(rows: SeasonRow[]) {
  const acc = new Map<Position, { s: number; b: number; r: number; w: number }>();
  for (const r of rows) {
    if (r.season < FIRST_DEF_STATS_SEASON || r.season > 1979) continue;
    const a = acc.get(r.pos) ?? { s: 0, b: 0, r: 0, w: 0 };
    const w = r.g * r.mpg;
    a.s += r.spg * w;
    a.b += r.bpg * w;
    a.r += r.rpg * w;
    a.w += w;
    acc.set(r.pos, a);
  }
  return new Map([...acc].map(([p, a]) => [p, { spg: a.s / a.w, bpg: a.b / a.w, rpg: a.r / a.w }]));
}

export function buildPlayers(rows: SeasonRow[], eras: Record<Decade, EraBaseline>): Player[] {
  const groups = new Map<string, SeasonRow[]>();
  for (const r of rows) {
    const key = `${r.playerId}:${r.team}:${decadeOf(r.season)}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  const posDef = positionalDefense(rows);
  const players: Player[] = [];
  for (const [id, list] of groups) {
    const peak = list.reduce((best, r) => (peakScore(r) > peakScore(best) ? r : best));
    const decade = decadeOf(peak.season)!;
    const posSet = new Set(list.map((r) => r.pos));
    const pos = POSITIONS.filter((p) => posSet.has(p));
    const defEst = !Number.isFinite(peak.spg);
    let spg = peak.spg;
    let bpg = peak.bpg;
    if (defEst) {
      // Display-only estimate: positional 1974-79 mean scaled by the player's
      // rebounding relative to his position (rim-protector proxy), era-adjusted.
      const base = posDef.get(peak.pos)!;
      const era = eras[decade];
      const rebFactor = Math.min(1.6, Math.max(0.6, peak.rpg / era.rpg / (base.rpg / eras['1970s'].rpg)));
      spg = base.spg * Math.min(1.25, Math.max(0.85, Math.sqrt(peak.apg / era.apg)));
      bpg = base.bpg * rebFactor;
    }
    players.push({
      id,
      pid: peak.playerId,
      realName: peak.name,
      aliasName: makeAlias(peak.name),
      team: peak.team,
      decade,
      season: peak.season,
      pos,
      g: peak.g,
      mpg: r1(peak.mpg),
      ppg: r1(peak.ppg),
      rpg: r1(peak.rpg),
      apg: r1(peak.apg),
      spg: r1(spg),
      bpg: r1(bpg),
      ts: r3(peak.ts),
      tpa: r1(peak.tpa),
      tpp: r3(peak.tpp),
      ftp: r3(peak.ftp),
      defEst,
    });
  }
  // Trim each franchise-decade to its most-used players to keep the bundle small.
  const minutes = new Map([...groups].map(([k, l]) => [k, l.reduce((s, r) => s + r.g * r.mpg, 0)]));
  const byPool = new Map<string, Player[]>();
  for (const p of players) {
    const k = `${p.team}|${p.decade}`;
    byPool.set(k, [...(byPool.get(k) ?? []), p]);
  }
  const kept: Player[] = [];
  for (const list of byPool.values()) {
    list.sort((a, b) => minutes.get(b.id)! - minutes.get(a.id)! || a.id.localeCompare(b.id));
    const chosen = list.slice(0, MAX_CARDS_PER_POOL);
    // Guarantee positional depth: top up thin positions from the trimmed tail.
    for (const pos of POSITIONS) {
      let have = chosen.filter((p) => p.pos.includes(pos)).length;
      for (const p of list.slice(MAX_CARDS_PER_POOL)) {
        if (have >= MIN_PER_POSITION_DEPTH) break;
        if (p.pos.includes(pos) && !chosen.includes(p)) {
          chosen.push(p);
          have++;
        }
      }
    }
    kept.push(...chosen);
  }
  kept.sort((a, b) => (a.team + a.decade + a.id).localeCompare(b.team + b.decade + b.id));
  return kept;
}

export function buildOpponents(teamSummaries: Record<string, string>[]): OpponentSeason[] {
  const out: OpponentSeason[] = [];
  for (const t of teamSummaries) {
    if (t.lg !== 'NBA') continue;
    const season = Number(t.season);
    if (season < FIRST_SEASON || season > LAST_SEASON) continue;
    const team = toFranchise(t.abbreviation);
    if (!team) continue;
    const srs = num(t.srs);
    if (!Number.isFinite(srs)) continue;
    out.push({ team, season, srs: Math.round(srs * 100) / 100, w: num(t.w), l: num(t.l) });
  }
  out.sort((a, b) => a.season - b.season || a.team.localeCompare(b.team));
  return out;
}

// ---- compact (columnar) serialisation -------------------------------------

export const PLAYER_COLS = [
  'id', 'realName', 'aliasName', 'team', 'decade', 'season', 'pos', 'g', 'mpg',
  'ppg', 'rpg', 'apg', 'spg', 'bpg', 'ts', 'tpa', 'tpp', 'ftp', 'defEst',
] as const satisfies readonly (keyof Player)[];

export function toColumnar(players: Player[]) {
  return {
    cols: PLAYER_COLS,
    rows: players.map((p) =>
      PLAYER_COLS.map((c) => (c === 'pos' ? p.pos.join('/') : c === 'defEst' ? (p.defEst ? 1 : 0) : p[c])),
    ),
  };
}

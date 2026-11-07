import type { FranchiseCode } from '../config/franchises';
import { POSITIONS, decadeOf, type Dataset, type Decade, type EraBaseline, type OpponentSeason, type Player, type Position } from './types';

export interface RawPlayersFile {
  eras: Record<Decade, EraBaseline>;
  cols: readonly string[];
  rows: (string | number)[][];
}
export interface RawOpponentsFile {
  cols: readonly string[];
  rows: (string | number)[][];
}

export function decodePlayers(file: RawPlayersFile): Player[] {
  const idx = Object.fromEntries(file.cols.map((c, i) => [c, i]));
  return file.rows.map((r) => {
    const n = (k: string) => r[idx[k]] as number;
    const s = (k: string) => r[idx[k]] as string;
    return {
      id: s('id'),
      pid: s('id').slice(0, s('id').indexOf(':')),
      realName: s('realName'),
      aliasName: s('aliasName'),
      team: s('team') as FranchiseCode,
      decade: s('decade') as Decade,
      season: n('season'),
      pos: s('pos').split('/') as Position[],
      g: n('g'),
      mpg: n('mpg'),
      ppg: n('ppg'),
      rpg: n('rpg'),
      apg: n('apg'),
      spg: n('spg'),
      bpg: n('bpg'),
      ts: n('ts'),
      tpa: n('tpa'),
      tpp: n('tpp'),
      ftp: n('ftp'),
      defEst: n('defEst') === 1,
    };
  });
}

export function decodeOpponents(file: RawOpponentsFile): OpponentSeason[] {
  return file.rows.map(([team, season, srs, w, l]) => ({
    team: team as FranchiseCode,
    season: season as number,
    srs: srs as number,
    w: w as number,
    l: l as number,
  }));
}

export function makeDataset(players: RawPlayersFile, opponents: RawOpponentsFile): Dataset {
  return { players: decodePlayers(players), eras: players.eras, opponents: decodeOpponents(opponents) };
}

export type PoolKey = `${FranchiseCode}|${Decade}`;
export const poolKey = (team: FranchiseCode, decade: Decade): PoolKey => `${team}|${decade}`;

/** Minimum eligible players per position for a pool to be spinnable. */
export const MIN_PER_POSITION = 2;
/** A franchise-decade needs at least this many cards to be an active pool. */
export const MIN_POOL_SIZE = 12;

export function buildPools(players: Player[]): Map<PoolKey, Player[]> {
  const pools = new Map<PoolKey, Player[]>();
  for (const p of players) {
    const k = poolKey(p.team, p.decade);
    const list = pools.get(k);
    if (list) list.push(p);
    else pools.set(k, [p]);
  }
  return pools;
}

export function positionCounts(pool: Player[]): Record<Position, number> {
  const c = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  for (const p of pool) for (const pos of p.pos) c[pos]++;
  return c;
}

/** A franchise-decade counts only if the franchise played this many NBA seasons in it. */
export const MIN_ACTIVE_SEASONS = 3;

/** NBA seasons played per franchise-decade, from the opponents (team-season) table. */
export function seasonsPlayed(opponents: OpponentSeason[]): Map<PoolKey, number> {
  const seasons = new Map<PoolKey, number>();
  for (const o of opponents) {
    const d = decadeOf(o.season);
    if (!d) continue;
    const k = poolKey(o.team, d);
    seasons.set(k, (seasons.get(k) ?? 0) + 1);
  }
  return seasons;
}

/**
 * Active pools = franchise-decades where the franchise played at least
 * MIN_ACTIVE_SEASONS NBA seasons. This is the same rule validatePools.ts
 * checks, and the wheel only lands on these. The depth guard below keeps the
 * draft playable even if the data were ever rebuilt without validation.
 */
export function activePools(pools: Map<PoolKey, Player[]>, opponents: OpponentSeason[]): PoolKey[] {
  const seasons = seasonsPlayed(opponents);
  const keys: PoolKey[] = [];
  for (const [k, list] of pools) {
    if ((seasons.get(k) ?? 0) < MIN_ACTIVE_SEASONS) continue;
    if (list.length < MIN_POOL_SIZE) continue;
    const c = positionCounts(list);
    if (POSITIONS.every((p) => c[p] >= MIN_PER_POSITION)) keys.push(k);
  }
  return keys.sort();
}

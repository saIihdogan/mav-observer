/**
 * npm run validate:data
 *
 * 1. Every numeric stat in every card is a finite number (no NaN/undefined/null).
 * 2. For each of the 30 franchises x 7 decades, a pool is "active" when the
 *    franchise played at least MIN_ACTIVE_SEASONS NBA seasons in that decade.
 *    Every active pool must contain >= MIN_PER_POSITION eligible players for
 *    each of PG/SG/SF/PF/C. Inactive combos (e.g. Toronto 1960s) are listed and
 *    never offered by the wheel.
 */
import { readFileSync } from 'node:fs';
import { FRANCHISE_CODES, FRANCHISES } from '../src/config/franchises';
import { buildPools, decodeOpponents, decodePlayers, MIN_PER_POSITION, MIN_POOL_SIZE, poolKey, positionCounts } from '../src/engine/dataset';
import { DECADES, POSITIONS, decadeOf, type Player } from '../src/engine/types';

export const MIN_ACTIVE_SEASONS = 3;

const NUMERIC_FIELDS = ['season', 'g', 'mpg', 'ppg', 'rpg', 'apg', 'spg', 'bpg', 'ts', 'tpa', 'tpp', 'ftp'] as const satisfies readonly (keyof Player)[];
const STRING_FIELDS = ['id', 'realName', 'aliasName', 'team', 'decade'] as const satisfies readonly (keyof Player)[];

export interface ValidationReport {
  errors: string[];
  active: number;
  inactive: string[];
  cards: number;
}

export function validate(playersJson: unknown, opponentsJson: unknown): ValidationReport {
  const errors: string[] = [];
  const players = decodePlayers(playersJson as never);
  const opponents = decodeOpponents(opponentsJson as never);
  const eras = (playersJson as { eras: Record<string, Record<string, number>> }).eras;

  for (const d of DECADES) {
    for (const [k, v] of Object.entries(eras[d] ?? {})) {
      if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`era ${d}.${k} is ${v}`);
    }
  }
  const ids = new Set<string>();
  for (const p of players) {
    if (ids.has(p.id)) errors.push(`duplicate id ${p.id}`);
    ids.add(p.id);
    for (const f of NUMERIC_FIELDS) {
      const v = p[f];
      if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${p.id}: ${f} = ${v}`);
    }
    for (const f of STRING_FIELDS) if (typeof p[f] !== 'string' || !p[f]) errors.push(`${p.id}: ${f} missing`);
    if (!p.pos.length || !p.pos.every((x) => (POSITIONS as readonly string[]).includes(x))) errors.push(`${p.id}: bad pos ${p.pos}`);
    if (!(p.team in FRANCHISES)) errors.push(`${p.id}: unknown franchise ${p.team}`);
  }
  for (const o of opponents) {
    if (![o.season, o.srs, o.w, o.l].every(Number.isFinite)) errors.push(`opponent ${o.team} ${o.season} has non-finite values`);
  }

  const seasons = new Map<string, number>();
  for (const o of opponents) {
    const k = poolKey(o.team, decadeOf(o.season)!);
    seasons.set(k, (seasons.get(k) ?? 0) + 1);
  }
  const pools = buildPools(players);
  let active = 0;
  const inactive: string[] = [];
  for (const team of FRANCHISE_CODES) {
    for (const d of DECADES) {
      const k = poolKey(team, d);
      const played = seasons.get(k) ?? 0;
      if (played < MIN_ACTIVE_SEASONS) {
        inactive.push(`${k} (${played} seasons)`);
        continue;
      }
      active++;
      const pool = pools.get(k) ?? [];
      if (pool.length < MIN_POOL_SIZE) errors.push(`${k}: only ${pool.length} cards (< ${MIN_POOL_SIZE})`);
      const c = positionCounts(pool);
      for (const pos of POSITIONS) {
        if (c[pos] < MIN_PER_POSITION) errors.push(`${k}: ${pos} has ${c[pos]} eligible players (< ${MIN_PER_POSITION})`);
      }
    }
  }
  return { errors, active, inactive, cards: players.length };
}

const isMain = process.argv[1]?.endsWith('validatePools.ts');
if (isMain) {
  const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
  const r = validate(read('src/data/players.min.json'), read('src/data/opponents.min.json'));
  console.log(`Cards: ${r.cards}`);
  console.log(`Active pools: ${r.active} / ${FRANCHISE_CODES.length * DECADES.length}`);
  console.log(`Inactive (franchise not in NBA that decade): ${r.inactive.length}`);
  console.log('  ' + r.inactive.join(', '));
  if (r.errors.length) {
    console.error(`\n${r.errors.length} validation error(s):`);
    for (const e of r.errors.slice(0, 50)) console.error('  - ' + e);
    process.exit(1);
  }
  console.log('\nAll active pools have every position covered; no NaN/undefined stats.');
}

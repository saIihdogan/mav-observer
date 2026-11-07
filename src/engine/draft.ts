/**
 * Draft rules (pure, immutable state transitions — UI-agnostic).
 *
 * 5 starter spins (one pick per spin into an open, eligible slot), then the
 * bonus round: one 6th-man spin (any position) and a coach system choice.
 * Every wheel outcome is derived from runSeed + spin index (+ respin index),
 * so the Daily Challenge gives every player the same wheel sequence.
 */
import type { FranchiseCode } from '../config/franchises';
import { buildPools, activePools, type PoolKey } from './dataset';
import { rngFor } from './prng';
import { createRater, simulateSeason, teamRating, type CoachSystem, type Lineup, type Rater, type SeasonResult } from './simulator';
import { POSITIONS, type Dataset, type Decade, type Player, type Position } from './types';

export type GameMode = 'classic' | 'daily';
export type DraftPhase = 'starters' | 'sixthMan' | 'coach' | 'done';

export interface Spin {
  team: FranchiseCode;
  decade: Decade;
}

export interface DraftState {
  mode: GameMode;
  runSeed: number;
  phase: DraftPhase;
  /** 0-4 starters, 5 = 6th man spin. */
  spinIndex: number;
  current: Spin | null;
  teamRespins: number;
  eraRespins: number;
  /** Extra respins granted (e.g. one rewarded ad per Classic run). Either wheel. */
  bonusRespins: number;
  /** Respins used on the current spin (keeps respin outcomes deterministic). */
  respinsThisSpin: number;
  lineup: Lineup;
  sixthMan: Player | null;
  coach: CoachSystem | null;
}

export const FREE_TEAM_RESPINS = 1;
export const FREE_ERA_RESPINS = 1;

export interface Engine {
  dataset: Dataset;
  rater: Rater;
  pools: Map<PoolKey, Player[]>;
  active: PoolKey[];
  activeByDecade: Map<Decade, FranchiseCode[]>;
  activeByTeam: Map<FranchiseCode, Decade[]>;
}

export function createEngine(dataset: Dataset): Engine {
  const pools = buildPools(dataset.players);
  const active = activePools(pools, dataset.opponents);
  const activeByDecade = new Map<Decade, FranchiseCode[]>();
  const activeByTeam = new Map<FranchiseCode, Decade[]>();
  for (const k of active) {
    const [team, decade] = k.split('|') as [FranchiseCode, Decade];
    activeByDecade.set(decade, [...(activeByDecade.get(decade) ?? []), team]);
    activeByTeam.set(team, [...(activeByTeam.get(team) ?? []), decade]);
  }
  return { dataset, rater: createRater(dataset), pools, active, activeByDecade, activeByTeam };
}

export function createDraft(mode: GameMode, runSeed: number): DraftState {
  return {
    mode,
    runSeed: runSeed >>> 0,
    phase: 'starters',
    spinIndex: 0,
    current: null,
    teamRespins: FREE_TEAM_RESPINS,
    eraRespins: FREE_ERA_RESPINS,
    bonusRespins: 0,
    respinsThisSpin: 0,
    lineup: {},
    sixthMan: null,
    coach: null,
  };
}

export function spin(engine: Engine, s: DraftState): DraftState {
  if (s.current || (s.phase !== 'starters' && s.phase !== 'sixthMan')) return s;
  const rng = rngFor(s.runSeed, 'spin', s.spinIndex);
  const key = engine.active[Math.floor(rng() * engine.active.length)];
  const [team, decade] = key.split('|') as [FranchiseCode, Decade];
  return { ...s, current: { team, decade }, respinsThisSpin: 0 };
}

function useRespin(s: DraftState, kind: 'team' | 'era'): DraftState | null {
  if (kind === 'team' && s.teamRespins > 0) return { ...s, teamRespins: s.teamRespins - 1 };
  if (kind === 'era' && s.eraRespins > 0) return { ...s, eraRespins: s.eraRespins - 1 };
  if (s.bonusRespins > 0) return { ...s, bonusRespins: s.bonusRespins - 1 };
  return null;
}

export function canRespin(s: DraftState, kind: 'team' | 'era'): boolean {
  if (!s.current) return false;
  return (kind === 'team' ? s.teamRespins : s.eraRespins) > 0 || s.bonusRespins > 0;
}

/** Re-roll the team, keeping the decade. */
export function respinTeam(engine: Engine, s: DraftState): DraftState {
  if (!s.current || !canRespin(s, 'team')) return s;
  const options = (engine.activeByDecade.get(s.current.decade) ?? []).filter((t) => t !== s.current!.team);
  if (!options.length) return s;
  const next = useRespin(s, 'team')!;
  const rng = rngFor(s.runSeed, 'respin-team', s.spinIndex, s.respinsThisSpin);
  return { ...next, current: { ...s.current, team: options[Math.floor(rng() * options.length)] }, respinsThisSpin: s.respinsThisSpin + 1 };
}

/** Re-roll the decade, keeping the team. */
export function respinEra(engine: Engine, s: DraftState): DraftState {
  if (!s.current || !canRespin(s, 'era')) return s;
  const options = (engine.activeByTeam.get(s.current.team) ?? []).filter((d) => d !== s.current!.decade);
  if (!options.length) return s;
  const next = useRespin(s, 'era')!;
  const rng = rngFor(s.runSeed, 'respin-era', s.spinIndex, s.respinsThisSpin);
  return { ...next, current: { ...s.current, decade: options[Math.floor(rng() * options.length)] }, respinsThisSpin: s.respinsThisSpin + 1 };
}

export function grantBonusRespin(s: DraftState): DraftState {
  return { ...s, bonusRespins: s.bonusRespins + 1 };
}

const personId = (p: Player) => p.pid;

/** Same real person can't be drafted twice (e.g. from two different decades). */
export function isTaken(s: DraftState, p: Player): boolean {
  const pid = personId(p);
  if (s.sixthMan && personId(s.sixthMan) === pid) return true;
  for (const pos of POSITIONS) {
    const q = s.lineup[pos];
    if (q && personId(q) === pid) return true;
  }
  return false;
}

export function openSlots(s: DraftState): Position[] {
  return POSITIONS.filter((p) => !s.lineup[p]);
}

export function eligibleSlots(s: DraftState, p: Player): Position[] {
  if (isTaken(s, p)) return [];
  return p.pos.filter((pos) => !s.lineup[pos]);
}

/** Players from the current spin's pool that can be picked right now. */
export function currentPool(engine: Engine, s: DraftState): Player[] {
  if (!s.current) return [];
  const pool = engine.pools.get(`${s.current.team}|${s.current.decade}`) ?? [];
  const taken: string[] = [];
  for (const pos of POSITIONS) if (s.lineup[pos]) taken.push(s.lineup[pos]!.pid);
  if (s.sixthMan) taken.push(s.sixthMan.pid);
  const open = openSlots(s);
  const out: Player[] = [];
  for (const p of pool) {
    if (taken.includes(p.pid)) continue;
    if (s.phase === 'sixthMan' || p.pos.some((pos) => open.includes(pos))) out.push(p);
  }
  return out;
}

export function pickStarter(s: DraftState, p: Player, slot: Position): DraftState {
  if (s.phase !== 'starters' || !s.current) throw new Error('Not in starter phase');
  if (!eligibleSlots(s, p).includes(slot)) throw new Error(`${p.id} cannot fill ${slot}`);
  const lineup = { ...s.lineup, [slot]: p };
  const full = POSITIONS.every((pos) => lineup[pos]);
  return { ...s, lineup, current: null, spinIndex: s.spinIndex + 1, phase: full ? 'sixthMan' : 'starters' };
}

export function pickSixthMan(s: DraftState, p: Player): DraftState {
  if (s.phase !== 'sixthMan' || !s.current) throw new Error('Not in 6th man phase');
  if (isTaken(s, p)) throw new Error(`${p.id} already drafted`);
  return { ...s, sixthMan: p, current: null, spinIndex: s.spinIndex + 1, phase: 'coach' };
}

export function chooseCoach(s: DraftState, coach: CoachSystem): DraftState {
  if (s.phase !== 'coach') throw new Error('Not in coach phase');
  return { ...s, coach, phase: 'done' };
}

/** Combo-position flexibility: swap two starters if both are eligible at the other slot. */
export function canSwap(s: DraftState, a: Position, b: Position): boolean {
  const pa = s.lineup[a];
  const pb = s.lineup[b];
  if (!pa || a === b) return false;
  if (!pa.pos.includes(b)) return false;
  return !pb || pb.pos.includes(a);
}

export function swapSlots(s: DraftState, a: Position, b: Position): DraftState {
  if (!canSwap(s, a, b)) return s;
  const lineup = { ...s.lineup, [a]: s.lineup[b], [b]: s.lineup[a] };
  if (!lineup[a]) delete lineup[a];
  return { ...s, lineup };
}

export function currentRating(engine: Engine, s: DraftState) {
  return teamRating(engine.rater, s.lineup, s.sixthMan, s.coach);
}

/** Final season — locked to runSeed + roster (see simulateSeason). */
export function finishSeason(engine: Engine, s: DraftState, opts?: { detail?: boolean }): SeasonResult {
  if (s.phase !== 'done') throw new Error('Draft not finished');
  return simulateSeason(engine.rater, engine.dataset.opponents, s.runSeed, s.lineup, s.sixthMan, s.coach, opts);
}

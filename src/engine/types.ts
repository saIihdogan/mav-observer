import type { FranchiseCode } from '../config/franchises';

export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
export type Position = (typeof POSITIONS)[number];

export const DECADES = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'] as const;
export type Decade = (typeof DECADES)[number];

/** One draftable card: a player's peak season with one franchise in one decade. */
export interface Player {
  /** Unique card id: "<personId>:<franchise>:<decade>". */
  id: string;
  /** Source person id — the same person can't be drafted twice in one run. */
  pid: string;
  realName: string;
  aliasName: string;
  team: FranchiseCode;
  decade: Decade;
  /** Season end year, e.g. 1996 = 1995-96. */
  season: number;
  pos: Position[];
  g: number;
  mpg: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  /** True shooting %, 0-1. */
  ts: number;
  /** 3PA per game (0 before 1979-80). */
  tpa: number;
  /** 3P% (0-1, 0 when no attempts). */
  tpp: number;
  /** FT% (0-1). */
  ftp: number;
  /** Steals/blocks were not tracked before 1973-74; spg/bpg are positional estimates. */
  defEst: boolean;
}

export interface EraBaseline {
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  ts: number;
  tpa: number;
  tpp: number;
  ftp: number;
}

export interface OpponentSeason {
  team: FranchiseCode;
  season: number;
  /** Simple Rating System (point differential adjusted for schedule). */
  srs: number;
  w: number;
  l: number;
}

export interface Dataset {
  players: Player[];
  eras: Record<Decade, EraBaseline>;
  opponents: OpponentSeason[];
}

export function decadeOf(season: number): Decade | null {
  const d = `${Math.floor(season / 10) * 10}s`;
  return (DECADES as readonly string[]).includes(d) ? (d as Decade) : null;
}

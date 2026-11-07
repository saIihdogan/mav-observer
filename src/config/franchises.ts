/**
 * Franchise table + relocation mapping.
 *
 * IP rule: no official club nicknames or logos anywhere in the game. Each
 * franchise is shown only as "<City> <Color>" with a two-colour HEX palette.
 */

export const FRANCHISE_CODES = [
  'ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW',
  'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK',
  'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS',
] as const;

export type FranchiseCode = (typeof FRANCHISE_CODES)[number];

export interface FranchiseInfo {
  code: FranchiseCode;
  city: string;
  /** Neutral, non-trademarked display name: city + colour word. */
  name: string;
  colors: [primary: string, secondary: string];
}

const f = (code: FranchiseCode, city: string, color: string, primary: string, secondary: string): FranchiseInfo => ({
  code,
  city,
  name: `${city} ${color}`,
  colors: [primary, secondary],
});

export const FRANCHISES: Record<FranchiseCode, FranchiseInfo> = {
  ATL: f('ATL', 'Atlanta', 'Crimson', '#C8102E', '#FDB927'),
  BOS: f('BOS', 'Boston', 'Green', '#007A33', '#F2E8D5'),
  BKN: f('BKN', 'Brooklyn', 'Black', '#111111', '#E5E5E5'),
  CHA: f('CHA', 'Charlotte', 'Teal', '#00788C', '#2E2A6B'),
  CHI: f('CHI', 'Chicago', 'Red', '#CE1141', '#1A1A1A'),
  CLE: f('CLE', 'Cleveland', 'Wine', '#860038', '#FDBB30'),
  DAL: f('DAL', 'Dallas', 'Blue', '#0064B1', '#BBC4CA'),
  DEN: f('DEN', 'Denver', 'Navy', '#0E2240', '#FEC524'),
  DET: f('DET', 'Detroit', 'Royal', '#1D428A', '#C8102E'),
  GSW: f('GSW', 'Golden State', 'Sun', '#1D428A', '#FFC72C'),
  HOU: f('HOU', 'Houston', 'Scarlet', '#BA0C2F', '#C4CED4'),
  IND: f('IND', 'Indianapolis', 'Gold', '#002D62', '#FDBB30'),
  LAC: f('LAC', 'Los Angeles', 'Blue', '#1D428A', '#C8102E'),
  LAL: f('LAL', 'Los Angeles', 'Gold', '#552583', '#FDB927'),
  MEM: f('MEM', 'Memphis', 'Steel', '#5D76A9', '#12173F'),
  MIA: f('MIA', 'Miami', 'Coral', '#98002E', '#F9A01B'),
  MIL: f('MIL', 'Milwaukee', 'Forest', '#00471B', '#EEE1C6'),
  MIN: f('MIN', 'Minneapolis', 'Pine', '#0C2340', '#78BE20'),
  NOP: f('NOP', 'New Orleans', 'Bayou', '#0C2340', '#C8102E'),
  NYK: f('NYK', 'New York', 'Orange', '#006BB6', '#F58426'),
  OKC: f('OKC', 'Oklahoma City', 'Sky', '#007AC1', '#EF3B24'),
  ORL: f('ORL', 'Orlando', 'Azure', '#0077C0', '#C4CED4'),
  PHI: f('PHI', 'Philadelphia', 'Liberty', '#006BB6', '#ED174C'),
  PHX: f('PHX', 'Phoenix', 'Desert', '#1D1160', '#E56020'),
  POR: f('POR', 'Portland', 'Rose', '#E03A3E', '#1A1A1A'),
  SAC: f('SAC', 'Sacramento', 'Purple', '#5A2D81', '#63727A'),
  SAS: f('SAS', 'San Antonio', 'Silver', '#3A3A3A', '#C4CED4'),
  TOR: f('TOR', 'Toronto', 'Maple', '#CE1141', '#A1A1A4'),
  UTA: f('UTA', 'Utah', 'Canyon', '#002B5C', '#F9A01B'),
  WAS: f('WAS', 'Washington', 'Capital', '#002B5C', '#E31837'),
};

/**
 * Historical Basketball-Reference club codes -> current 30-city franchise code.
 * Includes every relocation required by the design doc plus the remaining
 * historical codes that appear in the 1960-present NBA data.
 */
export const RELOCATION_MAP: Record<string, FranchiseCode> = {
  // Required by spec
  SEA: 'OKC',
  NJN: 'BKN',
  VAN: 'MEM',
  WSB: 'WAS',
  BAL: 'WAS',
  SDC: 'LAC',
  BUF: 'LAC',
  NOH: 'NOP',
  NOK: 'NOP',
  KCK: 'SAC',
  CIN: 'SAC',
  ROC: 'SAC',
  STL: 'ATL',
  MLH: 'ATL',
  SDR: 'HOU',
  SFW: 'GSW',
  PHW: 'GSW',
  SYR: 'PHI',
  MNL: 'LAL',
  // Additional historical codes found in the source data
  BRK: 'BKN',
  NYN: 'BKN',
  CAP: 'WAS',
  CHP: 'WAS', // Chicago Packers (1961-62) -> later Baltimore/Washington
  CHZ: 'WAS', // Chicago Zephyrs (1962-63)
  KCO: 'SAC',
  NOJ: 'UTA',
  TRI: 'ATL',
  FTW: 'DET',
  CHH: 'CHA', // original Charlotte franchise history (1988-2002)
  CHO: 'CHA',
  PHO: 'PHX',
};

export function toFranchise(code: string): FranchiseCode | null {
  if ((FRANCHISE_CODES as readonly string[]).includes(code)) return code as FranchiseCode;
  return RELOCATION_MAP[code] ?? null;
}

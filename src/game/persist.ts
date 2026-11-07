/**
 * Run persistence (localStorage). A run survives reloads so a refresh can't
 * be used to re-roll a Daily board or dodge a locked season.
 * Only ids are stored; players are rehydrated from the bundled dataset.
 */
import type { CoachSystem, DraftState, GameMode, Player, Position } from '../engine';
import { COACH_SYSTEMS, POSITIONS } from '../engine';

export interface RunSlot {
  draft: DraftState;
  /** Season has been simulated (result is derived deterministically from draft). */
  simulated: boolean;
  /** Daily board date (YYYY-MM-DD, UTC). */
  date?: string;
}

interface SavedRun {
  v: 1;
  date?: string;
  simulated: boolean;
  draft: Omit<DraftState, 'lineup' | 'sixthMan'> & { lineup: Partial<Record<Position, string>>; sixthMan: string | null };
}

const KEY = (mode: GameMode) => `hoopdraft.run.${mode}`;

export function saveRun(mode: GameMode, run: RunSlot): void {
  const { lineup, sixthMan, ...rest } = run.draft;
  const saved: SavedRun = {
    v: 1,
    date: run.date,
    simulated: run.simulated,
    draft: {
      ...rest,
      lineup: Object.fromEntries(POSITIONS.filter((p) => lineup[p]).map((p) => [p, lineup[p]!.id])),
      sixthMan: sixthMan?.id ?? null,
    },
  };
  try {
    localStorage.setItem(KEY(mode), JSON.stringify(saved));
  } catch {
    /* storage unavailable (private mode / blocked) — run just won't persist */
  }
}

export function loadRun(mode: GameMode, byId: Map<string, Player>): RunSlot | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY(mode));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SavedRun;
    if (s.v !== 1 || s.draft.mode !== mode) return null;
    const lineup: DraftState['lineup'] = {};
    for (const [pos, id] of Object.entries(s.draft.lineup)) {
      const p = byId.get(id);
      if (!p || !POSITIONS.includes(pos as Position)) return null;
      lineup[pos as Position] = p;
    }
    const sixthMan = s.draft.sixthMan ? byId.get(s.draft.sixthMan) ?? null : null;
    if (s.draft.sixthMan && !sixthMan) return null;
    if (s.draft.coach && !COACH_SYSTEMS.includes(s.draft.coach as CoachSystem)) return null;
    return { draft: { ...s.draft, lineup, sixthMan }, simulated: !!s.simulated, date: s.date };
  } catch {
    return null;
  }
}

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`hoopdraft.pref.${key}`);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(`hoopdraft.pref.${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

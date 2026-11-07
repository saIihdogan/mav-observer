import { create } from 'zustand';
import {
  chooseCoach as chooseCoachRule,
  createDraft,
  dailySeed,
  eligibleSlots,
  finishSeason,
  getEngine,
  pickSixthMan,
  pickStarter,
  randomRunSeed,
  respinEra,
  respinTeam,
  spin as spinRule,
  swapSlots,
  canSwap,
  POSITIONS,
  type CoachSystem,
  type GameMode,
  type Player,
  type Position,
  type SeasonResult,
} from '../engine';
import { loadPref, loadRun, savePref, saveRun, type RunSlot } from './persist';
import { todayUTC } from './share';

export type Screen = 'draft' | 'final' | 'sim' | 'report';
export type PosFilter = 'ALL' | Position;
export type SortKey = 'PPG' | 'RPG' | 'APG' | 'DEF';

export interface UiState {
  selectedId: string | null;
  slot: Position | null;
  filter: PosFilter;
  sort: SortKey;
  blind: boolean;
  /** Wheel animation in progress (picker hidden until it lands). */
  spinning: boolean;
  simulating: boolean;
}

export interface GameStore {
  mode: GameMode;
  runs: Record<GameMode, RunSlot>;
  ui: UiState;
  setMode(mode: GameMode): void;
  spin(): void;
  respin(kind: 'team' | 'era'): void;
  landSpin(): void;
  select(id: string | null): void;
  setSlot(slot: Position): void;
  lockIn(): void;
  swap(from: Position): void;
  chooseCoach(c: CoachSystem): void;
  simulate(): void;
  finishSim(): void;
  playAgain(): void;
  setFilter(f: PosFilter): void;
  setSort(s: SortKey): void;
  toggleBlind(): void;
}

const engine = getEngine();
const byId = new Map(engine.dataset.players.map((p) => [p.id, p]));

function newRun(mode: GameMode): RunSlot {
  if (mode === 'daily') {
    const date = todayUTC();
    return { draft: createDraft('daily', dailySeed(date)), simulated: false, date };
  }
  return { draft: createDraft('classic', randomRunSeed()), simulated: false };
}

function restore(mode: GameMode): RunSlot {
  const saved = loadRun(mode, byId);
  if (!saved) return newRun(mode);
  if (mode === 'daily' && saved.date !== todayUTC()) return newRun(mode);
  return saved;
}

const freshUi = (ui: UiState): UiState => ({ ...ui, selectedId: null, slot: null, spinning: false, simulating: false });

export const useGame = create<GameStore>((set, get) => {
  /** Apply a draft transition to the active run and persist it. */
  const update = (fn: (run: RunSlot) => RunSlot, ui?: Partial<UiState>) => {
    const { mode, runs } = get();
    const run = fn(runs[mode]);
    saveRun(mode, run);
    set({ runs: { ...runs, [mode]: run }, ui: { ...get().ui, ...ui } });
  };

  return {
    mode: loadPref<GameMode>('mode', 'classic') === 'daily' ? 'daily' : 'classic',
    runs: { classic: restore('classic'), daily: restore('daily') },
    ui: {
      selectedId: null,
      slot: null,
      filter: 'ALL',
      sort: 'PPG',
      blind: loadPref('blind', false),
      spinning: false,
      simulating: false,
    },

    setMode(mode) {
      savePref('mode', mode);
      const runs = get().runs;
      // A Daily board from a previous day is replaced when re-entered.
      const daily = mode === 'daily' && runs.daily.date !== todayUTC() ? newRun('daily') : runs.daily;
      set({ mode, runs: { ...runs, daily }, ui: { ...freshUi(get().ui), filter: 'ALL' } });
    },

    spin() {
      if (get().ui.spinning) return;
      update((r) => ({ ...r, draft: spinRule(engine, r.draft) }), { spinning: true, selectedId: null, slot: null, filter: 'ALL' });
    },

    respin(kind) {
      if (get().ui.spinning) return;
      update(
        (r) => ({ ...r, draft: kind === 'team' ? respinTeam(engine, r.draft) : respinEra(engine, r.draft) }),
        { spinning: true, selectedId: null, slot: null },
      );
    },

    landSpin() {
      set({ ui: { ...get().ui, spinning: false } });
    },

    select(id) {
      const { ui } = get();
      if (id === ui.selectedId) return;
      const p = id ? byId.get(id) : null;
      const draft = activeRun().draft;
      const slots = p && draft.phase === 'starters' ? eligibleSlots(draft, p) : [];
      set({ ui: { ...ui, selectedId: id, slot: slots[0] ?? null } });
    },

    setSlot(slot) {
      const { ui } = get();
      const p = ui.selectedId ? byId.get(ui.selectedId) : null;
      if (p && eligibleSlots(activeRun().draft, p).includes(slot)) set({ ui: { ...ui, slot } });
    },

    lockIn() {
      const { ui } = get();
      const p = ui.selectedId ? byId.get(ui.selectedId) : null;
      if (!p || ui.spinning) return;
      const draft = activeRun().draft;
      if (draft.phase === 'starters' && ui.slot) {
        update((r) => ({ ...r, draft: pickStarter(r.draft, p, ui.slot!) }), { selectedId: null, slot: null, filter: 'ALL' });
      } else if (draft.phase === 'sixthMan') {
        update((r) => ({ ...r, draft: pickSixthMan(r.draft, p) }), { selectedId: null, slot: null });
      }
    },

    swap(from) {
      const draft = activeRun().draft;
      // Cycle to the next slot this player can legally move to.
      const start = POSITIONS.indexOf(from);
      for (let i = 1; i < POSITIONS.length; i++) {
        const to = POSITIONS[(start + i) % POSITIONS.length];
        if (canSwap(draft, from, to)) {
          update((r) => ({ ...r, draft: swapSlots(r.draft, from, to) }));
          return;
        }
      }
    },

    chooseCoach(c) {
      const { draft, simulated } = activeRun();
      if (simulated) return; // season is locked to the roster it was played with
      if (draft.phase === 'coach') update((r) => ({ ...r, draft: chooseCoachRule(r.draft, c) }));
      else if (draft.phase === 'done') update((r) => ({ ...r, draft: { ...r.draft, coach: c } }));
    },

    simulate() {
      const run = activeRun();
      if (run.draft.phase !== 'done' || run.simulated) return;
      // Persisted before the animation: a reload can't undo a locked season.
      update((r) => ({ ...r, simulated: true }), { simulating: true, selectedId: null });
    },

    finishSim() {
      set({ ui: { ...get().ui, simulating: false } });
    },

    playAgain() {
      const { mode } = get();
      if (mode === 'daily') return; // first Daily attempt is final
      update(() => newRun('classic'), { ...freshUi(get().ui), filter: 'ALL' });
    },

    setFilter(filter) {
      set({ ui: { ...get().ui, filter } });
    },
    setSort(sort) {
      set({ ui: { ...get().ui, sort } });
    },
    toggleBlind() {
      const blind = !get().ui.blind;
      savePref('blind', blind);
      set({ ui: { ...get().ui, blind } });
    },
  };

  function activeRun(): RunSlot {
    const s = get();
    return s.runs[s.mode];
  }
});

// ---- selectors --------------------------------------------------------------

export const useRun = () => useGame((s) => s.runs[s.mode]);

export function screenOf(run: RunSlot, ui: UiState): Screen {
  if (ui.simulating) return 'sim';
  if (run.simulated) return 'report';
  if (run.draft.phase === 'starters') return 'draft';
  return 'final';
}

const resultCache = new Map<string, SeasonResult>();
/** Season result for a finished run (deterministic: runSeed + roster). */
export function resultFor(run: RunSlot): SeasonResult | null {
  if (run.draft.phase !== 'done') return null;
  const key = `${run.draft.runSeed}|${run.draft.lineup.PG?.id}|${run.draft.lineup.SG?.id}|${run.draft.lineup.SF?.id}|${run.draft.lineup.PF?.id}|${run.draft.lineup.C?.id}|${run.draft.sixthMan?.id}|${run.draft.coach}`;
  let r = resultCache.get(key);
  if (!r) {
    r = finishSeason(engine, run.draft);
    resultCache.set(key, r);
  }
  return r;
}

export function playerById(id: string | null): Player | null {
  return id ? byId.get(id) ?? null : null;
}

export { engine };

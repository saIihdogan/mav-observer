import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraft, dailySeed, getEngine, GreedySkillBot, finishSeason } from '../src/engine';
import { dailyShareText, todayUTC } from '../src/game/share';

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

const engine = getEngine();

describe('daily share card', () => {
  it('uses the UTC date', () => {
    expect(todayUTC(new Date('2026-11-07T23:30:00-05:00'))).toBe('2026-11-08');
  });

  it('is spoiler-free: record, rating and 10-game blocks only', () => {
    const draft = GreedySkillBot.draft(engine, dailySeed('2026-11-07'), 'daily');
    const result = finishSeason(engine, draft);
    const text = dailyShareText('2026-11-07', result);
    const lines = text.split('\n');
    expect(lines[0]).toBe('HoopDraft 82-0 · Daily 2026-11-07');
    expect(lines[1]).toContain(`${result.wins}-${result.losses}`);
    expect([...lines[2]].length).toBe(9); // ceil(82 / 10) emoji blocks
    for (const p of Object.values(draft.lineup)) expect(text).not.toContain(p!.aliasName);
  });
});

describe('persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  it('round-trips a run by ids', async () => {
    const { saveRun, loadRun } = await import('../src/game/persist');
    const draft = GreedySkillBot.draft(engine, 77);
    saveRun('classic', { draft, simulated: true });
    const byId = new Map(engine.dataset.players.map((p) => [p.id, p]));
    const back = loadRun('classic', byId)!;
    expect(back.simulated).toBe(true);
    expect(back.draft).toEqual(draft);
    expect(finishSeason(engine, back.draft)).toEqual(finishSeason(engine, draft));
  });

  it('rejects corrupted or unknown saves instead of crashing', async () => {
    const { loadRun } = await import('../src/game/persist');
    const byId = new Map(engine.dataset.players.map((p) => [p.id, p]));
    localStorage.setItem('hoopdraft.run.classic', '{not json');
    expect(loadRun('classic', byId)).toBeNull();
    localStorage.setItem('hoopdraft.run.classic', JSON.stringify({ v: 1, simulated: false, draft: { ...createDraft('classic', 1), lineup: { PG: 'nobody:XXX:1990s' }, sixthMan: null } }));
    expect(loadRun('classic', byId)).toBeNull();
  });
});

describe('store rules', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  async function playToDone(mode: 'classic' | 'daily') {
    const { useGame } = await import('../src/game/store');
    const g = useGame.getState;
    g().setMode(mode);
    while (g().runs[mode].draft.phase === 'starters' || g().runs[mode].draft.phase === 'sixthMan') {
      g().spin();
      g().landSpin();
      const { currentPool } = await import('../src/engine');
      const p = currentPool(engine, g().runs[mode].draft)[0];
      g().select(p.id);
      g().lockIn();
    }
    g().chooseCoach('motion');
    return useGame;
  }

  it('Daily: first attempt is locked — no Play Again, no coach change after the sim, survives reload', async () => {
    const useGame = await playToDone('daily');
    const g = useGame.getState;
    g().simulate();
    g().finishSim();
    const run = g().runs.daily;
    expect(run.simulated).toBe(true);
    g().playAgain();
    expect(g().runs.daily).toBe(run);
    g().chooseCoach('gritGrind');
    expect(g().runs.daily.draft.coach).toBe('motion');

    vi.resetModules(); // "reload": same storage, fresh modules
    const { useGame: reloaded, resultFor } = await import('../src/game/store');
    const again = reloaded.getState().runs.daily;
    expect(again.simulated).toBe(true);
    expect(again.date).toBe(todayUTC());
    expect(resultFor(again)!.wins).toBe(finishSeason(engine, run.draft).wins);
  });

  it('Classic: Play Again starts a new run with a new seed and fresh respins', async () => {
    const useGame = await playToDone('classic');
    const g = useGame.getState;
    const seed = g().runs.classic.draft.runSeed;
    g().simulate();
    g().finishSim();
    g().playAgain();
    const next = g().runs.classic;
    expect(next.simulated).toBe(false);
    expect(next.draft.runSeed).not.toBe(seed);
    expect(next.draft.teamRespins).toBe(1);
    expect(next.draft.eraRespins).toBe(1);
  });

  it('two-step pick: selecting previews only, Lock In commits', async () => {
    const { useGame } = await import('../src/game/store');
    const { currentPool } = await import('../src/engine');
    const g = useGame.getState;
    g().spin();
    g().landSpin();
    const p = currentPool(engine, g().runs.classic.draft)[0];
    g().select(p.id);
    expect(Object.keys(g().runs.classic.draft.lineup)).toHaveLength(0);
    g().lockIn();
    expect(Object.values(g().runs.classic.draft.lineup).map((x) => x!.id)).toContain(p.id);
  });
});

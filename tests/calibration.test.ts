/**
 * Phase 0 acceptance (npm run test:sim):
 *  - 10,000 RandomBot + 10,000 GreedySkillBot drafts and 82-game seasons in < 2000 ms
 *  - RandomBot 82-0 rate < 0.05 %
 *  - GreedySkillBot 82-0 rate within 3.0 % – 4.5 % (~1 in 25-30)
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { finishSeason, getEngine, GreedySkillBot, RandomBot, type Bot } from '../src/engine';

const RUNS = 10_000;
const engine = getEngine();

function runBot(bot: Bot, salt: number) {
  let perfect = 0;
  let wins = 0;
  for (let i = 0; i < RUNS; i++) {
    const runSeed = (salt + Math.imul(i, 2654435761)) >>> 0;
    const result = finishSeason(engine, bot.draft(engine, runSeed), { detail: false });
    if (result.perfect) perfect++;
    wins += result.wins;
  }
  return { rate: perfect / RUNS, avgWins: wins / RUNS };
}

describe('simulation calibration', () => {
  let random: ReturnType<typeof runBot>;
  let greedy: ReturnType<typeof runBot>;
  let elapsed = 0;

  // Timed cold: includes building every player rating on first use (no warm-up pass).
  beforeAll(() => {
    const t0 = performance.now();
    random = runBot(RandomBot, 0x5eed);
    greedy = runBot(GreedySkillBot, 0x5eed);
    elapsed = performance.now() - t0;
  });

  it(`runs ${RUNS} random + ${RUNS} greedy drafts in under 2000 ms`, () => {
    console.info(
      `[calibration] ${elapsed.toFixed(0)} ms | RandomBot 82-0 ${(random.rate * 100).toFixed(3)}% (avg ${random.avgWins.toFixed(1)} W)` +
        ` | GreedySkillBot 82-0 ${(greedy.rate * 100).toFixed(2)}% (avg ${greedy.avgWins.toFixed(1)} W)`,
    );
    expect(elapsed).toBeLessThan(2000);
  });

  it('RandomBot goes 82-0 less than 0.05% of the time', () => {
    expect(random.rate).toBeLessThan(0.0005);
  });

  it('GreedySkillBot goes 82-0 between 3.0% and 4.5% of the time', () => {
    expect(greedy.rate).toBeGreaterThanOrEqual(0.03);
    expect(greedy.rate).toBeLessThanOrEqual(0.045);
  });

  it('skill matters across the whole curve, not just at 82-0', () => {
    expect(greedy.avgWins).toBeGreaterThan(random.avgWins + 40);
  });
});

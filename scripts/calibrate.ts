/**
 * Balance exploration: npm run calibrate
 * Prints TeamRating distributions for RandomBot / GreedySkillBot and the
 * measured 82-0 rates with the current SIM constants.
 */
import { getEngine, RandomBot, GreedySkillBot, finishSeason, randomRunSeed, buildSchedule, perfectSeasonProbability, teamRating, SIM, type Bot } from '../src/engine';
import { displayName } from '../src/config/ipConfig';

const N = Number(process.argv[2] ?? 10000);
const engine = getEngine();

const top = [...engine.dataset.players].map((p) => engine.rater.rate(p)).sort((a, b) => b.ir - a.ir);
console.log('Top 15 IR:', top.slice(0, 15).map((r) => `${displayName(r.player)} ${r.player.team} ${r.player.season} ${r.ir}`).join(' | '));
const irs = top.map((r) => r.ir);
const q = (a: number[], f: number) => a[Math.floor(f * (a.length - 1))];
const asc = [...irs].reverse();
console.log('IR quantiles p10/p50/p90/p99:', [0.1, 0.5, 0.9, 0.99].map((f) => q(asc, f).toFixed(1)).join(' / '));

function run(bot: Bot, base: number) {
  const totals: number[] = [];
  let perfect = 0;
  const wins: number[] = [];
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    const s = bot.draft(engine, (base + i * 2654435761) >>> 0);
    const r = finishSeason(engine, s, { detail: false });
    totals.push(r.rating.total);
    wins.push(r.wins);
    if (r.perfect) perfect++;
  }
  const ms = performance.now() - t0;
  totals.sort((a, b) => a - b);
  wins.sort((a, b) => a - b);
  console.log(
    `${bot.name}: ${ms.toFixed(0)}ms  82-0 ${(100 * perfect / N).toFixed(2)}%  TR p10/p50/p90/max ${[0.1, 0.5, 0.9, 1].map((f) => q(totals, f).toFixed(1)).join('/')}  W p10/p50/p90 ${[0.1, 0.5, 0.9].map((f) => q(wins, f)).join('/')}`,
  );
}
const seed = Number(process.argv[3] ?? randomRunSeed());
console.log('seed', seed);
run(RandomBot, seed);
run(GreedySkillBot, seed);

// ---- parameter sweep (npm run calibrate -- 10000 <seed> --sweep) -----------
if (process.argv.includes('--sweep')) {
  const collect = (bot: Bot) => {
    const out: { total: number; schedule: ReturnType<typeof buildSchedule> }[] = [];
    for (let i = 0; i < N; i++) {
      const runSeed = (seed + i * 2654435761) >>> 0;
      const s = bot.draft(engine, runSeed);
      out.push({ total: teamRating(engine.rater, s.lineup, s.sixthMan, s.coach).total, schedule: buildSchedule(engine.dataset.opponents, runSeed) });
    }
    return out;
  };
  const rnd = collect(RandomBot);
  const grd = collect(GreedySkillBot);
  const expected = (teams: typeof rnd) => teams.reduce((s, t) => s + perfectSeasonProbability(t.total, t.schedule), 0) / teams.length;
  const rows: string[] = [];
  for (const pmax of [0.96, 0.9625, 0.965]) {
    for (const scale of [3, 4, 5, 6]) {
      for (let base = 60; base <= 110; base += 1) {
        Object.assign(SIM, { P_MAX: pmax, LOGISTIC_SCALE: scale, OPP_BASE: base });
        const g = expected(grd);
        if (g < 0.033 || g > 0.042) continue;
        const r = expected(rnd);
        rows.push(`pmax ${pmax} scale ${scale} base ${base}: greedy ${(100 * g).toFixed(2)}%  random ${(100 * r).toFixed(4)}%`);
      }
    }
  }
  console.log(rows.join('\n') || 'no parameter set hits the greedy window');
}

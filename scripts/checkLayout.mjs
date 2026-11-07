/**
 * Phase 1 acceptance (npm run test:layout) — runs against the production build.
 *
 *  1. At 800x450, 907x510 and 1920x1080 a full Classic run (spin -> 5 picks ->
 *     Final Touch -> coach -> season report) is played and on every screen the
 *     page must not overflow (scrollWidth > clientWidth or scrollHeight > clientHeight).
 *  2. Daily Challenge played twice (fresh browser profiles, different picks)
 *     must produce the identical team/decade wheel sequence.
 *
 * Uses the Playwright already installed on the machine (require('playwright')).
 * Pass --shots <dir> to save a screenshot of every checked state.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { preview } from 'vite';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright not found. Install it with: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const args = process.argv.slice(2);
const shotsDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const VIEWPORTS = [
  { width: 800, height: 450 },
  { width: 907, height: 510 },
  { width: 1920, height: 1080 },
];

const server = await preview({ preview: { port: 4173, strictPort: false }, logLevel: 'error' });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
const failures = [];

async function overflow(page) {
  return page.evaluate(() => {
    const els = [document.documentElement, document.body];
    return els
      .map((el) => ({ tag: el.tagName, sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }))
      .filter((m) => m.sw > m.cw || m.sh > m.ch);
  });
}

async function check(page, vp, label) {
  const o = await overflow(page);
  const tag = `${vp.width}x${vp.height} ${label}`;
  if (o.length) failures.push(`${tag}: page overflow ${JSON.stringify(o)}`);
  if (shotsDir) {
    await page.waitForTimeout(800); // let screen transitions settle before capturing
    await page.screenshot({ path: join(shotsDir, `${vp.width}x${vp.height}-${label}.png`) });
  }
  console.log(`  ${o.length ? '✗' : '✓'} ${tag}`);
}

async function newPage(vp) {
  const context = await browser.newContext({ viewport: vp, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));
  await page.goto(url);
  await page.getByTestId('app').waitFor();
  return { context, page };
}

/** Spin and return the landed "TEAM|DECADE". */
async function spin(page) {
  await page.getByTestId('spin').click();
  const team = page.locator('[data-testid="wheel-team"][data-team]');
  await team.waitFor();
  const decade = await page.locator('[data-testid="wheel-decade"][data-decade]').getAttribute('data-decade');
  return `${await team.getAttribute('data-team')}|${decade}`;
}

async function pickRow(page, which) {
  const rows = page.getByTestId('player-row');
  await rows.first().waitFor();
  const n = await rows.count();
  await rows.nth(which === 'last' ? n - 1 : 0).click();
  await page.getByTestId('lock-in').click();
}

/** Plays a full run; calls onState(label) at each screen worth checking. */
async function playRun(page, which, onState = async () => {}) {
  const spins = [];
  await onState('0-landing');
  for (let i = 0; i < 5; i++) {
    spins.push(await spin(page));
    if (i === 0) await onState('1-pool');
    if (i === 0) {
      // Blind Mode hides every stat in the list and disables stat sorting.
      await page.getByTestId('blind-toggle').click();
      const hidden = await page.getByTestId('player-row').first().innerText();
      if (/\d+\.\d/.test(hidden)) failures.push(`blind mode still shows stats: "${hidden}"`);
      if (!(await page.getByTestId('sort-PPG').isDisabled())) failures.push('blind mode leaves stat sorting enabled');
      await onState('1b-blind');
      await page.getByTestId('blind-toggle').click();
    }
    if (i === 0) {
      await page.getByTestId('player-row').first().click();
      await page.getByTestId('lock-in').waitFor();
      await onState('2-preview');
      await page.getByTestId('player-row').first().click(); // deselect: two-step confirm
    }
    await pickRow(page, which);
  }
  await page.getByTestId('final-touch').waitFor();
  await onState('3-final-touch');
  spins.push(await spin(page));
  await onState('4-sixth-pool');
  await pickRow(page, which);
  await page.getByTestId(which === 'last' ? 'coach-gritGrind' : 'coach-paceSpace').click();
  await onState('5-coach');
  await page.getByTestId('simulate').click();
  await page.getByTestId('report').waitFor();
  await onState('6-report');
  const record = await page.getByTestId('report').getAttribute('data-record');
  return { spins, record };
}

try {
  console.log('Layout / overflow');
  for (const vp of VIEWPORTS) {
    const { context, page } = await newPage(vp);
    const app = await page.getByTestId('app').getAttribute('data-screen');
    if (app !== 'draft' || !(await page.getByTestId('spin').isVisible())) failures.push(`${vp.width}x${vp.height}: did not land directly in gameplay`);
    await playRun(page, 'first', (label) => check(page, vp, label));
    await context.close();
  }

  console.log('Daily determinism');
  const vp = VIEWPORTS[0];
  const a = await newPage(vp);
  await a.page.getByTestId('mode-daily').click();
  const runA = await playRun(a.page, 'first');
  // Reload: the first attempt stays locked on the report with the same record.
  await a.page.reload();
  await a.page.getByTestId('report').waitFor();
  const reloaded = await a.page.getByTestId('report').getAttribute('data-record');
  if (reloaded !== runA.record) failures.push(`daily not locked after reload (${runA.record} -> ${reloaded})`);
  if (await a.page.getByTestId('play-again').count()) failures.push('daily report offers Play Again');
  await a.context.close();

  const b = await newPage(vp);
  await b.page.getByTestId('mode-daily').click();
  const runB = await playRun(b.page, 'last');
  await b.context.close();
  console.log(`  run A spins: ${runA.spins.join(', ')}`);
  console.log(`  run B spins: ${runB.spins.join(', ')}`);
  if (JSON.stringify(runA.spins) !== JSON.stringify(runB.spins)) failures.push('daily wheel sequences differ between runs');
  else console.log('  ✓ identical team/decade sequence across two Daily runs with different picks');
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nPhase 1 layout acceptance passed.');

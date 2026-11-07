/**
 * ETL: historical NBA season stats -> src/data/players.min.json + opponents.min.json
 *
 * Source: Basketball-Reference season tables as published in the open
 * sumitrodatta/bball-reference-datasets repository (CSV). It is used instead of
 * llimllib/nba_data (only covers 2009-10 onward) and the BBGM roster files
 * (current-season rosters only), because the game needs 1960s-2020s coverage.
 *
 * Usage:
 *   npm run ingest            # reads data/raw/*.csv
 *   npm run ingest:download   # downloads the CSVs into data/raw first
 *   tsx scripts/ingestRosterData.ts --raw <dir> --out <dir>
 *
 * No statistic is invented: every number comes from the source rows. The only
 * derived values are pre-1973-74 steal/block *estimates* (flagged defEst), since
 * those stats were not recorded then.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseCsv } from './lib/csv';
import {
  buildOpponents,
  buildPlayers,
  computeEraBaselines,
  readSeasonRows,
  toColumnar,
  FIRST_SEASON,
  LAST_SEASON,
} from './lib/transform';

const SOURCE_BASE = 'https://raw.githubusercontent.com/sumitrodatta/bball-reference-datasets/master/Data';
const FILES = {
  perGame: { local: 'player_per_game.csv', remote: 'Player%20Per%20Game.csv' },
  advanced: { local: 'advanced.csv', remote: 'Advanced.csv' },
  teams: { local: 'team_summaries.csv', remote: 'Team%20Summaries.csv' },
} as const;

const args = process.argv.slice(2);
const rawDir = resolve(args.includes('--raw') ? args[args.indexOf('--raw') + 1] : 'data/raw');
const outDir = resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : 'src/data');

async function download() {
  mkdirSync(rawDir, { recursive: true });
  for (const f of Object.values(FILES)) {
    const url = `${SOURCE_BASE}/${f.remote}`;
    process.stdout.write(`Downloading ${url} ... `);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    writeFileSync(join(rawDir, f.local), await res.text());
    console.log('ok');
  }
}

function read(name: string) {
  const p = join(rawDir, name);
  if (!existsSync(p)) {
    throw new Error(`Missing ${p}. Run "npm run ingest:download" or pass --raw <dir>.`);
  }
  return parseCsv(readFileSync(p, 'utf8'));
}

async function main() {
  if (args.includes('--download')) await download();
  const rows = readSeasonRows(read(FILES.perGame.local), read(FILES.advanced.local));
  const eras = computeEraBaselines(rows);
  const players = buildPlayers(rows, eras);
  const opponents = buildOpponents(read(FILES.teams.local));

  mkdirSync(outDir, { recursive: true });
  const meta = {
    v: 1,
    source: 'Basketball-Reference via github.com/sumitrodatta/bball-reference-datasets',
    seasons: [FIRST_SEASON, LAST_SEASON],
  };
  writeFileSync(join(outDir, 'players.min.json'), JSON.stringify({ ...meta, eras, ...toColumnar(players) }));
  writeFileSync(
    join(outDir, 'opponents.min.json'),
    JSON.stringify({ ...meta, cols: ['team', 'season', 'srs', 'w', 'l'], rows: opponents.map((o) => [o.team, o.season, o.srs, o.w, o.l]) }),
  );
  console.log(`Season rows: ${rows.length}  ->  player cards: ${players.length}, opponent seasons: ${opponents.length}`);
  console.log(`Wrote ${join(outDir, 'players.min.json')} and opponents.min.json`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../scripts/lib/csv';
import { buildOpponents, buildPlayers, makeAlias, readSeasonRows, toColumnar } from '../scripts/lib/transform';
import { FRANCHISES, FRANCHISE_CODES, RELOCATION_MAP, toFranchise } from '../src/config/franchises';
import { decodePlayers } from '../src/engine/dataset';
import playersFile from '../src/data/players.min.json';

const fixture = (name: string) => parseCsv(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

describe('csv parser', () => {
  it('handles quotes, escaped quotes and CRLF', () => {
    const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n1,2\n');
    expect(rows).toEqual([
      { a: 'x, y', b: 'he said "hi"' },
      { a: '1', b: '2' },
    ]);
  });
});

describe('relocation mapping', () => {
  it.each([
    ['SEA', 'OKC'], ['NJN', 'BKN'], ['VAN', 'MEM'], ['WSB', 'WAS'], ['BAL', 'WAS'],
    ['SDC', 'LAC'], ['BUF', 'LAC'], ['NOH', 'NOP'], ['NOK', 'NOP'], ['KCK', 'SAC'],
    ['CIN', 'SAC'], ['ROC', 'SAC'], ['STL', 'ATL'], ['MLH', 'ATL'], ['SDR', 'HOU'],
    ['SFW', 'GSW'], ['PHW', 'GSW'], ['SYR', 'PHI'], ['MNL', 'LAL'],
  ])('%s -> %s', (from, to) => {
    expect(toFranchise(from)).toBe(to);
  });

  it('maps every code to one of the 30 current franchises and drops multi-team rows', () => {
    for (const to of Object.values(RELOCATION_MAP)) expect(FRANCHISE_CODES).toContain(to);
    expect(toFranchise('2TM')).toBeNull();
    expect(toFranchise('TOT')).toBeNull();
    expect(FRANCHISE_CODES).toHaveLength(30);
  });
});

describe('IP & alias layer', () => {
  const NICKNAMES = [
    'Hawks', 'Celtics', 'Nets', 'Hornets', 'Bulls', 'Cavaliers', 'Mavericks', 'Nuggets', 'Pistons', 'Warriors',
    'Rockets', 'Pacers', 'Clippers', 'Lakers', 'Grizzlies', 'Heat', 'Bucks', 'Timberwolves', 'Pelicans', 'Knicks',
    'Thunder', 'Magic', '76ers', 'Sixers', 'Suns', 'Blazers', 'Kings', 'Spurs', 'Raptors', 'Jazz', 'Wizards',
    'SuperSonics', 'Sonics', 'Bullets', 'Bobcats', 'Royals', 'Braves', 'Nationals',
  ];

  it('team display names are "<City> <Color>" with a two-colour HEX palette and no club nicknames', () => {
    for (const f of Object.values(FRANCHISES)) {
      for (const nick of NICKNAMES) expect(f.name).not.toMatch(new RegExp(`\\b${nick}\\b`, 'i'));
      expect(f.colors).toHaveLength(2);
      for (const c of f.colors) expect(c).toMatch(/^#[0-9A-F]{6}$/i);
    }
    expect(FRANCHISES.LAL.name).toBe('Los Angeles Gold');
    expect(FRANCHISES.CHI.name).toBe('Chicago Red');
    expect(FRANCHISES.BOS.name).toBe('Boston Green');
  });

  it('bundled data carries no club nicknames', () => {
    const text = JSON.stringify(playersFile);
    for (const nick of ['Lakers', 'Bulls', 'Celtics', 'Warriors', 'Knicks', 'SuperSonics']) expect(text).not.toContain(nick);
  });

  it('builds aliases as initial + surname, keeping suffixes', () => {
    expect(makeAlias('Michael Jordan')).toBe('M. Jordan');
    expect(makeAlias('Gary Payton II')).toBe('G. Payton II');
    expect(makeAlias('Karl-Anthony Towns')).toBe('K. Towns');
    expect(makeAlias('Shai Gilgeous-Alexander')).toBe('S. Gilgeous-Alexander');
    expect(makeAlias('Nenê')).toBe('Nenê');
  });

  it('every bundled card keeps id, realName and aliasName separate', () => {
    for (const p of decodePlayers(playersFile as never).slice(0, 500)) {
      expect(p.id).toMatch(/^[a-z0-9.'-]+:[A-Z]{3}:\d{4}s$/);
      expect(p.realName.length).toBeGreaterThan(0);
      expect(p.aliasName.length).toBeGreaterThan(0);
    }
  });
});

describe('ETL transform on real-source fixtures', () => {
  const rows = readSeasonRows(fixture('player_per_game.csv'), fixture('advanced.csv'));
  const eras = (playersFile as unknown as { eras: Parameters<typeof buildPlayers>[1] }).eras;
  const players = buildPlayers(rows, eras);
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));

  it('skips multi-team aggregate rows and relocates franchises', () => {
    expect(rows.some((r) => (r.team as string) === '2TM')).toBe(false);
    expect(byId['paytoga01:OKC:1990s']).toBeDefined(); // SEA -> OKC
    expect(byId['cartevi01:BKN:2000s']).toBeDefined(); // NJN -> BKN
    expect(byId['cartevi01:TOR:2000s']).toBeDefined();
  });

  it('keeps source numbers verbatim (no invented stats)', () => {
    const payton = byId['paytoga01:OKC:1990s'];
    expect(payton).toMatchObject({ realName: 'Gary Payton', aliasName: 'G. Payton', season: 1996, ppg: 19.3, apg: 7.5, spg: 2.9 });
    expect(payton.defEst).toBe(false);
  });

  it('chooses the peak season within a franchise-decade', () => {
    expect(byId['olajuha01:HOU:1990s'].season).toBe(1994);
    expect(byId['cartevi01:TOR:2000s'].season).toBe(2002);
  });

  it('flags pre-1973-74 steals/blocks as estimates instead of leaving NaN', () => {
    const russell = byId['russebi01:BOS:1960s'];
    expect(russell.defEst).toBe(true);
    expect(Number.isFinite(russell.spg) && Number.isFinite(russell.bpg)).toBe(true);
  });

  it('round-trips through the columnar format', () => {
    const decoded = decodePlayers({ eras, ...toColumnar(players) } as never);
    expect(decoded).toEqual(players);
  });

  it('builds opponent seasons from team summaries (league-average row dropped)', () => {
    const opp = buildOpponents(fixture('team_summaries.csv'));
    expect(opp.find((o) => o.season === 1996 && o.team === 'CHI')?.srs).toBeGreaterThan(10);
    expect(opp.find((o) => o.season === 1996 && o.team === 'OKC')).toBeDefined();
    expect(opp).toHaveLength(6);
  });
});

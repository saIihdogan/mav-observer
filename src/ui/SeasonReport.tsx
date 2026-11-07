import { useState } from 'react';
import { m } from 'motion/react';
import { FRANCHISES } from '../config/franchises';
import { COACH_INFO, POSITIONS, type Player, type SeasonResult } from '../engine';
import { useGame, useRun } from '../game/store';
import { dailyShareText } from '../game/share';
import { t } from '../i18n/strings';
import { Btn, f1, nameOf, seasonTag, signed, TeamDot } from './common';

export function SeasonReport({ result }: { result: SeasonResult }) {
  const run = useRun();
  const mode = useGame((s) => s.mode);
  const { playAgain, setMode } = useGame.getState();
  const [copied, setCopied] = useState(false);
  const d = run.draft;
  const roster: [string, Player][] = [...POSITIONS.map((p) => [p, d.lineup[p]!] as [string, Player]), ['6th', d.sixthMan!]];
  const totals = roster.reduce(
    (a, [, p]) => ({ ppg: a.ppg + p.ppg, rpg: a.rpg + p.rpg, apg: a.apg + p.apg, spg: a.spg + p.spg, bpg: a.bpg + p.bpg }),
    { ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0 },
  );
  const r = result.rating;
  const preCoach = r.base + r.spacing + r.playmaking + r.usage + r.defense + r.bench;

  async function copy() {
    const text = dailyShareText(run.date ?? '', result);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full min-h-0 flex-col gap-[0.5rem]"
      data-testid="report"
      data-record={`${result.wins}-${result.losses}`}
    >
      <header className="flex items-center gap-[0.8rem]">
        <div className="tabular text-[2.6rem] leading-none font-black" data-testid="record">
          {result.wins}
          <span className="text-ink-3">-</span>
          {result.losses}
        </div>
        {result.perfect ? (
          <m.div
            initial={{ scale: 0.6, rotate: -6 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 12 }}
            className="rounded-lg bg-gold px-[0.6rem] py-[0.2rem] text-[1rem] font-black tracking-widest text-black"
          >
            🏆 {t.perfect}
          </m.div>
        ) : (
          <div className="text-[0.85rem] text-ink-2">
            {t.teamRating} <b className="text-ink">{f1(r.total)}</b>
          </div>
        )}
        <div className="ml-auto text-right text-[0.75rem] text-ink-3">
          {mode === 'daily' ? `${t.daily} · ${run.date}` : t.classic}
          <br />
          {d.coach && COACH_INFO[d.coach].label}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.7fr)_minmax(0,0.8fr)_minmax(0,0.9fr)] gap-[0.5rem]">
        <section className="min-h-0 rounded-xl border border-line bg-panel/80 p-[0.5rem]">
          <h3 className="mb-[0.2rem] text-[0.65rem] font-bold tracking-wider text-ink-3 uppercase">{t.starters}</h3>
          <table className="tabular w-full table-fixed text-[0.78rem]">
            <colgroup>
              <col className="w-[2rem]" />
              <col />
              {[0, 1, 2, 3, 4].map((i) => (
                <col key={i} className="w-[2.7rem]" />
              ))}
            </colgroup>
            <thead className="text-ink-3">
              <tr className="text-right [&>th]:font-semibold">
                <th className="text-left" colSpan={2} />
                <th>PPG</th>
                <th>RPG</th>
                <th>APG</th>
                <th>SPG</th>
                <th>BPG</th>
              </tr>
            </thead>
            <tbody>
              {roster.map(([slot, p]) => (
                <tr key={slot} className="border-t border-line text-right text-ink-2">
                  <td className="text-left font-bold text-ink-3">{slot}</td>
                  <td className="text-left">
                    <span className="flex min-w-0 items-center gap-[0.3rem]">
                      <TeamDot team={p.team} size="0.7rem" />
                      <span className="truncate font-bold text-ink" title={`${FRANCHISES[p.team].name} ${p.season - 1}-${String(p.season % 100).padStart(2, '0')}`}>
                        {nameOf(p)}
                      </span>
                      <span className="shrink-0 text-[0.68rem] text-ink-3">{seasonTag(p.season)}</span>
                    </span>
                  </td>
                  <td>{f1(p.ppg)}</td>
                  <td>{f1(p.rpg)}</td>
                  <td>{f1(p.apg)}</td>
                  <td>{f1(p.spg)}</td>
                  <td>{f1(p.bpg)}</td>
                </tr>
              ))}
              <tr className="border-t border-white/25 text-right font-extrabold" data-testid="team-totals">
                <td className="text-left" colSpan={2}>
                  {t.teamTotals}
                </td>
                <td>{f1(totals.ppg)}</td>
                <td>{f1(totals.rpg)}</td>
                <td>{f1(totals.apg)}</td>
                <td>{f1(totals.spg)}</td>
                <td>{f1(totals.bpg)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="min-h-0 rounded-xl border border-line bg-panel/80 p-[0.5rem]" data-testid="breakdown">
          <h3 className="mb-[0.2rem] text-[0.65rem] font-bold tracking-wider text-ink-3 uppercase">{t.ratingBreakdown}</h3>
          <dl className="tabular grid grid-cols-[1fr_auto] gap-y-[0.12rem] text-[0.8rem]">
            <Row label={t.base} value={f1(r.base)} />
            <Row label={t.spacing} value={signed(r.spacing)} tone={r.spacing} />
            <Row label={t.playmaking} value={signed(r.playmaking)} tone={r.playmaking} />
            <Row label={t.usage} value={signed(r.usage)} tone={r.usage} />
            <Row label={t.defense} value={signed(r.defense)} tone={r.defense} />
            <Row label={t.bench} value={signed(r.bench)} tone={r.bench} />
            <Row label="=" value={f1(preCoach)} />
            <Row label={`${t.coachMultiplier}`} value={`×${r.coachMultiplier.toFixed(3)}`} />
            <dt className="border-t border-white/25 pt-[0.1rem] font-extrabold">{t.total}</dt>
            <dd className="border-t border-white/25 pt-[0.1rem] text-right font-extrabold text-accent">{f1(r.total)}</dd>
          </dl>
        </section>

        <section className="flex min-h-0 flex-col rounded-xl border border-line bg-panel/80 p-[0.5rem]">
          <h3 className="mb-[0.2rem] text-[0.65rem] font-bold tracking-wider text-ink-3 uppercase">
            {t.losses} ({result.losses})
          </h3>
          <ul className="thin-scroll min-h-0 flex-1 overflow-y-auto text-[0.78rem]" data-testid="losses">
            {result.lostTo.length === 0 && <li className="text-good">{t.noLosses}</li>}
            {result.lostTo.map((l) => (
              <li key={l.game} className="flex justify-between gap-2 border-b border-line py-[0.12rem]">
                <span className="truncate">
                  <span className="text-ink-3">
                    {t.game}
                    {l.game}
                  </span>{' '}
                  {l.label}
                </span>
                <span className="shrink-0 text-bad">{t.lostToBy(l.margin)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="flex items-center justify-center gap-[0.5rem]">
        {mode === 'classic' ? (
          <Btn variant="primary" testId="play-again" onClick={playAgain} className="h-[2.5rem] px-[1.4rem]">
            ↻ {t.playAgain}
          </Btn>
        ) : (
          <>
            <Btn variant="primary" testId="copy-result" onClick={copy} className="h-[2.5rem]">
              {copied ? `✓ ${t.copied}` : `📋 ${t.copyResult}`}
            </Btn>
            <span className="text-[0.78rem] text-ink-3">{t.dailyLocked}</span>
            <Btn variant="outline" onClick={() => setMode('classic')}>
              {t.playClassic}
            </Btn>
          </>
        )}
      </footer>
    </m.div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const c = tone === undefined || Math.abs(tone) < 0.05 ? 'text-ink-2' : tone > 0 ? 'text-good' : 'text-bad';
  return (
    <>
      <dt className="text-ink-2">{label}</dt>
      <dd className={`text-right font-bold ${c}`}>{value}</dd>
    </>
  );
}

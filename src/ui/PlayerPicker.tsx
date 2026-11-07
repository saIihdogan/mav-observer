import { useMemo } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { FRANCHISES } from '../config/franchises';
import { currentPool, eligibleSlots, POSITIONS, teamRating, type Player, type TeamRatingBreakdown } from '../engine';
import { engine, playerById, useGame, useRun, type PosFilter, type SortKey } from '../game/store';
import { t } from '../i18n/strings';
import { Btn, Chip, defOf, f1, nameOf, seasonTag, signed, TeamDot } from './common';

const SORTS: SortKey[] = ['PPG', 'RPG', 'APG', 'DEF'];
const sortValue: Record<SortKey, (p: Player) => number> = {
  PPG: (p) => p.ppg,
  RPG: (p) => p.rpg,
  APG: (p) => p.apg,
  DEF: defOf,
};

export function PlayerPicker() {
  const run = useRun();
  const ui = useGame((s) => s.ui);
  const { select, setFilter, setSort } = useGame.getState();
  const draft = run.draft;
  const sixth = draft.phase === 'sixthMan';

  const pool = useMemo(() => (draft.current && !ui.spinning ? currentPool(engine, draft) : []), [draft, ui.spinning]);
  const rows = useMemo(() => {
    const list = pool.filter((p) => {
      if (ui.filter === 'ALL') return true;
      return sixth ? p.pos.includes(ui.filter) : eligibleSlots(draft, p).includes(ui.filter);
    });
    // Blind mode: sorting by a hidden stat would leak it, so fall back to name order.
    if (ui.blind) return list.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    const v = sortValue[ui.sort];
    return list.sort((a, b) => v(b) - v(a));
  }, [pool, ui.filter, ui.sort, ui.blind, sixth, draft]);

  const filters: PosFilter[] = ['ALL', ...POSITIONS];
  const selected = playerById(ui.selectedId);

  return (
    <div className="flex h-full min-h-0 flex-col gap-[0.4rem]" data-testid="picker">
      <div className="flex items-center gap-[0.3rem]">
        <div className="flex gap-[0.2rem]" role="tablist" aria-label="Position filter">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              data-testid={`filter-${f}`}
              onClick={() => setFilter(f)}
              className={`rounded-md px-[0.45rem] py-[0.15rem] text-[0.78rem] font-bold ${ui.filter === f ? 'bg-ink text-bg' : 'bg-white/6 text-ink-2 hover:bg-white/12'}`}
            >
              {f === 'ALL' ? t.all : f}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-[0.2rem]" aria-label={t.sortBy}>
          {SORTS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={ui.blind}
              data-testid={`sort-${s}`}
              onClick={() => setSort(s)}
              className={`rounded-md px-[0.4rem] py-[0.15rem] text-[0.72rem] font-bold disabled:opacity-30 ${ui.sort === s && !ui.blind ? 'bg-accent/20 text-accent' : 'text-ink-3 hover:text-ink'}`}
            >
              {s === 'DEF' ? t.def : s}
            </button>
          ))}
        </div>
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto rounded-lg border border-line bg-black/20" data-testid="player-list">
        {!draft.current || ui.spinning ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-[0.9rem] text-ink-3">{ui.spinning ? t.spinning : t.emptyPool}</div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[0.9rem] text-ink-3">{t.noMatches}</div>
        ) : (
          <ul>
            {rows.map((p) => (
              <PlayerRow key={p.id} p={p} active={p.id === ui.selectedId} blind={ui.blind} sortKey={ui.sort} onClick={() => select(p.id === ui.selectedId ? null : p.id)} />
            ))}
          </ul>
        )}
      </div>

      <PreviewBar player={selected} />
    </div>
  );
}

function PlayerRow({ p, active, blind, sortKey, onClick }: { p: Player; active: boolean; blind: boolean; sortKey: SortKey; onClick: () => void }) {
  const cols: [SortKey, number][] = [
    ['PPG', p.ppg],
    ['RPG', p.rpg],
    ['APG', p.apg],
    ['DEF', defOf(p)],
  ];
  return (
    <li>
      <button
        type="button"
        data-testid="player-row"
        data-id={p.id}
        aria-pressed={active}
        onClick={onClick}
        className={`grid w-full grid-cols-[1fr_auto] items-center gap-[0.5rem] border-b border-line px-[0.55rem] py-[0.32rem] text-left transition ${active ? 'bg-accent/15 shadow-[inset_0.2rem_0_0] shadow-accent' : 'hover:bg-white/5'}`}
      >
        <span className="flex min-w-0 items-center gap-[0.45rem]">
          <TeamDot team={p.team} size="0.8rem" />
          <span className="truncate text-[0.95rem] font-bold">{nameOf(p)}</span>
          <span className="shrink-0 text-[0.72rem] font-semibold text-ink-3">
            {p.pos.join('/')} · {seasonTag(p.season)}
          </span>
        </span>
        {blind ? (
          <span className="text-[0.75rem] text-ink-3">{t.hidden}</span>
        ) : (
          <span className="tabular grid grid-cols-4 gap-[0.35rem] text-right text-[0.85rem]">
            {cols.map(([k, v]) => (
              <span key={k} className={`w-[2.3rem] ${k === sortKey ? 'font-extrabold text-ink' : 'text-ink-2'}`}>
                {f1(v)}
                {k === 'DEF' && p.defEst ? '*' : ''}
              </span>
            ))}
          </span>
        )}
      </button>
    </li>
  );
}

const COMPONENTS: [keyof TeamRatingBreakdown, string][] = [
  ['spacing', t.spacing],
  ['playmaking', t.playmaking],
  ['usage', t.usage],
  ['defense', t.defense],
  ['bench', t.bench],
];

/** Step 1 of the two-step pick: preview + live TeamRating change. Step 2: Lock In. */
function PreviewBar({ player }: { player: Player | null }) {
  const run = useRun();
  const ui = useGame((s) => s.ui);
  const { lockIn, setSlot } = useGame.getState();
  const draft = run.draft;
  const sixth = draft.phase === 'sixthMan';

  const preview = useMemo(() => {
    if (!player) return null;
    const before = teamRating(engine.rater, draft.lineup, sixth ? null : draft.sixthMan, null);
    const after = sixth
      ? teamRating(engine.rater, draft.lineup, player, null)
      : ui.slot
        ? teamRating(engine.rater, { ...draft.lineup, [ui.slot]: player }, null, null)
        : null;
    return { before, after };
  }, [player, draft, ui.slot, sixth]);

  const slots = player && !sixth ? eligibleSlots(draft, player) : [];
  const emptyLineup = POSITIONS.every((p) => !draft.lineup[p]);

  return (
    <div className="h-[4.6rem] shrink-0 rounded-lg border border-line bg-panel-2 px-[0.6rem] py-[0.4rem]" data-testid="preview">
      <AnimatePresence mode="wait" initial={false}>
        {!player || !preview ? (
          <m.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full items-center text-[0.85rem] text-ink-3">
            {t.tapToPreview}
          </m.div>
        ) : (
          <m.div key={player.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="grid h-full grid-cols-[1fr_auto] items-center gap-[0.6rem]">
            <div className="min-w-0">
              <div className="flex items-center gap-[0.4rem]">
                <TeamDot team={player.team} />
                <span className="truncate text-[1.05rem] font-extrabold">{nameOf(player)}</span>
                <span className="shrink-0 text-[0.75rem] text-ink-3">
                  {FRANCHISES[player.team].name} {player.season - 1}-{String(player.season % 100).padStart(2, '0')}
                </span>
              </div>
              {ui.blind ? (
                <div className="text-[0.8rem] text-ink-3">{t.hidden}</div>
              ) : (
                <div className="tabular mt-[0.1rem] flex flex-wrap items-center gap-x-[0.5rem] gap-y-[0.15rem] text-[0.8rem] text-ink-2">
                  <span>
                    {f1(player.ppg)} PTS · {f1(player.rpg)} REB · {f1(player.apg)} AST · {f1(player.spg)} STL · {f1(player.bpg)} BLK
                    {player.defEst && (
                      <span className="text-ink-3" title={t.estimatedHint}>
                        {' '}
                        ({t.estimated})
                      </span>
                    )}{' '}
                    · {(player.ts * 100).toFixed(1)} TS%
                  </span>
                  {preview.after && <RatingDelta before={preview.before} after={preview.after} emptyLineup={emptyLineup && !sixth} />}
                </div>
              )}
            </div>
            <div className="flex items-center gap-[0.4rem]">
              {slots.length > 1 && (
                <div className="flex flex-col items-end gap-[0.15rem]">
                  <span className="text-[0.6rem] font-bold tracking-wider text-ink-3 uppercase">{t.playAs}</span>
                  <div className="flex gap-[0.2rem]">
                    {slots.map((s) => (
                      <button
                        key={s}
                        type="button"
                        data-testid={`slot-${s}`}
                        onClick={() => setSlot(s)}
                        className={`rounded px-[0.35rem] text-[0.75rem] font-bold ${ui.slot === s ? 'bg-ink text-bg' : 'bg-white/8 text-ink-2'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Btn variant="primary" testId="lock-in" onClick={lockIn} disabled={!sixth && !ui.slot} className="h-[2.6rem] text-[0.95rem]">
                {t.lockIn}
                {!sixth && ui.slot ? ` · ${ui.slot}` : ''}
              </Btn>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RatingDelta({ before, after, emptyLineup }: { before: TeamRatingBreakdown; after: TeamRatingBreakdown; emptyLineup: boolean }) {
  const d = after.total - before.total;
  const synergy = COMPONENTS.map(([k, label]) => [label, (after[k] as number) - (before[k] as number)] as const).filter(([, v]) => Math.abs(v) >= 0.05);
  return (
    <span className="flex items-center gap-[0.3rem]" data-testid="rating-delta">
      <Chip tone={emptyLineup ? 'accent' : d >= 0 ? 'good' : 'bad'}>
        {t.tr} {emptyLineup ? f1(after.total) : `${f1(before.total)}→${f1(after.total)} (${signed(d)})`}
      </Chip>
      {synergy.map(([label, v]) => (
        <Chip key={label} tone={v >= 0 ? 'good' : 'bad'}>
          {signed(v)} {label}
        </Chip>
      ))}
    </span>
  );
}

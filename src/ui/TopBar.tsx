import { POSITIONS, teamRating, type GameMode } from '../engine';
import { engine, useGame, useRun } from '../game/store';
import { todayUTC } from '../game/share';
import { t } from '../i18n/strings';
import { f1 } from './common';

export function TopBar() {
  const run = useRun();
  const mode = useGame((s) => s.mode);
  const blind = useGame((s) => s.ui.blind);
  const { setMode, toggleBlind } = useGame.getState();
  const d = run.draft;
  const filled = POSITIONS.filter((p) => d.lineup[p]).length;
  const step = run.simulated ? null : d.phase === 'starters' ? t.pick(Math.min(filled + 1, 5)) : d.phase === 'sixthMan' ? t.sixthManPick : t.coachPick;
  const tr = filled ? teamRating(engine.rater, d.lineup, d.sixthMan, d.coach).total : null;

  return (
    <header className="flex h-full items-center gap-[0.6rem] px-[0.8rem]" data-testid="topbar">
      <div className="flex items-baseline gap-[0.3rem] text-[1.05rem] font-black tracking-tight whitespace-nowrap">
        <span className="text-accent">●</span> HoopDraft <span className="text-accent">82-0</span>
      </div>

      <div className="flex rounded-lg bg-white/6 p-[0.15rem]" role="tablist" aria-label="Mode">
        {(['classic', 'daily'] as GameMode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            data-testid={`mode-${m}`}
            onClick={() => setMode(m)}
            className={`rounded-md px-[0.6rem] py-[0.15rem] text-[0.8rem] font-bold ${mode === m ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink'}`}
          >
            {m === 'classic' ? t.classic : `${t.daily} ${todayUTC().slice(5)}`}
          </button>
        ))}
      </div>

      {step && <div className="text-[0.85rem] font-bold text-ink-2" data-testid="step">{step}</div>}

      <div className="ml-auto flex items-center gap-[0.7rem]">
        <div className="tabular text-[0.85rem] text-ink-2" data-testid="topbar-rating">
          {t.teamRating}{' '}
          <b className="text-[1.05rem] text-ink">{tr === null ? '—' : blind && !run.simulated ? '??' : f1(tr)}</b>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={blind}
          data-testid="blind-toggle"
          onClick={toggleBlind}
          title={t.blindHint}
          className="flex items-center gap-[0.35rem] text-[0.8rem] font-bold text-ink-2"
        >
          <span className={`relative h-[1rem] w-[1.8rem] rounded-full transition ${blind ? 'bg-accent' : 'bg-white/15'}`}>
            <span className={`absolute top-[0.12rem] h-[0.76rem] w-[0.76rem] rounded-full bg-white transition-all ${blind ? 'left-[0.92rem]' : 'left-[0.12rem]'}`} />
          </span>
          {t.blind}
        </button>
      </div>
    </header>
  );
}

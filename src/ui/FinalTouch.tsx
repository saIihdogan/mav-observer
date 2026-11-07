import { m } from 'motion/react';
import { COACH_INFO, COACH_SYSTEMS, teamRating, type CoachSystem } from '../engine';
import { engine, useGame, useRun } from '../game/store';
import { t } from '../i18n/strings';
import { Btn, f1, nameOf, seasonTag, TeamDot } from './common';
import { FRANCHISES } from '../config/franchises';
import { PlayerPicker } from './PlayerPicker';
import { Wheel } from './Wheel';

/** Bonus draft: 6th man spin + head coach system, then the 82-game sim. */
export function FinalTouch() {
  const run = useRun();
  const draft = run.draft;
  const blind = useGame((s) => s.ui.blind);
  const { chooseCoach, simulate } = useGame.getState();
  const coachOpen = draft.phase === 'coach' || draft.phase === 'done';

  return (
    <m.div
      key="final"
      initial={{ opacity: 0, scale: 1.04, filter: 'blur(6px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="flex h-full min-h-0 flex-col gap-[0.45rem]"
      data-testid="final-touch"
    >
      <m.div
        initial={{ letterSpacing: '0.6em', opacity: 0 }}
        animate={{ letterSpacing: '0.14em', opacity: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="flex items-baseline justify-center gap-[0.6rem] text-center uppercase"
      >
        <span className="text-[1.25rem] font-black text-accent">{t.finalTouch}</span>
        <span className="text-[0.85rem] font-bold text-ink-2">{t.finalTouchSub}</span>
      </m.div>

      <div className="grid min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)_17rem] gap-[0.6rem]">
        <section className="flex min-h-0 flex-col rounded-xl border border-line bg-panel/80 p-[0.6rem]">
          {draft.sixthMan ? (
            <SixthManCard />
          ) : (
            <>
              <div className="text-[0.75rem] text-ink-2">{t.spinSixth}</div>
              <div className="min-h-0 flex-1">
                <Wheel compact />
              </div>
            </>
          )}
        </section>

        <section className="min-h-0">
          {draft.phase === 'sixthMan' ? (
            <PlayerPicker />
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-line bg-black/20 text-[0.9rem] text-ink-3">
              {t.chooseCoach} →
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-col gap-[0.4rem] rounded-xl border border-line bg-panel/80 p-[0.6rem]">
          <div className="text-[0.62rem] font-bold tracking-wider text-ink-3 uppercase">{t.chooseCoach}</div>
          {COACH_SYSTEMS.map((c) => (
            <CoachCard key={c} coach={c} disabled={!coachOpen} active={draft.coach === c} blind={blind} onPick={() => chooseCoach(c)} />
          ))}
          <Btn
            variant="primary"
            testId="simulate"
            className="mt-auto h-[2.8rem] text-[1rem]"
            disabled={draft.phase !== 'done'}
            onClick={simulate}
            title={coachOpen ? undefined : t.pickSixthFirst}
          >
            ▶ {t.simulate}
          </Btn>
        </section>
      </div>
    </m.div>
  );
}

function CoachCard({ coach, disabled, active, blind, onPick }: { coach: CoachSystem; disabled: boolean; active: boolean; blind: boolean; onPick: () => void }) {
  const run = useRun();
  const info = COACH_INFO[coach];
  const r = disabled ? null : teamRating(engine.rater, run.draft.lineup, run.draft.sixthMan, coach);
  return (
    <button
      type="button"
      data-testid={`coach-${coach}`}
      disabled={disabled}
      onClick={onPick}
      aria-pressed={active}
      className={`rounded-lg border px-[0.55rem] py-[0.35rem] text-left transition disabled:opacity-40 ${active ? 'border-accent bg-accent/15' : 'border-white/10 bg-panel-2 hover:border-white/25'}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[0.9rem] font-extrabold">{info.label}</span>
        {r && !blind && <span className="tabular shrink-0 text-[0.85rem] font-extrabold text-accent">{f1(r.total)}</span>}
      </div>
      {r && !blind && (
        <div className="mt-[0.15rem] h-[0.3rem] overflow-hidden rounded-full bg-white/10" title={`${t.coachFit} ${Math.round(r.coachFit * 100)}%`}>
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(r.coachFit * 100)}%` }} />
        </div>
      )}
      <div className="text-[0.72rem] leading-tight text-ink-3">{info.blurb}</div>
    </button>
  );
}

function SixthManCard() {
  const p = useRun().draft.sixthMan!;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[0.4rem] text-center" data-testid="sixth-man-card">
      <div className="text-[0.62rem] font-bold tracking-wider text-ink-3 uppercase">{t.sixthManPick}</div>
      <TeamDot team={p.team} size="2.4rem" />
      <div className="text-[1.15rem] font-black">{nameOf(p)}</div>
      <div className="text-[0.78rem] text-ink-2">
        {p.pos.join('/')} · {FRANCHISES[p.team].name} {seasonTag(p.season)}
      </div>
    </div>
  );
}

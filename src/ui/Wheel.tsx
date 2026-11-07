import { useEffect, useRef, useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { FRANCHISES, type FranchiseCode } from '../config/franchises';
import { canRespin, DECADES, type Decade } from '../engine';
import { engine, useGame, useRun } from '../game/store';
import { t } from '../i18n/strings';
import { Btn, TeamDot } from './common';

const SPIN_MS = 1100;
const teams = [...new Set(engine.active.map((k) => k.split('|')[0] as FranchiseCode))];

/**
 * Team + decade wheel. The outcome is decided by the engine the moment the
 * spin starts (seeded); the reel animation only reveals it.
 */
export function Wheel({ compact = false }: { compact?: boolean }) {
  const run = useRun();
  const spinning = useGame((s) => s.ui.spinning);
  const { spin, respin, landSpin } = useGame.getState();
  const reduce = useReducedMotion();
  const current = run.draft.current;
  const [shown, setShown] = useState<{ team: FranchiseCode; decade: Decade } | null>(current);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!spinning || !current) {
      setShown(current);
      return;
    }
    if (reduce) {
      setShown(current);
      landSpin();
      return;
    }
    const started = performance.now();
    let i = 0;
    const tick = () => {
      const elapsed = performance.now() - started;
      if (elapsed >= SPIN_MS) {
        setShown(current);
        landSpin();
        return;
      }
      i++;
      setShown({ team: teams[(i * 7 + Math.floor(elapsed)) % teams.length], decade: DECADES[(i * 3) % DECADES.length] });
      // Ease out: ticks get slower as the reel lands.
      timer.current = window.setTimeout(tick, 45 + (elapsed / SPIN_MS) ** 2 * 160);
    };
    tick();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [spinning, current, reduce, landSpin]);

  const canSpin = !current && !spinning && (run.draft.phase === 'starters' || run.draft.phase === 'sixthMan');
  const landed = !!current && !spinning;
  const info = shown ? FRANCHISES[shown.team] : null;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-[0.7rem]" data-testid="wheel">
      <div className={`grid w-full gap-[0.5rem] ${compact ? 'grid-cols-1' : 'grid-cols-[1fr_auto]'}`}>
        <Reel label={t.team} landed={landed} accent={info?.colors[0]}>
          {shown && info ? (
            <span className="flex min-w-0 items-center gap-[0.45rem]">
              <TeamDot team={shown.team} size="1.3rem" />
              <span className="truncate" data-testid="wheel-team" data-team={landed ? shown.team : undefined}>
                {info.name}
              </span>
            </span>
          ) : (
            <span className="text-ink-3">— — —</span>
          )}
        </Reel>
        <Reel label={t.decade} landed={landed}>
          <span className="tabular" data-testid="wheel-decade" data-decade={landed && shown ? shown.decade : undefined}>
            {shown ? shown.decade : '— —'}
          </span>
        </Reel>
      </div>

      {canSpin ? (
        <m.button
          type="button"
          data-testid="spin"
          onClick={spin}
          whileTap={{ scale: 0.94 }}
          animate={reduce ? undefined : { scale: [1, 1.04, 1] }}
          transition={{ repeat: Infinity, duration: 1.6 }}
          className="flex h-[6.2rem] w-[6.2rem] flex-col items-center justify-center rounded-full bg-accent text-[1.35rem] font-black tracking-wide text-black uppercase shadow-[0_0_2.5rem_-0.4rem] shadow-accent/70"
        >
          {t.spin}
          <span className="text-[0.62rem] font-semibold tracking-normal normal-case opacity-70">{t.spinHint}</span>
        </m.button>
      ) : (
        <div className="flex w-full gap-[0.4rem]">
          <RespinBtn kind="team" disabled={!landed || !canRespin(run.draft, 'team')} left={run.draft.teamRespins} onClick={() => respin('team')} />
          <RespinBtn kind="era" disabled={!landed || !canRespin(run.draft, 'era')} left={run.draft.eraRespins} onClick={() => respin('era')} />
        </div>
      )}
      {run.draft.bonusRespins > 0 && <div className="text-[0.75rem] text-gold">+{run.draft.bonusRespins} bonus re-spin</div>}
      {spinning && <div className="text-[0.8rem] text-ink-3">{t.spinning}</div>}
    </div>
  );
}

function Reel({ label, children, landed, accent }: { label: string; children: React.ReactNode; landed: boolean; accent?: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-[0.15rem] text-[0.62rem] font-bold tracking-[0.12em] text-ink-3 uppercase">{label}</div>
      <m.div
        key={landed ? 'landed' : 'rolling'}
        initial={landed ? { scale: 0.92 } : false}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
        className="flex h-[2.6rem] items-center overflow-hidden rounded-lg border border-white/10 bg-panel-2 px-[0.6rem] text-[1.05rem] font-extrabold"
        style={landed && accent ? { boxShadow: `inset 0.25rem 0 0 ${accent}` } : undefined}
      >
        {children}
      </m.div>
    </div>
  );
}

function RespinBtn({ kind, disabled, left, onClick }: { kind: 'team' | 'era'; disabled: boolean; left: number; onClick: () => void }) {
  return (
    <Btn variant="outline" className="flex-1 !px-2 text-[0.82rem]" disabled={disabled} onClick={onClick} testId={`respin-${kind}`}>
      <span className="whitespace-nowrap">↻ {kind === 'team' ? t.respinTeam : t.respinEra}</span>
      <span className="rounded bg-white/10 px-[0.3rem] text-[0.7rem] font-bold text-ink-2" title={t.respinLeft(left)}>
        {left}
      </span>
    </Btn>
  );
}

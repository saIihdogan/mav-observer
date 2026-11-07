import { useEffect, useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import type { SeasonResult } from '../engine';
import { useGame } from '../game/store';
import { t } from '../i18n/strings';
import { Btn } from './common';

const SIM_MS = 3200;

/** Game-by-game reveal of the (already decided) season. */
export function SeasonSim({ result }: { result: SeasonResult }) {
  const reduce = useReducedMotion();
  const finishSim = useGame((s) => s.finishSim);
  const [shown, setShown] = useState(reduce ? result.games.length : 0);

  useEffect(() => {
    if (reduce) {
      finishSim();
      return;
    }
    const start = performance.now();
    let raf = 0;
    const loop = () => {
      // Ease-in so the last games (where perfect seasons die) get suspense.
      const x = Math.min(1, (performance.now() - start) / SIM_MS);
      const n = Math.round(result.games.length * (1 - Math.pow(1 - x, 1.6)));
      setShown(n);
      if (x < 1) raf = requestAnimationFrame(loop);
      else window.setTimeout(finishSim, 450);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduce, result, finishSim]);

  const played = result.games.slice(0, shown);
  const wins = played.filter((g) => g.win).length;
  const last = played[played.length - 1];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-[0.9rem]" data-testid="season-sim">
      <div className="text-[0.8rem] font-bold tracking-[0.2em] text-ink-3 uppercase">{t.simulating}</div>
      <div className="tabular text-[4.4rem] leading-none font-black">
        <span className="text-good">{wins}</span>
        <span className="text-ink-3">-</span>
        <span className={shown - wins ? 'text-bad' : 'text-ink-3'}>{shown - wins}</span>
      </div>
      <div className="h-[1.2rem] text-[0.85rem] text-ink-2">
        {last && (
          <>
            {t.game}
            {last.game} · {last.win ? 'W' : 'L'} {Math.abs(last.margin)}
          </>
        )}
      </div>
      <div className="grid grid-cols-[repeat(41,0.85rem)] gap-[0.18rem]" aria-hidden>
        {result.games.map((g, i) => (
          <m.span
            key={g.game}
            initial={false}
            animate={{ opacity: i < shown ? 1 : 0.18, scale: i === shown - 1 ? 1.35 : 1 }}
            className={`h-[0.85rem] w-[0.85rem] rounded-[0.2rem] ${i < shown ? (g.win ? 'bg-good' : 'bg-bad') : 'bg-white/30'}`}
          />
        ))}
      </div>
      <Btn variant="outline" onClick={finishSim} testId="skip-sim">
        {t.skip} ⏭
      </Btn>
    </div>
  );
}

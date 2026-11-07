import { AnimatePresence, domAnimation, LazyMotion, m, MotionConfig } from 'motion/react';
import { resultFor, screenOf, useGame, useRun } from './game/store';
import { Dock } from './ui/Dock';
import { FinalTouch } from './ui/FinalTouch';
import { PlayerPicker } from './ui/PlayerPicker';
import { SeasonReport } from './ui/SeasonReport';
import { SeasonSim } from './ui/SeasonSim';
import { TopBar } from './ui/TopBar';
import { Wheel } from './ui/Wheel';

/**
 * Lands directly in gameplay: no title menu, the wheel's Spin button is the
 * first thing on screen. Fixed 16:9-friendly frame: top bar / stage / dock.
 */
export default function App() {
  const run = useRun();
  const ui = useGame((s) => s.ui);
  const mode = useGame((s) => s.mode);
  const screen = screenOf(run, ui);
  const result = resultFor(run);

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <div className="court-bg grid h-full w-full grid-rows-[2.7rem_minmax(0,1fr)_3.4rem] gap-[0.45rem] pb-[0.5rem]" data-testid="app" data-screen={screen} data-mode={mode}>
          <div className="border-b border-line bg-black/25">
            <TopBar />
          </div>

          <main className="min-h-0 px-[0.7rem]">
            <AnimatePresence mode="wait">
              {screen === 'draft' && (
                <m.div
                  key={`draft-${mode}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.97, filter: 'blur(4px)' }}
                  transition={{ duration: 0.25 }}
                  className="grid h-full min-h-0 grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] gap-[0.7rem]"
                >
                  <section className="min-h-0 rounded-xl border border-line bg-panel/80 p-[0.7rem]">
                    <Wheel />
                  </section>
                  <section className="min-h-0">
                    <PlayerPicker />
                  </section>
                </m.div>
              )}
              {screen === 'final' && <FinalTouch key={`final-${mode}`} />}
              {screen === 'sim' && result && (
                <m.div key="sim" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <SeasonSim result={result} />
                </m.div>
              )}
              {screen === 'report' && result && (
                <m.div key={`report-${mode}`} className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <SeasonReport result={result} />
                </m.div>
              )}
            </AnimatePresence>
          </main>

          <div className="min-h-0 px-[0.7rem]">
            <Dock />
          </div>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}

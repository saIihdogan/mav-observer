import { m } from 'motion/react';
import { FRANCHISES } from '../config/franchises';
import { canSwap, COACH_INFO, eligibleSlots, POSITIONS, type Player, type Position } from '../engine';
import { playerById, useGame, useRun } from '../game/store';
import { t } from '../i18n/strings';
import { nameOf, seasonTag, TeamDot } from './common';

/** Compact slot chips for the starting five (+ 6th man and coach). */
export function Dock() {
  const run = useRun();
  const ui = useGame((s) => s.ui);
  const { swap, setSlot } = useGame.getState();
  const draft = run.draft;
  const selected = playerById(ui.selectedId);
  const targets = selected && draft.phase === 'starters' ? eligibleSlots(draft, selected) : [];

  return (
    <div className="grid h-full grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,0.9fr)_minmax(0,0.9fr)] gap-[0.35rem]" data-testid="dock">
      {POSITIONS.map((pos) => {
        const p = draft.lineup[pos];
        const target = targets.includes(pos);
        const swappable = !!p && !run.simulated && POSITIONS.some((to) => canSwap(draft, pos, to));
        return (
          <SlotChip
            key={pos}
            label={pos}
            player={p}
            target={target}
            chosen={target && ui.slot === pos}
            onClick={target ? () => setSlot(pos) : undefined}
            onSwap={swappable ? () => swap(pos) : undefined}
          />
        );
      })}
      <SlotChip label={t.sixthManPick} player={draft.sixthMan ?? undefined} muted={draft.phase === 'starters'} />
      <div
        className={`flex min-w-0 flex-col justify-center rounded-lg border px-[0.5rem] ${draft.coach ? 'border-white/15 bg-panel-2' : 'border-dashed border-white/12'} ${draft.phase === 'starters' ? 'opacity-45' : ''}`}
        data-testid="dock-coach"
      >
        <span className="text-[0.62rem] font-bold tracking-wider text-ink-3 uppercase">{t.coachPick}</span>
        <span className="truncate text-[0.82rem] font-bold">{draft.coach ? COACH_INFO[draft.coach].label : t.empty}</span>
      </div>
    </div>
  );
}

function SlotChip({
  label,
  player,
  target,
  chosen,
  muted,
  onClick,
  onSwap,
}: {
  label: string;
  player?: Player;
  target?: boolean;
  chosen?: boolean;
  muted?: boolean;
  onClick?: () => void;
  onSwap?: () => void;
}) {
  const color = player ? FRANCHISES[player.team].colors[0] : undefined;
  return (
    <m.div
      layout
      data-testid={`dock-${label}`}
      data-filled={player ? 'true' : 'false'}
      onClick={onClick}
      className={`relative flex min-w-0 flex-col justify-center rounded-lg border px-[0.5rem] transition ${
        chosen ? 'border-accent bg-accent/15' : target ? 'cursor-pointer border-accent/60 bg-accent/5' : player ? 'border-white/15 bg-panel-2' : 'border-dashed border-white/12'
      } ${muted ? 'opacity-45' : ''}`}
      style={player ? { boxShadow: `inset 0.22rem 0 0 ${color}` } : undefined}
    >
      <span className="flex min-w-0 items-center gap-[0.25rem] text-[0.62rem] font-bold tracking-wider text-ink-3 uppercase">
        {label}
        {player && <span className="ml-auto truncate normal-case">{player.pos.join('/')}</span>}
        {onSwap && (
          <button
            type="button"
            title={t.swap}
            aria-label={`${t.swap} ${label}`}
            data-testid={`swap-${label as Position}`}
            onClick={(e) => {
              e.stopPropagation();
              onSwap();
            }}
            className="shrink-0 rounded-full bg-accent px-[0.3rem] text-[0.65rem] leading-[0.95rem] font-black text-black"
          >
            ⇄
          </button>
        )}
      </span>
      {player ? (
        <span className="flex min-w-0 items-center gap-[0.3rem]">
          <TeamDot team={player.team} size="0.7rem" />
          <span className="truncate text-[0.82rem] font-bold">{nameOf(player)}</span>
          <span className="shrink-0 text-[0.68rem] text-ink-3">{seasonTag(player.season)}</span>
        </span>
      ) : (
        <span className="text-[0.8rem] text-ink-3">{target ? '＋' : t.empty}</span>
      )}
    </m.div>
  );
}

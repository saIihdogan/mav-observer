import type { ReactNode } from 'react';
import { FRANCHISES, type FranchiseCode } from '../config/franchises';
import { displayName } from '../config/ipConfig';
import type { Player } from '../engine';

export const f1 = (x: number) => x.toFixed(1);
export const signed = (x: number, digits = 1) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(digits)}`;
export const seasonTag = (season: number) => `'${String(season % 100).padStart(2, '0')}`;
export const nameOf = (p: Player) => displayName(p);
export const defOf = (p: Player) => p.spg + p.bpg;

export function TeamDot({ team, size = '1.1rem' }: { team: FranchiseCode; size?: string }) {
  const [a, b] = FRANCHISES[team].colors;
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${a} 0 55%, ${b} 55% 100%)`, boxShadow: '0 0 0 1px rgb(255 255 255 / 0.25)' }}
    />
  );
}

export function Chip({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'accent'; title?: string }) {
  const tones = {
    neutral: 'bg-white/8 text-ink-2',
    good: 'bg-good/15 text-good',
    bad: 'bg-bad/15 text-bad',
    accent: 'bg-accent/15 text-accent',
  } as const;
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-px text-[0.78rem] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Btn({
  children,
  onClick,
  disabled,
  variant = 'ghost',
  className = '',
  testId,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'outline';
  className?: string;
  testId?: string;
  title?: string;
}) {
  const v = {
    primary: 'bg-accent text-black hover:brightness-110 active:brightness-95 shadow-[0_0.3rem_1.2rem_-0.3rem] shadow-accent/60',
    ghost: 'bg-white/6 text-ink hover:bg-white/12',
    outline: 'border border-white/15 text-ink hover:bg-white/8',
  }[variant];
  return (
    <button
      type="button"
      data-testid={testId}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-bold transition select-none disabled:cursor-not-allowed disabled:opacity-35 ${v} ${className}`}
    >
      {children}
    </button>
  );
}

import { type ReactNode } from 'react';

type Variant =
  | 'priority-high' | 'priority-medium' | 'priority-low'
  | 'urgency-immediate' | 'urgency-high' | 'urgency-medium' | 'urgency-low'
  | 'confidence-high' | 'confidence-medium' | 'confidence-low' | 'confidence-speculative'
  | 'status-pending' | 'status-extracting' | 'status-review' | 'status-imported' | 'status-error'
  | 'signal-type' | 'default' | 'review';

const variantClasses: Record<Variant, string> = {
  'priority-high': 'bg-red-900/50 text-red-300 border-red-800',
  'priority-medium': 'bg-amber-900/50 text-amber-300 border-amber-800',
  'priority-low': 'bg-slate-700/50 text-slate-300 border-slate-600',
  'urgency-immediate': 'bg-red-900/50 text-red-300 border-red-800',
  'urgency-high': 'bg-orange-900/50 text-orange-300 border-orange-800',
  'urgency-medium': 'bg-amber-900/50 text-amber-300 border-amber-800',
  'urgency-low': 'bg-slate-700/50 text-slate-300 border-slate-600',
  'confidence-high': 'bg-emerald-900/50 text-emerald-300 border-emerald-800',
  'confidence-medium': 'bg-sky-900/50 text-sky-300 border-sky-800',
  'confidence-low': 'bg-slate-700/50 text-slate-300 border-slate-600',
  'confidence-speculative': 'bg-purple-900/50 text-purple-300 border-purple-800',
  'status-pending': 'bg-slate-700/50 text-slate-300 border-slate-600',
  'status-extracting': 'bg-sky-900/50 text-sky-300 border-sky-800',
  'status-review': 'bg-amber-900/50 text-amber-300 border-amber-800',
  'status-imported': 'bg-emerald-900/50 text-emerald-300 border-emerald-800',
  'status-error': 'bg-red-900/50 text-red-300 border-red-800',
  'signal-type': 'bg-slate-700/50 text-slate-200 border-slate-600',
  'review': 'bg-amber-900/50 text-amber-300 border-amber-800',
  'default': 'bg-slate-700/50 text-slate-300 border-slate-600',
};

interface BadgeProps {
  children: ReactNode;
  variant?: Variant;
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}

export function priorityVariant(p: string): Variant {
  if (p === 'high') return 'priority-high';
  if (p === 'low') return 'priority-low';
  return 'priority-medium';
}

export function urgencyVariant(u: string): Variant {
  if (u === 'immediate') return 'urgency-immediate';
  if (u === 'high') return 'urgency-high';
  if (u === 'low') return 'urgency-low';
  return 'urgency-medium';
}

export function confidenceVariant(c: string): Variant {
  if (c === 'high') return 'confidence-high';
  if (c === 'low') return 'confidence-low';
  if (c === 'speculative') return 'confidence-speculative';
  return 'confidence-medium';
}

export function statusVariant(s: string): Variant {
  return `status-${s}` as Variant;
}

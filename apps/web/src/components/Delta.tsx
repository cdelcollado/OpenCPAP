import { IconDown, IconFlat, IconUp } from './icons';

/**
 * Signed change against a named baseline. `goodWhen` says which direction is an improvement; omit it for
 * measures where neither direction is good or bad (leak, pressure). Direction is shown by an arrow, not colour alone.
 */
export function Delta({ value, baseline, digits = 1, goodWhen, suffix, lang }: {
  value: number | undefined; baseline: number | undefined; digits?: number; goodWhen?: 'up' | 'down'; suffix: string; lang: string;
}) {
  if (value === undefined || baseline === undefined || Number.isNaN(value) || Number.isNaN(baseline)) return null;
  const diff = value - baseline;
  const eps = 0.5 * 10 ** -digits;
  const dir = Math.abs(diff) < eps ? 'flat' : diff > 0 ? 'up' : 'down';
  const tone = dir === 'flat' || !goodWhen ? '' : dir === goodWhen ? 'good' : 'bad';
  const Icon = dir === 'up' ? IconUp : dir === 'down' ? IconDown : IconFlat;
  const text = new Intl.NumberFormat(lang, { signDisplay: 'exceptZero', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(diff);
  return <span className={`delta ${tone}`}><Icon />{text} {suffix}</span>;
}

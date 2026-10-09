import type { ReactNode } from 'react';
import { InfoTip } from './InfoTip';

export function Stat({ label, value, unit, sub, tone, explain }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: 'good' | 'warn' | 'bad'; explain?: string }) {
  return (
    <div className="card">
      <div className="stat-label">{label}{explain && <InfoTip text={explain} />}</div>
      <div className={`stat-value ${tone ?? ''}`}>{value}{unit && <span className="stat-unit">{unit}</span>}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

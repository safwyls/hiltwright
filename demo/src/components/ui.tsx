import type { ReactNode, CSSProperties } from 'react';
import { Icon } from './Icon';

type BtnProps = {
  children: ReactNode;
  variant?: 'pri' | 'sec' | 'warn' | 'danger' | 'ghost';
  size?: 'md' | 'sm';
  icon?: string;
  onClick?: () => void;
  disabled?: boolean;
  full?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  'aria-label'?: string;
};

export function Button({ children, variant = 'sec', size = 'md', icon, onClick, disabled, full, title, type = 'button', ...rest }: BtnProps) {
  return (
    <button type={type} className={`btn ${variant === 'sec' ? '' : variant} ${size === 'sm' ? 'sm' : ''} ${full ? 'full' : ''}`} onClick={onClick} disabled={disabled} title={title} aria-label={rest['aria-label']}>
      <span className="b"><span className="i">{icon && <Icon name={icon} />}{children}</span></span>
    </button>
  );
}

export function Chip({ children, tone = '', icon, onClick, selected, title }: { children: ReactNode; tone?: '' | 'ok' | 'live' | 'warn' | 'err'; icon?: string; onClick?: () => void; selected?: boolean; title?: string }) {
  const inner = <>{icon ? <Icon name={icon} /> : <span className="dot" />}{children}</>;
  if (onClick) return <button type="button" className={`chip ${tone} ${selected ? 'sel' : ''}`} onClick={onClick} aria-pressed={selected} title={title}>{inner}</button>;
  return <span className={`chip ${tone}`} title={title}>{inner}</span>;
}

export function Panel({ children, tone = '', className = '', style, label }: { children: ReactNode; tone?: '' | 'amber' | 'red' | 'plain'; className?: string; style?: CSSProperties; label?: string }) {
  return <section className={`panel ${tone} ${className}`} style={style} aria-label={label}>{children}</section>;
}

export function PanelHead({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <div className="ph"><div className="row">{children}</div>{right}</div>;
}

export function Note({ children, tone = '', icon, action }: { children: ReactNode; tone?: '' | 'amber' | 'red' | 'green'; icon?: string; action?: ReactNode }) {
  const ic = icon ?? (tone === 'amber' ? 'warn' : tone === 'red' ? 'x' : tone === 'green' ? 'check' : 'info');
  return <div className={`note ${tone}`}><Icon name={ic} /><span className="grow">{children}</span>{action}</div>;
}

export function Meter({ pct, label }: { pct: number; label?: string }) {
  const filled = Math.round((Math.min(pct, 100) / 100) * 32);
  return (
    <div className="meter" role="img" aria-label={label ?? `${pct} percent used`}>
      {Array.from({ length: 32 }, (_, k) => {
        const p = ((k + 1) / 32) * 100;
        const cls = k < filled ? (p > 90 ? 'x' : p > 70 ? 'w' : 'f') : '';
        return <i key={k} className={cls} />;
      })}
    </div>
  );
}

export function Field({ label, children, right }: { label: string; children: ReactNode; right?: ReactNode }) {
  return (
    <label className="field">
      <span className="row between"><span className="label">{label}</span>{right}</span>
      {children}
    </label>
  );
}

export function Select({ value, onChange, options, icon, sans, ariaLabel, tag }: { value: string; onChange: (v: string) => void; options: { value: string; label: string; disabled?: boolean }[]; icon?: string; sans?: boolean; ariaLabel?: string; tag?: ReactNode }) {
  const current = options.find((o) => o.value === value);
  return (
    <span className={`input ${sans ? 'sans' : ''}`}>
      {icon && <Icon name={icon} />}
      <span className="ellip">{current?.label ?? value}</span>
      {tag}
      <span className="caret"><Icon name="down" /></span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel}>
        {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
    </span>
  );
}

export function TextInput({ value, onChange, sans, ariaLabel, placeholder }: { value: string; onChange: (v: string) => void; sans?: boolean; ariaLabel?: string; placeholder?: string }) {
  return (
    <span className={`input ${sans ? 'sans' : ''}`}>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} placeholder={placeholder} />
    </span>
  );
}

export function NumberInput({ value, onChange, min, max, ariaLabel, suffix }: { value: number; onChange: (v: number) => void; min?: number; max?: number; ariaLabel?: string; suffix?: string }) {
  return (
    <span className="input">
      <input type="number" value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} aria-label={ariaLabel} />
      {suffix && <span className="mute" style={{ marginLeft: 'auto', pointerEvents: 'none', zIndex: 1 }}>{suffix}</span>}
    </span>
  );
}

export function Slider({ value, min, max, step = 1, onChange, ariaLabel }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; ariaLabel: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider">
      <span className="track" /><span className="fill" style={{ width: `${pct}%` }} />
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={ariaLabel} />
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="row" style={{ gap: 10, fontSize: 13, color: 'var(--dim)', cursor: 'pointer' }}>
      <button type="button" className={`tog ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}><i /></button>
      {label}
    </label>
  );
}

export function Swatch({ label, color, arg, onChange, linkedTo, onUnlink }: { label: string; color: string; arg?: string; onChange?: (c: string) => void; linkedTo?: string; onUnlink?: () => void }) {
  if (linkedTo) {
    return (
      <button type="button" className="swatch linked" onClick={onUnlink} aria-label={`${label} follows ${linkedTo}. Unlink to choose its own colour`} title="Unlink">
        <span className="sq" style={{ '--c': color, opacity: 0.8 } as CSSProperties} />
        <span className="grow ellip small">{label}</span>
        <span className="row holo" style={{ gap: 4, fontSize: 11, fontWeight: 600 }}><Icon name="link" size={13} />{linkedTo}</span>
      </button>
    );
  }
  return (
    <span className="swatch">
      <span className="sq" style={{ '--c': color } as CSSProperties} />
      <span className="grow ellip small">{label}</span>
      {arg && <span className="mono mute nowrap" style={{ fontSize: 11 }}>{arg}</span>}
      <input type="color" value={color} onChange={(e) => onChange?.(e.target.value)} aria-label={`${label}: ${color}. Change colour`} />
    </span>
  );
}

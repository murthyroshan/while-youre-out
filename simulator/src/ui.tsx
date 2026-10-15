// Small UI pieces for the simulator page: icons, a switch and a segmented control.
import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  play: <path d="M7 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L8.5 4.64A1 1 0 0 0 7 5.5Z" fill="currentColor" stroke="none" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor" stroke="none" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  send: <path d="M5 12h12M12 5l7 7-7 7" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  bell: <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0" />,
  chat: <path d="M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M4.2 5.7l2.1 2.1M17.7 16.2l2.1 2.1M2.5 12h3M18.5 12h3M4.2 18.3l2.1-2.1M17.7 7.8l2.1-2.1" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </>
  ),
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

/** The brand mark: a house with a crescent moon, for the evening the parents are out. */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="wyo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F7B955" />
          <stop offset="1" stopColor="#F0723C" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill="url(#wyo-g)" />
      <path d="M11 20.5 20 13l9 7.5V29a1 1 0 0 1-1 1h-5v-6h-6v6h-5a1 1 0 0 1-1-1v-8.5Z" fill="#0B1220" opacity=".88" />
      <path d="M29.5 8.5a4.5 4.5 0 1 0 3 7.9 3.6 3.6 0 0 1-3-7.9Z" fill="#FFF7E6" />
    </svg>
  );
}

export function Switch(props: { checked: boolean; onChange: (on: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="switch-row">
      <span>
        <b>{props.label}</b>
        {props.hint && <small>{props.hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <i className="switch" aria-hidden="true" />
    </label>
  );
}

export function Segmented<T extends string>(props: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  const index = Math.max(0, props.options.findIndex(([v]) => v === props.value));
  return (
    <div className="seg-field">
      <span className="seg-label">{props.label}</span>
      <div className="segmented" role="radiogroup" aria-label={props.label} style={{ ['--n' as string]: props.options.length, ['--i' as string]: index }}>
        <i className="seg-thumb" aria-hidden="true" />
        {props.options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={v === props.value} className={v === props.value ? 'on' : ''} onClick={() => props.onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

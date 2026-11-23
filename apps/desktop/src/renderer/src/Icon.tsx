const P: Record<string, string> = {
  armory: '<path d="M4 4h16v16H4z"/><path d="M9 7v10M15 7v10"/><path d="M7 12h4M13 12h4"/>',
  presets: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  looks: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
  fonts: '<path d="M7 3h7l4 4v14H7z"/><path d="M10 13v5M13 11v7M16 14v4"/>',
  build: '<rect x="7" y="7" width="10" height="10"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  diag: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  gear: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
  usb: '<path d="M12 3v13"/><circle cx="12" cy="19" r="2.5"/><path d="M12 9l4-2v3M12 12l-4-2v3"/>',
  battery: '<rect x="3" y="8" width="16" height="8"/><path d="M21 11v2"/><path d="M6 11v2M9 11v2M12 11v2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.5"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  import: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 20h16"/>',
  export: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 20h16"/>',
  eject: '<path d="M5 15l7-8 7 8z"/><path d="M5 19h14"/>',
  copy: '<rect x="9" y="9" width="11" height="11"/><path d="M5 15V4h11"/>',
  bolt: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
  sd: '<path d="M6 3h9l3 3v15H6z"/><path d="M9 3v4M12 3v4M15 3v4"/>',
  lock: '<rect x="5" y="11" width="14" height="10"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>',
  spin: '<path d="M12 3a9 9 0 019 9" stroke-width="2.4"/><circle cx="12" cy="12" r="9" opacity=".25"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  blade: '<path d="M10 22v-7h4v7z"/><path d="M12 15V2"/><path d="M9 18h6"/>',
  crystal: '<path d="M12 2l5 6v8l-5 6-5-6V8z"/><path d="M12 2v20"/><path d="M7 8l5 3 5-3"/>',
  led: '<circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  motor: '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5a7.5 7.5 0 017.5 7.5"/><path d="M17 8.5l2.5 3.5 3-3"/>',
  side: '<path d="M12 22V4"/><path d="M4 13h16"/><path d="M4 13v-3M20 13v-3"/><path d="M9 19h6"/>',
  strip: '<rect x="3" y="9" width="18" height="6"/><path d="M7 9v6M11 9v6M15 9v6"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  unlink: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/><path d="M4 4l16 16"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 13.6a5 5 0 015.5 5"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>',
  eyeOff: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><path d="M4 4l16 16"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/>',
  tree: '<path d="M5 4v16M5 8h7M5 16h7"/><rect x="12" y="5" width="7" height="6"/><rect x="12" y="13" width="7" height="6"/>',
  power: '<path d="M12 3v8"/><path d="M6.3 6.3a8 8 0 1011.4 0"/>',
  fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  exitfull: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>',
  grip: '',
};

export type IconName = keyof typeof P;

export function Icon({ name, size, className, style }: { name: string; size?: number; className?: string; style?: React.CSSProperties }) {
  if (name === 'grip') {
    return (
      <svg viewBox="0 0 12 16" fill="currentColor" aria-hidden="true" className={className} style={{ width: size ?? 12, height: (size ?? 12) * 1.33, ...style }}>
        <circle cx="3" cy="3" r="1.4" /><circle cx="9" cy="3" r="1.4" /><circle cx="3" cy="8" r="1.4" /><circle cx="9" cy="8" r="1.4" /><circle cx="3" cy="13" r="1.4" /><circle cx="9" cy="13" r="1.4" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={className} style={size ? { width: size, height: size, ...style } : style}
      dangerouslySetInnerHTML={{ __html: P[name] ?? '' }}
    />
  );
}

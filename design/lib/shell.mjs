// Shared visual system for the Hiltwright mockup artboards.
// Every artboard is self-contained, so this is inlined into each .dc.html by build.mjs.

export const FONTS =
  'https://fonts.googleapis.com/css2?family=Michroma&family=Exo+2:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap';

export const CSS = `
:root{
  --bg0:#0a0e13;--bg1:#101720;--bg2:#16202b;--bg3:#1c2833;
  --line:#24313f;--line2:#3b4c5e;
  --text:#e6edf3;--dim:#a3b3c2;--mute:#7a8b9b;
  --holo:#5fd3ff;--holo-ink:#062533;--holo-dim:#2a8bb0;
  --amber:#ffb547;--amber-ink:#2b1a00;--red:#ff5c5c;--green:#5ee39a;
  --hud:rgba(95,211,255,.5);
  --mono:'JetBrains Mono',ui-monospace,Consolas,monospace;
  --disp:Michroma,'Exo 2','Segoe UI',sans-serif;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg0);color:var(--text);font-family:'Exo 2','Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased}
a{color:var(--holo)}a:hover{color:#8fe1ff}
button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;text-align:left}
.app{width:1440px;height:900px;display:grid;grid-template-columns:232px 1fr;grid-template-rows:56px 1fr 32px;background:var(--bg0);overflow:hidden;position:relative}
.side{grid-row:1/4;background:#0c1117;border-right:1px solid var(--line);display:flex;flex-direction:column}
.brand{height:56px;display:flex;align-items:center;gap:12px;padding:0 18px;border-bottom:1px solid var(--line);font-family:var(--disp);font-size:12px;letter-spacing:.2em;color:var(--text)}
.brand svg{width:22px;height:22px}
.nav{display:flex;flex-direction:column;gap:2px;padding:12px 10px}
.nav a{display:flex;align-items:center;gap:12px;height:40px;padding:0 12px;color:var(--dim);text-decoration:none;font-weight:500;font-size:13.5px;letter-spacing:.02em;border-left:2px solid transparent}
.nav a svg{width:18px;height:18px;flex:none}
.nav a.on{color:#fff;border-left-color:var(--holo);background:linear-gradient(90deg,rgba(95,211,255,.14),rgba(95,211,255,0))}
.nav a:hover{color:#fff;background:rgba(255,255,255,.03)}
.nav .sec{font-family:var(--disp);font-size:9px;letter-spacing:.22em;color:var(--mute);padding:14px 12px 6px;text-transform:uppercase}
.nav .tier{margin-left:auto;font-family:var(--mono);font-size:10px;color:var(--mute);letter-spacing:.06em}
.top{display:flex;align-items:center;justify-content:space-between;padding:0 28px;border-bottom:1px solid var(--line);background:#0d131a;gap:16px}
.main{padding:24px 32px;overflow:hidden;position:relative;display:flex;flex-direction:column;gap:20px}
.main::before{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.022) 0 1px,transparent 1px 3px)}
.status{grid-column:2;display:flex;align-items:center;gap:22px;padding:0 28px;border-top:1px solid var(--line);background:#0d131a;font-family:var(--mono);font-size:11.5px;color:var(--mute)}
.status b{color:var(--dim);font-weight:500}
.eyebrow{font-family:var(--disp);font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:var(--holo);opacity:.9}
h1{font-family:var(--disp);font-size:22px;font-weight:400;letter-spacing:.04em;margin:6px 0 0;line-height:1.2}
h2{font-family:var(--disp);font-size:11.5px;font-weight:400;letter-spacing:.14em;text-transform:uppercase;margin:0;color:var(--text)}
h3{font-size:15px;font-weight:600;margin:0}
p{margin:0}
.lead{color:var(--dim);font-size:14.5px;max-width:640px;text-wrap:pretty}
.panel{background:var(--bg1);border:1px solid var(--line);position:relative}
.panel::after{content:"";position:absolute;inset:-1px;pointer-events:none;background-repeat:no-repeat;background-image:
  linear-gradient(var(--hud),var(--hud)),linear-gradient(var(--hud),var(--hud)),
  linear-gradient(var(--hud),var(--hud)),linear-gradient(var(--hud),var(--hud)),
  linear-gradient(var(--hud),var(--hud)),linear-gradient(var(--hud),var(--hud)),
  linear-gradient(var(--hud),var(--hud)),linear-gradient(var(--hud),var(--hud));
  background-size:14px 1px,1px 14px,14px 1px,1px 14px,14px 1px,1px 14px,14px 1px,1px 14px;
  background-position:0 0,0 0,100% 0,100% 0,0 100%,0 100%,100% 100%,100% 100%}
.panel.amber::after{--hud:rgba(255,181,71,.6)}
.panel.red::after{--hud:rgba(255,92,92,.6)}
.panel.plain::after{display:none}
.ph{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line)}
.pb{padding:18px}
.mono{font-family:var(--mono)}
.dim{color:var(--dim)}.mute{color:var(--mute)}
.holo{color:var(--holo)}.amber{color:var(--amber)}.red{color:var(--red)}.green{color:var(--green)}
.row{display:flex;align-items:center;gap:12px}
.col{display:flex;flex-direction:column;gap:12px}
.grow{flex:1 1 auto;min-width:0}

/* Buttons: outer (focus ring lives here), .b = chamfered border layer, .i = chamfered fill */
.btn{display:inline-flex;height:40px;vertical-align:middle;text-decoration:none;color:var(--text)}
.btn .b,.btn .i{clip-path:polygon(9px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 9px)}
.btn .b{display:flex;padding:1px;background:var(--line2);height:100%}
.btn .i{display:flex;align-items:center;gap:8px;padding:0 18px;background:var(--bg3);font-weight:600;font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
.btn .i svg{width:16px;height:16px}
.btn:hover .i{background:#233242}
.btn:focus-visible{outline:2px solid #fff;outline-offset:3px}
.btn.pri .b{background:var(--holo)}.btn.pri .i{background:var(--holo);color:var(--holo-ink)}
.btn.pri:hover .i{background:#8fe1ff}
.btn.warn .b{background:var(--amber)}.btn.warn .i{background:var(--amber);color:var(--amber-ink)}
.btn.danger .b{background:var(--red)}.btn.danger .i{background:var(--bg1);color:var(--red)}
.btn.ghost .b{background:transparent}.btn.ghost .i{background:transparent;color:var(--holo)}
.btn.sm{height:32px}.btn.sm .i{padding:0 12px;font-size:11.5px}
.btn.dis{opacity:.45;pointer-events:none}

/* Chips and status */
.chip{display:inline-flex;align-items:center;gap:7px;height:24px;padding:0 10px;border:1px solid var(--line2);font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);white-space:nowrap}
.chip .dot{width:7px;height:7px;border-radius:50%;background:var(--mute)}
.chip.ok{border-color:rgba(94,227,154,.5);color:var(--green)}.chip.ok .dot{background:var(--green);box-shadow:0 0 8px var(--green)}
.chip.live{border-color:rgba(95,211,255,.5);color:var(--holo)}.chip.live .dot{background:var(--holo);box-shadow:0 0 8px var(--holo)}
.chip.warn{border-color:rgba(255,181,71,.5);color:var(--amber)}.chip.warn .dot{background:var(--amber)}
.chip.err{border-color:rgba(255,92,92,.5);color:var(--red)}.chip.err .dot{background:var(--red)}
.chip svg{width:13px;height:13px}

/* Fields */
.field{display:flex;flex-direction:column;gap:6px}
.label{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
.input{display:flex;align-items:center;gap:10px;height:38px;padding:0 12px;background:#0b1016;border:1px solid var(--line2);font-family:var(--mono);font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden}
.input .caret{margin-left:auto;color:var(--mute);display:flex}
.input svg{width:16px;height:16px;flex:none}
.hint{font-size:12.5px;color:var(--mute)}

/* Segmented meter (targeting-computer style) */
.meter{display:grid;grid-template-columns:repeat(32,minmax(0,1fr));gap:3px;height:14px}
.meter i{display:block;background:#1b2836}
.meter i.f{background:var(--holo)}.meter i.w{background:var(--amber)}.meter i.x{background:var(--red)}

/* Blade preview */
.blade{height:12px;border-radius:0 6px 6px 0;background:linear-gradient(180deg,#fff 0%,#fff 35%,var(--c) 100%);box-shadow:0 0 6px var(--c),0 0 18px var(--c),0 0 40px var(--c)}
.blade.thin{height:6px;border-radius:0 3px 3px 0;box-shadow:0 0 4px var(--c),0 0 12px var(--c)}
.hilt{width:64px;height:20px;flex:none;display:block;position:relative;z-index:1}
.crystal{flex:none;filter:drop-shadow(0 0 3px var(--c)) drop-shadow(0 0 10px var(--c))}
.crystal.off{filter:none}
.lens{display:inline-block;flex:none;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff 0%,var(--c) 45%,color-mix(in srgb,var(--c) 60%,#000) 100%);box-shadow:0 0 6px var(--c),0 0 16px var(--c);border:1px solid rgba(255,255,255,.35)}
.lens.off{background:radial-gradient(circle at 40% 35%,#3b4c5e,#16202b);box-shadow:none;border-color:var(--line2)}
.spinner{display:inline-flex;flex:none;color:var(--mute)}
.spinner.on{color:var(--holo);filter:drop-shadow(0 0 6px rgba(95,211,255,.6))}
.spinner svg{width:100%;height:100%}
/* Blade cards in the hardware wizard */
.bcard{border:1px solid var(--line);background:#0d131a}
.bcard.open{border-color:var(--holo);box-shadow:inset 2px 0 0 var(--holo)}
.sum{display:flex;align-items:center;gap:14px;min-height:46px;padding:0 16px;width:100%}
.sum .g{width:22px;height:22px;display:flex;color:var(--holo);flex:none}
.sum .g svg{width:22px;height:22px}
.seg{display:inline-flex;border:1px solid var(--line2);background:#0b1016}
.seg span{display:flex;align-items:center;gap:8px;height:34px;padding:0 14px;font-size:12.5px;font-weight:600;color:var(--dim);border-right:1px solid var(--line2)}
.seg span:last-child{border-right:0}
.seg span svg{width:15px;height:15px}
.seg span.on{background:rgba(95,211,255,.14);color:#fff;box-shadow:inset 0 -2px 0 var(--holo)}
.opt{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:1px solid var(--line2);background:#0b1016;flex:1}
.opt.on{border-color:var(--holo);background:rgba(95,211,255,.06)}
.opt .radio{width:16px;height:16px;border:1px solid var(--line2);border-radius:50%;flex:none;margin-top:2px;position:relative}
.opt.on .radio{border-color:var(--holo)}
.opt.on .radio::after{content:"";position:absolute;inset:3px;border-radius:50%;background:var(--holo);box-shadow:0 0 6px var(--holo)}
.pin{display:flex;align-items:center;gap:10px;min-height:24px;font-size:12.5px}
.pin .k{font-family:var(--mono);font-size:11.5px;width:74px;color:var(--dim)}
.pin .v{color:var(--text)}
.pin .free{color:var(--mute)}

/* Lists and tables */
.list{display:flex;flex-direction:column}
.li{display:flex;align-items:center;gap:12px;min-height:44px;padding:0 14px;border-bottom:1px solid var(--line)}
.li:last-child{border-bottom:0}
.li.on{background:rgba(95,211,255,.08);box-shadow:inset 2px 0 0 var(--holo)}
.li .n{font-family:var(--mono);font-size:11px;color:var(--mute);width:22px}
.grip{color:var(--line2);width:12px;height:16px;flex:none}
table{border-collapse:collapse;width:100%}
th{text-align:left;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);font-weight:600;padding:10px 14px;border-bottom:1px solid var(--line)}
td{padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:middle;font-size:13.5px}
tr:last-child td{border-bottom:0}

/* Toggle and slider */
.tog{width:40px;height:22px;border:1px solid var(--line2);position:relative;background:#0b1016;flex:none}
.tog i{position:absolute;top:3px;left:3px;width:14px;height:14px;background:var(--mute)}
.tog.on{border-color:var(--holo)}.tog.on i{left:21px;background:var(--holo);box-shadow:0 0 8px var(--holo)}
.slider{position:relative;height:4px;background:#1b2836;flex:1}
.slider i{position:absolute;left:0;top:0;height:100%;background:var(--holo)}
.slider b{position:absolute;top:-7px;width:18px;height:18px;background:var(--bg0);border:2px solid var(--holo);transform:translateX(-9px)}

.kbd{font-family:var(--mono);font-size:11px;padding:1px 6px;border:1px solid var(--line2);background:#0b1016;color:var(--dim)}
.note{padding:12px 14px;background:rgba(95,211,255,.06);border:1px solid rgba(95,211,255,.25);font-size:13px;color:var(--dim);display:flex;gap:10px;align-items:flex-start}
.note svg{width:16px;height:16px;flex:none;color:var(--holo);margin-top:2px}
.note.amber{background:rgba(255,181,71,.07);border-color:rgba(255,181,71,.35)}.note.amber svg{color:var(--amber)}
.note.red{background:rgba(255,92,92,.07);border-color:rgba(255,92,92,.35)}.note.red svg{color:var(--red)}
.note.green{background:rgba(94,227,154,.07);border-color:rgba(94,227,154,.35)}.note.green svg{color:var(--green)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
`;

const I = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const icon = {
  mark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M10 22v-9h4v9z"/><path d="M12 13V2" stroke="#5fd3ff" stroke-width="2.2"/><path d="M9 16h6"/></svg>`,
  armory: I('<path d="M4 4h16v16H4z"/><path d="M9 7v10M15 7v10"/><path d="M7 12h4M13 12h4"/>'),
  presets: I('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  looks: I('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>'),
  fonts: I('<path d="M7 3h7l4 4v14H7z"/><path d="M10 13v5M13 11v7M16 14v4"/>'),
  build: I('<rect x="7" y="7" width="10" height="10"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>'),
  diag: I('<path d="M3 12h4l3-7 4 14 3-7h4"/>'),
  gear: I('<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>'),
  usb: I('<path d="M12 3v13"/><circle cx="12" cy="19" r="2.5"/><path d="M12 9l4-2v3M12 12l-4-2v3"/>'),
  battery: I('<rect x="3" y="8" width="16" height="8"/><path d="M21 11v2"/><path d="M6 11v2M9 11v2M12 11v2"/>'),
  check: I('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  x: I('<path d="M6 6l12 12M18 6L6 18"/>'),
  warn: I('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>'),
  info: I('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.5"/>'),
  play: I('<path d="M7 4l13 8-13 8z"/>'),
  chev: I('<path d="M9 6l6 6-6 6"/>'),
  down: I('<path d="M6 9l6 6 6-6"/>'),
  grip: `<svg viewBox="0 0 12 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.4"/><circle cx="9" cy="3" r="1.4"/><circle cx="3" cy="8" r="1.4"/><circle cx="9" cy="8" r="1.4"/><circle cx="3" cy="13" r="1.4"/><circle cx="9" cy="13" r="1.4"/></svg>`,
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  shield: I('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  import: I('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 20h16"/>'),
  eject: I('<path d="M5 15l7-8 7 8z"/><path d="M5 19h14"/>'),
  copy: I('<rect x="9" y="9" width="11" height="11"/><path d="M5 15V4h11"/>'),
  bolt: I('<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>'),
  clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  search: I('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>'),
  sd: I('<path d="M6 3h9l3 3v15H6z"/><path d="M9 3v4M12 3v4M15 3v4"/>'),
  lock: I('<rect x="5" y="11" width="14" height="10"/><path d="M8 11V7a4 4 0 018 0v4"/>'),
  undo: I('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>'),
  spin: I('<path d="M12 3a9 9 0 019 9" stroke-width="2.4"/><circle cx="12" cy="12" r="9" opacity=".25"/>'),
  // Blade roles
  blade: I('<path d="M10 22v-7h4v7z"/><path d="M12 15V2"/><path d="M9 18h6"/>'),
  crystal: I('<path d="M12 2l5 6v8l-5 6-5-6V8z"/><path d="M12 2v20"/><path d="M7 8l5 3 5-3"/>'),
  led: I('<circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>'),
  motor: I('<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5a7.5 7.5 0 017.5 7.5"/><path d="M17 8.5l2.5 3.5 3-3"/>'),
  side: I('<path d="M12 22V4"/><path d="M4 13h16"/><path d="M4 13v-3M20 13v-3"/><path d="M9 19h6"/>'),
  strip: I('<rect x="3" y="9" width="18" height="6"/><path d="M7 9v6M11 9v6M15 9v6"/>'),
  link: I('<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>'),
  minus: I('<path d="M5 12h14"/>'),
};

/** Placeholder hilt, drawn left to right: pommel, grip, control box with switch, emitter. The blade starts flush at x = 64.
 *  Pass a crystal colour to open a chamber window in the grip with a small glowing crystal inside. */
export function hilt(crystalColor) {
  const window = crystalColor
    ? `<rect x="11" y="5" width="20" height="10" fill="#070a0e"/>
  <polygon points="13,10 16,7 26,7 29,10 26,13 16,13" fill="${crystalColor}" opacity=".55" filter="url(#hilt-glow)"/>
  <polygon points="13,10 16,7 26,7 29,10 26,13 16,13" fill="${crystalColor}"/>
  <polygon points="16,7 26,7 21,10" fill="#fff" opacity=".55"/>
  <polygon points="13,10 16,13 26,13 29,10" fill="#000" opacity=".2"/>
  <rect x="11" y="5" width="20" height="10" fill="none" stroke="#8b99a8" stroke-width=".6"/>`
    : `<path d="M12 3v14M16 3v14M20 3v14M24 3v14M28 3v14" stroke="#0b1016" stroke-width="1.4"/>`;
  return `<svg class="hilt" viewBox="0 0 64 20" aria-hidden="true">
  <defs>
    <linearGradient id="hilt-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c8a99"/><stop offset=".45" stop-color="#3d4956"/><stop offset="1" stop-color="#171e26"/></linearGradient>
    <linearGradient id="hilt-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4552"/><stop offset="1" stop-color="#0f151b"/></linearGradient>
    <filter id="hilt-glow" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="2"/></filter>
  </defs>
  <rect x="0" y="5" width="5" height="10" fill="url(#hilt-metal)" stroke="#8b99a8" stroke-width=".6"/>
  <rect x="5" y="4" width="3" height="12" fill="url(#hilt-dark)"/>
  <rect x="8" y="3" width="24" height="14" fill="url(#hilt-metal)" stroke="#8b99a8" stroke-width=".6"/>
  ${window}
  <rect x="32" y="2" width="14" height="16" fill="url(#hilt-metal)" stroke="#8b99a8" stroke-width=".6"/>
  <rect x="35" y="0" width="7" height="3" fill="#0b1016"/>
  <rect x="36" y=".6" width="5" height="1.8" fill="#5fd3ff"/>
  <rect x="46" y="4" width="4" height="12" fill="url(#hilt-dark)"/>
  <path d="M50 1h8l6 3v12l-6 3h-8z" fill="url(#hilt-metal)" stroke="#8b99a8" stroke-width=".6"/>
  <path d="M55 1v18" stroke="#0b1016" stroke-width="1.2"/>
  <rect x="62" y="5" width="2" height="10" fill="#0b1016"/>
</svg>`;
}

/** Faceted crystal, glowing in its colour. h is the rendered height in px; lit=false draws it dark. */
export function crystal(c, h = 40, lit = true) {
  const id = `cg-${c.replace('#', '')}${lit ? '' : '-off'}`;
  const w = Math.round(h * 0.6);
  const body = lit
    ? `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity=".75"/></linearGradient>`
    : `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b4c5e"/><stop offset="1" stop-color="#16202b"/></linearGradient>`;
  return `<svg class="crystal${lit ? '' : ' off'}" viewBox="0 0 24 40" width="${w}" height="${h}" style="--c:${c}" aria-hidden="true">
  <defs>${body}</defs>
  <polygon points="12,1 20,10 20,30 12,39 4,30 4,10" fill="url(#${id})"/>
  <polygon points="12,1 12,39 4,30 4,10" fill="#fff" opacity="${lit ? '.28' : '.06'}"/>
  <polygon points="12,1 20,10 12,14" fill="#fff" opacity="${lit ? '.5' : '.1'}"/>
  <polygon points="12,39 20,30 12,26" fill="#000" opacity=".2"/>
  <polygon points="12,1 20,10 20,30 12,39 4,30 4,10" fill="none" stroke="#fff" stroke-opacity="${lit ? '.6' : '.15'}" stroke-width=".8"/>
</svg>`;
}

/** Single non-pixel LED lens. */
export function lens(c, d = 22, lit = true) {
  return `<span class="lens${lit ? '' : ' off'}" style="--c:${c};width:${d}px;height:${d}px" aria-hidden="true"></span>`;
}

/** Motor spinner glyph (crystal-chamber spinner). */
export function spinner(d = 34, on = true) {
  return `<span class="spinner${on ? ' on' : ''}" style="width:${d}px;height:${d}px" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7.5" opacity=".35"/><path d="M12 4.5a7.5 7.5 0 017.5 7.5"/><path d="M17 8.5l2.5 3.5 3-3"/></svg></span>`;
}

const NAV = [
  ['armory', 'Armory', 'armory'],
  ['presets', 'Presets', 'presets', 'live'],
  ['looks', 'Looks', 'looks'],
  ['fonts', 'Fonts & SD', 'fonts'],
  ['build', 'Build & Install', 'build', 'build'],
  ['diag', 'Diagnostics', 'diag'],
];

export function btn(label, cls = '', ic = '') {
  return `<a href="#" class="btn ${cls}"><span class="b"><span class="i">${ic}${label}</span></span></a>`;
}

export function chip(label, cls = '', ic = '') {
  return `<span class="chip ${cls}">${ic || '<span class="dot"></span>'}${label}</span>`;
}

/** Segmented meter: n segments of 32 filled, zone colours by percentage. */
export function meter(pct) {
  const filled = Math.round((pct / 100) * 32);
  let s = '';
  for (let k = 0; k < 32; k++) {
    const p = ((k + 1) / 32) * 100;
    const cls = k < filled ? (p > 90 ? 'x' : p > 70 ? 'w' : 'f') : '';
    s += `<i class="${cls}"></i>`;
  }
  return `<div class="meter" role="img" aria-label="${pct} percent used">${s}</div>`;
}

export function shell({ title, active, body, status, topRight, saber = 'Graflex Mk II', board = 'Proffieboard V2.2', conn }) {
  const nav = NAV.map(([id, label, ic, tier]) =>
    `<a href="#" class="${id === active ? 'on' : ''}"${id === active ? ' aria-current="page"' : ''}>${icon[ic]}<span>${label}</span>${tier ? `<span class="tier">${tier}</span>` : ''}</a>`
  ).join('\n      ');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <title>${title}</title>
  <link rel="stylesheet" href="${FONTS}">
  <style>${CSS}</style>
</helmet>
<div class="app">
  <aside class="side" aria-label="Primary">
    <div class="brand">${icon.mark}<span>HILTWRIGHT</span></div>
    <nav class="nav" aria-label="Sections">
      <div class="sec">Saber</div>
      ${nav}
      <div class="sec">App</div>
      <a href="#">${icon.gear}<span>Settings</span></a>
    </nav>
    <div style="margin-top:auto;padding:16px 20px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:6px">
      <div class="eyebrow" style="opacity:.6">Toolchain</div>
      <div class="mono" style="font-size:11.5px;color:var(--dim)">ProffieOS 8.10 · core 4.6</div>
      <div class="mono" style="font-size:11.5px;color:var(--mute)">GCC 14.2 ready · 1.6 GB</div>
    </div>
  </aside>
  <header class="top">
    <div class="row" style="gap:14px">
      <button class="input" style="height:36px;min-width:280px;font-family:'Exo 2',sans-serif;font-weight:600;font-size:13.5px" aria-haspopup="listbox" aria-label="Active saber">
        ${icon.mark}<span>${saber}</span><span class="mute" style="font-weight:400">· ${board}</span><span class="caret">${icon.down}</span>
      </button>
      ${topRight ?? ''}
    </div>
    <div class="row" style="gap:12px">
      ${conn ?? `${chip('Connected · COM7', 'live')}
      ${chip('3.92 V · 78%', '', icon.battery)}
      ${btn('Back up', 'sm', icon.shield)}`}
    </div>
  </header>
  <main class="main">
${body}
  </main>
  <footer class="status" aria-label="Board status">
    ${status ?? '<span><b>Board</b> Proffieboard V2.2 · 256 KB</span><span><b>Firmware</b> ProffieOS 8.10 · hiltwright_graflex.h · built 7 Sep 2026</span><span><b>presets.ini</b> in sync</span><span style="margin-left:auto"><b>Backup</b> 12 min ago</span>'}
  </footer>
</div>
</x-dc>
</body>
</html>
`;
}

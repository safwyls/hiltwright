export default ({ FONTS, CSS, icon, btn, chip, meter, hilt, crystal, lens, spinner }) => {
  const sw = (name, hex, ratio, note) => `
    <div class="col" style="gap:8px">
      <div style="height:56px;background:${hex};border:1px solid var(--line2)"></div>
      <div class="col" style="gap:1px"><b style="font-weight:600;font-size:13px">${name}</b><span class="mono dim" style="font-size:12px">${hex}</span><span class="hint">${ratio}${note ? ' · ' + note : ''}</span></div>
    </div>`;

  const sec = (eyebrow, title, inner, extra = '') => `
    <section class="col" style="gap:16px;${extra}">
      <div class="col" style="gap:2px"><div class="eyebrow">${eyebrow}</div><h2 style="font-size:14px;letter-spacing:.1em">${title}</h2></div>
      ${inner}
    </section>`;

  const a11y = (t, d) => `<div class="row" style="gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--line)"><span style="color:var(--green);display:flex;width:16px;margin-top:2px;flex:none">${icon.check}</span><span class="col" style="gap:1px"><b style="font-weight:600;font-size:13.5px">${t}</b><span class="hint">${d}</span></span></div>`;
  const key = (t, d) => `<div class="col" style="gap:4px;padding:14px;border:1px solid var(--line);background:#0d131a"><b style="font-weight:600;font-size:13.5px">${t}</b><span class="hint" style="text-wrap:pretty">${d}</span></div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <title>Hiltwright · Design system</title>
  <link rel="stylesheet" href="${FONTS}">
  <style>${CSS}
  .sheet{width:1440px;min-height:2800px;background:var(--bg0);padding:40px 48px;display:flex;flex-direction:column;gap:40px}
  .grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:40px}
  .grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
  .type{display:flex;align-items:baseline;gap:20px;padding:10px 0;border-bottom:1px solid var(--line)}
  .type .m{font-family:var(--mono);font-size:11px;color:var(--mute);width:220px;flex:none}
  </style>
</helmet>
<div class="sheet">
  <div class="row" style="justify-content:space-between;align-items:flex-end;border-bottom:1px solid var(--line);padding-bottom:20px">
    <div><div class="eyebrow">Design system</div><h1 style="font-size:26px">Hiltwright console</h1><p class="lead" style="margin-top:8px">A used-future workbench: dark cool surfaces, hologram-blue interaction, amber for anything that writes firmware. The user's blade colours are the only other saturated thing on screen.</p></div>
    <div class="row" style="gap:10px">${chip('Dark only · v0.1')}${chip('WCAG AA · all text', 'ok', icon.check)}</div>
  </div>

  <div class="grid2">
    ${sec('01', 'Colour', `
      <div class="grid3" style="gap:16px">
        ${sw('Canvas', '#0a0e13', 'Window background')}
        ${sw('Panel', '#101720', 'Cards, lists, editors')}
        ${sw('Raised', '#1c2833', 'Secondary button fill')}
        ${sw('Text', '#e6edf3', '15.2 : 1 on panel')}
        ${sw('Dim', '#a3b3c2', '8.4 : 1', 'body copy, hints')}
        ${sw('Mute', '#7a8b9b', '5.1 : 1', 'labels, timestamps')}
        ${sw('Holo', '#5fd3ff', '10.5 : 1', 'interactive, live')}
        ${sw('Amber', '#ffb547', '10.2 : 1', 'writes firmware, caution')}
        ${sw('Red', '#ff5c5c', '6.0 : 1', 'blocked, error')}
        ${sw('Green', '#5ee39a', '11.1 : 1', 'verified, backed up')}
        ${sw('Holo ink', '#062533', '9.3 : 1 on Holo', 'primary button text')}
        ${sw('Amber ink', '#2b1a00', '9.6 : 1 on Amber', 'install button text')}
      </div>
      <p class="hint" style="max-width:560px;text-wrap:pretty">Accents share one lightness band so none shouts over another. Status is never colour alone: every chip carries an icon or a word.</p>`)}

    ${sec('02', 'Type', `
      <div class="col" style="gap:0">
        <div class="type"><span class="m">Michroma · eyebrow · 10 / .24em</span><span class="eyebrow">Armory · sector readout</span></div>
        <div class="type"><span class="m">Michroma · h1 · 22</span><h1 style="margin:0">Your sabers</h1></div>
        <div class="type"><span class="m">Michroma · h2 · 11.5 / .14em</span><h2>Flash budget</h2></div>
        <div class="type"><span class="m">Exo 2 · h3 · 15 / 600</span><h3>Graflex Mk II is connected</h3></div>
        <div class="type"><span class="m">Exo 2 · body · 14 / 1.45</span><span>Every saber keeps its own wiring, presets and backups.</span></div>
        <div class="type"><span class="m">Exo 2 · hint · 12.5</span><span class="hint">Nothing is written until you press Install.</span></div>
        <div class="type"><span class="m">JetBrains Mono · readout · 12–30</span><span class="mono" style="font-size:22px">214.8 <span style="font-size:13px;color:var(--dim)">of 256 KB</span></span></div>
      </div>
      <p class="hint" style="max-width:560px;text-wrap:pretty">Michroma is wide and quiet: used only for short labels of three words or fewer, always tracked. Body copy is never all-caps. Numbers, file names, pins and commands are always mono so they read as data.</p>`)}
  </div>

  <div class="grid2">
    ${sec('03', 'Buttons', `
      <div class="row" style="gap:14px;flex-wrap:wrap">
        ${btn('Install firmware', 'pri', icon.bolt)}${btn('Back up', '', icon.shield)}${btn('Install driver', 'warn', icon.lock)}${btn('Restore backup', 'danger', icon.undo)}${btn('Show output', 'ghost')}${btn('Installing…', 'pri dis', icon.bolt)}
      </div>
      <div class="row" style="gap:14px;flex-wrap:wrap;align-items:center">
        <a href="#" class="btn pri" style="outline:2px solid #fff;outline-offset:3px"><span class="b"><span class="i">${icon.bolt}Focused</span></span></a>
        ${btn('Small', 'sm')}${btn('Small primary', 'sm pri', icon.plus)}
        <span class="hint">Chamfered corners cut top-left and bottom-right. Focus ring is 2 px white at 3 px offset, on every interactive element, never removed.</span>
      </div>
      <div class="row" style="gap:10px;flex-wrap:wrap">
        ${chip('Connected · COM7', 'live')}${chip('Ready', 'ok', icon.check)}${chip('Needs build', 'warn')}${chip('Blocked', 'err', icon.x)}${chip('Idle')}${chip('3.92 V · 78%', '', icon.battery)}
      </div>`)}

    ${sec('04', 'Fields and controls', `
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px">
        <label class="field"><span class="label">Name</span><span class="input" style="font-family:'Exo 2',sans-serif">Duality</span></label>
        <label class="field"><span class="label">Sound font</span><span class="input" style="font-family:'Exo 2',sans-serif">${icon.fonts}KyberPhonics Osha<span class="caret">${icon.down}</span></span></label>
        <label class="field"><span class="label">Data pin</span><span class="input">bladePin<span class="caret">${icon.down}</span></span></label>
        <div class="field"><div class="row" style="justify-content:space-between"><span class="label">Ignition</span><span class="mono" style="font-size:12px;color:var(--dim)">300 ms</span></div><div class="row" style="height:24px"><div class="slider"><i style="width:30%"></i><b style="left:30%"></b></div></div></div>
      </div>
      <div class="row" style="gap:28px">
        <label class="row" style="gap:10px;font-size:13px;color:var(--dim)"><span class="tog on"><i></i></span>Mirror on saber</label>
        <label class="row" style="gap:10px;font-size:13px;color:var(--dim)"><span class="tog"><i></i></span>Blade ID</label>
        <button class="row" style="gap:12px;height:44px;padding:0 10px;border:1px solid var(--line);background:#0b1016;width:300px"><span style="width:22px;height:22px;background:#3d7bff;box-shadow:0 0 10px #3d7bff"></span><span class="grow" style="font-size:13px">Base colour</span><span class="mono" style="font-size:12px;color:var(--dim)">#3d7bff</span></button>
      </div>
      <p class="hint" style="max-width:560px;text-wrap:pretty">Controls are 38–44 px tall. Labels sit above fields, never as placeholder-only. Colour rows expose the argument number so what the user sees maps to what presets.ini stores.</p>`)}
  </div>

  <div class="grid2">
    ${sec('05', 'Readouts', `
      <div class="col" style="gap:14px">
        <div class="col" style="gap:6px"><div class="row" style="justify-content:space-between"><span class="label">Flash · V3 · comfortable</span><span class="mono dim" style="font-size:12px">45%</span></div>${meter(45)}</div>
        <div class="col" style="gap:6px"><div class="row" style="justify-content:space-between"><span class="label">Flash · V2 · caution above 70%</span><span class="mono dim" style="font-size:12px">82%</span></div>${meter(82)}</div>
        <div class="col" style="gap:6px"><div class="row" style="justify-content:space-between"><span class="label">Flash · V2 · will not fit above 90%</span><span class="mono dim" style="font-size:12px">94%</span></div>${meter(94)}</div>
      </div>
      <div class="col" style="gap:10px;padding-top:6px">
        <div class="row" style="gap:0">${hilt()}<div class="blade grow" style="--c:#3d7bff"></div></div>
        <div class="row" style="gap:0">${hilt()}<div class="blade grow" style="--c:#3dffb0"></div></div>
        <div class="row" style="gap:0;padding-left:64px"><div class="blade thin" style="--c:#ff3d3d;width:30%"></div></div>
      </div>
      <p class="hint" style="max-width:560px;text-wrap:pretty">The segmented meter reads at a glance like a targeting readout, and the three zones are also spelled out in the label. Blade previews are a white core with a coloured bloom, drawn from the real argument values.</p>`)}

    ${sec('06', 'Messages', `
      <div class="col" style="gap:10px">
        <div class="note">${icon.info}<span>Everything on this page is saved straight to the saber. A snapshot is kept before each change, so Undo always works.</span></div>
        <div class="note green">${icon.check}<span>Firmware verified. The saber reports ProffieOS 8.10, hiltwright_graflex.h, built 12:08.</span></div>
        <div class="note amber">${icon.warn}<span>Adding Corruption brings you to 86% of flash. Presets that reuse a look are free.</span></div>
        <div class="note red">${icon.x}<span><b style="font-weight:600">Preset 4 needs a second look.</b> This saber has two blades. Add a look for the crystal chamber or set it to Off.</span><a href="#" style="margin-left:auto;white-space:nowrap;font-weight:600">Fix</a></div>
      </div>
      <p class="hint" style="max-width:560px;text-wrap:pretty">Errors name the preset or setting, say what is wrong in one sentence, and carry the fix as an action. Compiler text is one click away, never the first thing shown.</p>`)}
  </div>

  <div class="grid2">
    ${sec('09', 'Blades, crystals and motors', `
      <div class="row" style="gap:28px;align-items:flex-end;flex-wrap:wrap">
        ${crystal('#3d7bff', 64)}${crystal('#ff3d3d', 48)}${crystal('#3dffb0', 40)}${crystal('#b26bff', 28)}${crystal('#3d7bff', 40, false)}
        <span class="hint" style="max-width:250px;text-wrap:pretty">The crystal is its own element: a faceted gem with a white core and a bloom in its colour. Dark when the saber is off.</span>
      </div>
      <div class="row" style="gap:0;padding:4px 0">${hilt('#ff3d3d')}<div class="blade grow" style="--c:#3d7bff"></div></div>
      <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px">
        <div class="col" style="align-items:center;gap:8px;padding:12px 8px;border:1px solid var(--line);background:#0d131a"><span style="height:44px;display:flex;align-items:center"><span class="blade" style="--c:#3d7bff;width:36px;height:8px;border-radius:0 4px 4px 0"></span></span><b style="font-size:12.5px;font-weight:600">Main blade</b><span class="hint" style="font-size:11px;text-align:center">pixel strip</span></div>
        <div class="col" style="align-items:center;gap:8px;padding:12px 8px;border:1px solid var(--line);background:#0d131a"><span style="height:44px;display:flex;align-items:center">${crystal('#ff3d3d', 40)}</span><b style="font-size:12.5px;font-weight:600">Crystal chamber</b><span class="hint" style="font-size:11px;text-align:center">pixels or LED</span></div>
        <div class="col" style="align-items:center;gap:8px;padding:12px 8px;border:1px solid var(--line);background:#0d131a"><span style="height:44px;display:flex;align-items:center">${lens('#ffffff', 20)}</span><b style="font-size:12.5px;font-weight:600">Accent</b><span class="hint" style="font-size:11px;text-align:center">single or star LED</span></div>
        <div class="col" style="align-items:center;gap:8px;padding:12px 8px;border:1px solid var(--line);background:#0d131a"><span style="height:44px;display:flex;align-items:center;gap:3px"><span class="blade thin" style="--c:#ff7a2a;width:18px;border-radius:3px 0 0 3px"></span><span class="blade" style="--c:#ff2a2a;width:8px;height:22px;border-radius:0"></span><span class="blade thin" style="--c:#ff7a2a;width:18px"></span></span><b style="font-size:12.5px;font-weight:600">Side blade</b><span class="hint" style="font-size:11px;text-align:center">pixel strip</span></div>
        <div class="col" style="align-items:center;gap:8px;padding:12px 8px;border:1px solid var(--line);background:#0d131a"><span style="height:44px;display:flex;align-items:center">${spinner(34)}</span><b style="font-size:12.5px;font-weight:600">Motor</b><span class="hint" style="font-size:11px;text-align:center">chamber spinner</span></div>
      </div>
      <p class="hint" style="max-width:600px;text-wrap:pretty">A blade is anything the saber controls separately, which is ProffieOS's own model. Its role picks the glyph and the default look; its type picks the wiring questions. Wiring is a choice of "own data line" or "continues Blade N's wire", and the app computes the pixel ranges.</p>`)}

    ${sec('10', 'Blade card', `
      <div class="col" style="gap:8px">
        <div class="bcard sum" style="border:1px solid var(--line)"><span class="mono mute" style="font-size:11px;width:16px">1</span><span class="g">${icon.blade}</span><span style="font-weight:600;font-size:13.5px;width:150px;flex:none">Main blade</span><span class="dim grow" style="font-size:13px">132 px pixel strip · own data line on bladePin · power LED 2 + 3</span><span style="color:var(--green);display:flex;width:16px">${icon.check}</span><span class="mute" style="display:flex;width:16px">${icon.down}</span></div>
        <div class="bcard sum open" style="border:1px solid var(--holo)"><span class="mono mute" style="font-size:11px;width:16px">2</span><span class="g">${icon.crystal}</span><span style="font-weight:600;font-size:13.5px;width:150px;flex:none">Crystal chamber</span><span class="hint grow">6 px pixel strip · continues Blade 1's wire</span><span class="mute" style="display:flex;width:16px">${icon.down}</span></div>
        <div class="bcard sum" style="border:1px solid var(--amber)"><span class="mono mute" style="font-size:11px;width:16px">3</span><span class="g" style="color:var(--amber)">${icon.led}</span><span style="font-weight:600;font-size:13.5px;width:150px;flex:none">Accent</span><span class="dim grow" style="font-size:13px">Needs a power pin</span><span style="color:var(--amber);display:flex;width:16px">${icon.warn}</span><span class="mute" style="display:flex;width:16px">${icon.down}</span></div>
      </div>
      <div class="col" style="gap:6px">
        <span class="label">Role and type, as segmented controls</span>
        <div class="seg"><span>${icon.blade}Main blade</span><span class="on">${icon.crystal}Crystal chamber</span><span>${icon.led}Accent</span><span>${icon.side}Side blade</span><span>${icon.motor}Motor</span></div>
      </div>
      <div class="row" style="gap:12px;align-items:stretch">
        <div class="opt"><span class="radio"></span><span class="col" style="gap:2px"><b style="font-weight:600;font-size:13px">Own data line</b><span class="hint">Its own wire and power pins.</span></span></div>
        <div class="opt on"><span class="radio"></span><span class="col" style="gap:2px"><b style="font-weight:600;font-size:13px">Continues Blade 1's wire</b><span class="hint">Pixels <span class="mono">132–137</span>, shares power.</span></span></div>
      </div>
      <p class="hint" style="max-width:560px;text-wrap:pretty">Cards collapse to one line once complete, so a four-blade saber reads as four lines plus the one being edited. Amber marks a card that still needs an answer. The pin table beside the cards is the budget: it shows what each data line and power pin drives, and flags conflicts before a build.</p>`)}
  </div>

  <div class="grid2">
    ${sec('07', 'In-universe keys', `
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
        ${key('Used-future surfaces', 'Cool charcoal panels with seams and a 2% scanline wash. Nothing glossy, nothing gradient-heavy.')}
        ${key('HUD brackets', 'Every panel wears thin corner ticks. Amber or red ticks mark panels about caution or failure.')}
        ${key('Chamfered controls', 'Buttons cut two opposite corners, like console keys. Chips and fields stay square.')}
        ${key('Segmented telemetry', 'Meters and progress read as segments and mono digits, the way a cockpit readout would.')}
        ${key('Hologram accent', 'One blue with a soft bloom marks what is live: the connection, the selected row, the focused control.')}
        ${key('Sector eyebrows', 'Wide tracked labels above each heading name the place you are in. Headings themselves stay plain English.')}
      </div>
      <p class="hint" style="max-width:600px;text-wrap:pretty">The feeling comes from these six moves, not from franchise assets: no logos, insignia, in-universe alphabets or character names anywhere in the product. Navigation labels stay functional (Presets, Looks, Fonts) so a CFX or Xenopixel owner never has to decode the app.</p>`)}

    ${sec('08', 'Accessibility', `
      <div class="col" style="gap:0">
        ${a11y('Contrast', 'All text 4.5 : 1 or better on its surface (see 01). Large mono readouts 3 : 1 minimum.')}
        ${a11y('Focus', '2 px white ring, 3 px offset, on every interactive element. Never hidden. Roving tabindex in lists.')}
        ${a11y('Targets', 'Primary actions 40 px, list rows and colour rows 44 px, icon buttons 32 px with 8 px spacing.')}
        ${a11y('Not colour alone', 'Every status chip and note has an icon and a word. Flash meter zones are also written in the label.')}
        ${a11y('Keyboard reorder', 'Alt + arrow keys move presets; screen readers hear “Duality moved to position 3 of 5”.')}
        ${a11y('Live regions', 'Build progress and “saved to saber” confirmations announce politely. Errors announce assertively.')}
        ${a11y('Reduced motion', 'Blade bloom pulses, spinner and holo glow animations stop under prefers-reduced-motion. Progress still updates.')}
        ${a11y('Plain language', 'No compiler, FQBN, DFU or define vocabulary in primary copy. Technical detail sits behind “Show output”.')}
      </div>`)}
  </div>
</div>
</x-dc>
</body>
</html>
`;
};

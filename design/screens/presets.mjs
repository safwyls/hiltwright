export default ({ shell, icon, btn, chip, hilt, crystal, lens, spinner }) => {
  const item = (n, name, font, c, on = false) => `
    <div class="li ${on ? 'on' : ''}" role="option" aria-selected="${on}" tabindex="0" style="cursor:grab">
      <span class="grip">${icon.grip}</span>
      <span class="n">${n}</span>
      <span class="col grow" style="gap:0"><span style="font-weight:600;font-size:13.5px">${name}</span><span class="hint">${font}</span></span>
      <span style="width:10px;height:10px;border-radius:50%;background:${c};box-shadow:0 0 8px ${c};flex:none"></span>
    </div>`;

  const swatch = (label, hex, arg) => `
    <button class="row" style="gap:10px;height:40px;padding:0 10px;border:1px solid var(--line);background:#0b1016;width:100%" aria-label="${label}: ${hex}. Change colour">
      <span style="width:20px;height:20px;background:${hex};box-shadow:0 0 10px ${hex};flex:none"></span>
      <span class="grow" style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</span>
      <span class="mono mute" style="font-size:11px;white-space:nowrap">${arg}</span>
    </button>`;

  const linked = (label, hex, to) => `
    <button class="row" style="gap:10px;height:40px;padding:0 10px;border:1px dashed var(--line2);background:#0b1016;width:100%" aria-label="${label} follows ${to}. Unlink to choose its own colour">
      <span style="width:20px;height:20px;background:${hex};box-shadow:0 0 10px ${hex};flex:none;opacity:.8"></span>
      <span class="grow" style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</span>
      <span class="row holo" style="gap:4px;font-size:11px;font-weight:600"><span style="display:flex;width:13px">${icon.link}</span>${to}</span>
    </button>`;

  // One row per blade: glyph, name, look picker curated by role.
  const lookRow = (n, glyph, name, meta, look, tag) => `
    <div class="row" style="gap:12px;min-height:40px;padding:0 0 0 2px">
      <span class="mono mute" style="font-size:11px;width:12px">${n}</span>
      <span style="width:26px;display:flex;justify-content:center;flex:none">${glyph}</span>
      <span class="col" style="gap:0;width:132px;flex:none"><span style="font-size:13px;font-weight:600">${name}</span><span class="hint" style="font-size:11.5px">${meta}</span></span>
      <span class="input grow" style="height:34px;font-family:'Exo 2',sans-serif">${look}${tag ? `<span class="mono mute" style="font-size:11px">${tag}</span>` : ''}<span class="caret">${icon.down}</span></span>
    </div>`;

  const sliderField = (label, val, pct) => `
    <div class="field">
      <div class="row" style="justify-content:space-between"><span class="label">${label}</span><span class="mono" style="font-size:12px;color:var(--dim)">${val}</span></div>
      <div class="row" style="height:24px"><div class="slider" role="slider" aria-label="${label}" aria-valuetext="${val}" tabindex="0"><i style="width:${pct}%"></i><b style="left:${pct}%"></b></div></div>
    </div>`;

  const fx = (label) => `<a href="#" class="btn sm"><span class="b" style="width:100%"><span class="i" style="justify-content:center;width:100%;padding:0 6px">${label}</span></span></a>`;

  const body = `
    <div class="row" style="justify-content:space-between;align-items:flex-end">
      <div>
        <div class="eyebrow">Presets · live on the saber</div>
        <h1>Graflex Mk II</h1>
      </div>
      <div class="row">
        ${chip('Saved to saber 2 s ago', 'ok', icon.check)}
        ${btn('Undo', 'sm', icon.undo)}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:250px minmax(0,1fr) 300px;gap:20px;flex:1;min-height:0">

      <section class="panel" style="display:flex;flex-direction:column;min-height:0" aria-label="Preset list">
        <div class="ph"><h2>Presets · 5</h2>${btn('Add', 'sm', icon.plus)}</div>
        <div class="list" role="listbox" aria-label="Presets, drag or use arrow keys to reorder">
          ${item(1, 'Sentinel', 'Greyscale Sentinel', '#3dffb0')}
          ${item(2, 'Duality', 'KyberPhonics Osha', '#3d7bff', true)}
          ${item(3, 'Corrupted', 'KyberPhonics Osha', '#ff3d3d')}
          ${item(4, 'Crystal focus', 'TeensySF', '#b26bff')}
          ${item(5, 'Training', 'TeensySF', '#ffd23d')}
        </div>
        <div style="margin-top:auto;padding:14px 18px;border-top:1px solid var(--line)" class="hint">Order is saved to the saber as you drag. Press <span class="kbd">Alt</span> + <span class="kbd">↑</span> <span class="kbd">↓</span> to reorder with the keyboard.</div>
      </section>

      <section class="panel" style="display:flex;flex-direction:column;min-height:0" aria-label="Preset editor">
        <div class="ph">
          <div class="row"><h2>Duality</h2>${chip('Reuses compiled looks · no build needed', 'ok', icon.check)}</div>
          ${btn('Duplicate', 'sm ghost', icon.copy)}
        </div>
        <div class="pb col" style="gap:16px;overflow:hidden">
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
            <label class="field"><span class="label">Name</span><span class="input" style="font-family:'Exo 2',sans-serif">Duality</span></label>
            <label class="field"><span class="label">Sound font</span><span class="input" style="font-family:'Exo 2',sans-serif">${icon.fonts}KyberPhonics Osha<span class="mute">+ common</span><span class="caret">${icon.down}</span></span></label>
            <label class="field"><span class="label">Track</span><span class="input">tracks/duality.wav<span class="caret">${icon.down}</span></span></label>
            <label class="field"><span class="label">Variation</span><span class="input">23299<span class="caret">${icon.down}</span></span></label>
          </div>

          <div class="col" style="gap:6px">
            <div class="row" style="justify-content:space-between"><h2 style="font-size:10.5px;color:var(--dim);white-space:nowrap">Look per blade</h2><span class="hint">Small blades usually follow the main one.</span></div>
            ${lookRow(1, '<span class="blade" style="--c:#3d7bff;width:22px;height:6px;border-radius:0 3px 3px 0"></span>', 'Main blade', '132 px', `${icon.looks}Duality`, 'builtin 1 1')}
            ${lookRow(2, crystal('#3d7bff', 22), 'Crystal chamber', '6 px', `${icon.link}Follow main blade`, 'builtin 1 2')}
            ${lookRow(3, lens('#ffffff', 14), 'Accent', 'white LED', 'Pulse on clash and lockup', 'builtin 1 3')}
            ${lookRow(4, spinner(20), 'Motor', 'spinner', 'Spin while ignited', 'builtin 1 4')}
          </div>

          <div class="col" style="gap:8px">
            <div class="row" style="justify-content:space-between"><h2 style="font-size:10.5px;color:var(--dim)">Colours</h2><span class="hint">Exposed by these looks. Click to change.</span></div>
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
              ${swatch('Base colour', '#3d7bff', 'arg 1')}
              ${swatch('Second phase', '#ff3d3d', 'arg 2')}
              ${swatch('Clash flash', '#ffffff', 'arg 4')}
              ${swatch('Lockup', '#ffb547', 'arg 5')}
              ${swatch('Blast', '#ffffff', 'arg 8')}
              ${linked('Crystal', '#3d7bff', 'Base')}
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px">
            ${sliderField('Ignition', '300 ms', 30)}
            ${sliderField('Retraction', '500 ms', 50)}
            <label class="field"><span class="label">Swing sound</span><span class="input" style="font-family:'Exo 2',sans-serif">Smooth swing<span class="caret">${icon.down}</span></span></label>
          </div>
        </div>
      </section>

      <section class="panel" style="display:flex;flex-direction:column;min-height:0" aria-label="Live preview">
        <div class="ph"><h2>Live preview</h2><label class="row" style="gap:8px;font-size:12px;color:var(--dim)">Mirror on saber<span class="tog on" role="switch" aria-checked="true" tabindex="0"><i></i></span></label></div>
        <div class="pb col" style="gap:16px">
          <div class="row" style="gap:0;padding:10px 0 2px">${hilt('#3d7bff')}<div class="blade grow" style="--c:#3d7bff"></div></div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
            <div class="col" style="align-items:center;gap:8px;padding:12px 6px;border:1px solid var(--line);background:#0b1016">
              <div style="position:relative;display:flex;align-items:center;justify-content:center;width:44px;height:44px">${crystal('#3d7bff', 40)}<span class="spinner on" style="position:absolute;inset:-4px;width:52px;height:52px;opacity:.7">${spinner(52).replace(/^<span[^>]*>|<\/span>$/g, '')}</span></div>
              <span class="hint" style="font-size:11px;text-align:center">Crystal · spinning</span>
            </div>
            <div class="col" style="align-items:center;gap:8px;padding:12px 6px;border:1px solid var(--line);background:#0b1016">
              <div style="display:flex;align-items:center;justify-content:center;width:44px;height:44px">${lens('#ffffff', 18)}</div>
              <span class="hint" style="font-size:11px;text-align:center">Accent · idle</span>
            </div>
            <div class="col" style="align-items:center;gap:8px;padding:12px 6px;border:1px solid var(--line);background:#0b1016">
              <div style="display:flex;align-items:center;justify-content:center;width:44px;height:44px"><span class="mono" style="font-size:16px;color:var(--holo)">3.92</span></div>
              <span class="hint" style="font-size:11px;text-align:center">Battery · 78%</span>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
            ${fx('Ignite')}${fx('Clash')}${fx('Blast')}${fx('Lockup')}${fx('Force')}${fx('Retract')}
          </div>
          <div class="field">
            <div class="row" style="justify-content:space-between"><span class="label">Volume</span><span class="mono" style="font-size:12px;color:var(--dim)">70%</span></div>
            <div class="row" style="height:24px"><div class="slider" role="slider" aria-label="Volume" aria-valuenow="70" tabindex="0"><i style="width:70%"></i><b style="left:70%"></b></div></div>
          </div>
          <div class="col" style="gap:8px">
            <div class="row" style="justify-content:space-between"><h2 style="font-size:10.5px;color:var(--dim)">Snapshots</h2>${btn('Restore', 'sm ghost')}</div>
            <div class="list" style="border:1px solid var(--line)">
              <div class="li" style="min-height:36px"><span class="mono" style="font-size:12px">12:04</span><span class="grow dim" style="font-size:12.5px">Base colour changed</span></div>
              <div class="li" style="min-height:36px"><span class="mono" style="font-size:12px">11:58</span><span class="grow dim" style="font-size:12.5px">Presets reordered</span></div>
              <div class="li" style="min-height:36px"><span class="mono" style="font-size:12px">11:40</span><span class="grow dim" style="font-size:12.5px">Before install · full backup</span></div>
            </div>
          </div>
        </div>
      </section>
    </div>`;

  return shell({ title: 'Hiltwright · Presets', active: 'presets', body });
};

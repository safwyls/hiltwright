export default ({ shell, icon, btn, chip, hilt }) => {
  const look = ({ name, by, os, kb, c, c2, state, on = false }) => `
    <button class="panel ${on ? '' : 'plain'}" style="display:flex;flex-direction:column;gap:0;text-align:left;width:100%;${on ? 'border-color:var(--holo);' : ''}" aria-pressed="${on}">
      <div style="padding:18px 16px 12px;width:100%" class="col">
        <div class="blade" style="--c:${c}"></div>
        ${c2 ? `<div class="blade thin" style="--c:${c2};width:55%;margin-top:6px"></div>` : '<div style="height:12px"></div>'}
      </div>
      <div class="col" style="padding:4px 16px 14px;gap:6px;width:100%">
        <div class="row" style="justify-content:space-between"><b style="font-weight:600;font-size:14px">${name}</b>${state}</div>
        <div class="row" style="gap:10px;font-size:12px;color:var(--mute)"><span>${by}</span><span>·</span><span class="mono">${os}</span><span>·</span><span class="mono">${kb}</span></div>
      </div>
    </button>`;

  const argRow = (label, hex, n) => `
    <div class="row" style="min-height:36px;gap:10px;border-bottom:1px solid var(--line)">
      <span style="width:14px;height:14px;background:${hex};box-shadow:0 0 6px ${hex};flex:none"></span>
      <span class="grow" style="font-size:13px">${label}</span>
      <span class="mono mute" style="font-size:11px">arg ${n}</span>
    </div>`;

  const body = `
    <div class="row" style="justify-content:space-between;align-items:flex-end">
      <div>
        <div class="eyebrow">Looks · style library</div>
        <h1>Blade looks</h1>
        <p class="lead" style="margin-top:8px">A look is a compiled blade style. Looks already in your firmware cost nothing to reuse. New ones need a build.</p>
      </div>
      ${btn('Paste style code', '', icon.import)}
    </div>

    <div style="display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:20px;flex:1;min-height:0">
      <div class="col" style="gap:16px;min-height:0">
        <div class="row" style="gap:10px">
          <label class="input" style="width:220px">${icon.search}<span class="mute" style="font-family:'Exo 2',sans-serif">Search looks</span></label>
          ${chip('In this firmware · 4', 'live', icon.check)}
          ${chip('OS 8')}
          ${chip('Dual-phase')}
          ${chip('Crystal chamber')}
          <span class="hint" style="margin-left:auto">12 looks</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px">
          ${look({ name: 'Sentinel', by: 'Fett263', os: 'OS 8', kb: '4.2 KB', c: '#3dffb0', state: chip('Compiled in', 'ok', icon.check) })}
          ${look({ name: 'Duality', by: 'Fett263', os: 'OS 8', kb: '5.1 KB', c: '#3d7bff', c2: '#ff3d3d', state: chip('Compiled in', 'ok', icon.check) })}
          ${look({ name: 'Corruption', by: 'Fett263', os: 'OS 8', kb: '4.8 KB', c: '#ff3d3d', c2: '#7a1fff', state: chip('Needs build', 'warn'), on: true })}
          ${look({ name: 'Crystal pulse', by: 'Fett263', os: 'OS 8', kb: '1.9 KB', c: '#b26bff', state: chip('Compiled in', 'ok', icon.check) })}
          ${look({ name: 'Unstable', by: 'Hiltwright', os: 'OS 8', kb: '3.6 KB', c: '#ff4a1a', state: chip('Needs build', 'warn') })}
          ${look({ name: 'Rain', by: 'Hiltwright', os: 'OS 8', kb: '2.7 KB', c: '#5fd3ff', state: chip('Needs build', 'warn') })}
        </div>
        <div class="note" style="margin-top:auto">${icon.info}<span>Fett263 library looks are GPL. Their copyright headers stay in your config, and Hiltwright never redistributes the library itself.</span></div>
      </div>

      <aside class="panel" style="display:flex;flex-direction:column;min-height:0" aria-label="Selected look">
        <div class="ph"><div class="col" style="gap:2px"><h2>Corruption</h2><span class="hint">Fett263 · OS 7.15 / 8 · dual-phase</span></div>${chip('Needs build', 'warn')}</div>
        <div class="pb col" style="gap:16px;overflow:hidden">
          <div class="col" style="gap:8px;padding:10px 0 4px">
            <div class="row" style="gap:0">${hilt()}<div class="blade grow" style="--c:#ff3d3d"></div></div>
            <div class="row" style="gap:0"><span style="width:64px;flex:none"></span><div class="blade grow" style="--c:#7a1fff"></div></div>
          </div>
          <p class="dim" style="font-size:13px;text-wrap:pretty">Rippling base colour with a second phase you switch to with a gesture. Clash, lockup and blast included.</p>
          <div class="col" style="gap:0">
            <h2 style="font-size:10.5px;color:var(--dim);padding-bottom:8px">Colours you can change later</h2>
            ${argRow('Base colour', '#ff3d3d', 1)}
            ${argRow('Second phase', '#7a1fff', 2)}
            ${argRow('Clash flash', '#ffffff', 4)}
            ${argRow('Lockup', '#ffb547', 5)}
          </div>
          <div class="note amber">${icon.warn}<span>Needs the special-abilities option and an alt font folder on the SD card. Hiltwright adds both when you install.</span></div>
        </div>
        <div class="col" style="margin-top:auto;padding:18px;border-top:1px solid var(--line);gap:10px">
          <div class="row" style="justify-content:space-between;font-size:12.5px;color:var(--dim)"><span>Adds 4.8 KB</span><span class="mono">82% → <b class="amber" style="font-weight:600">86%</b> of flash</span></div>
          ${btn('Add to Graflex Mk II', 'pri', icon.plus)}
          <span class="hint">Builds new firmware (about 1 minute). Your presets and backup stay untouched.</span>
        </div>
      </aside>
    </div>`;

  return shell({ title: 'Hiltwright · Looks', active: 'looks', body });
};

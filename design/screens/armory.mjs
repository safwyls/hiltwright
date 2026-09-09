export default ({ shell, icon, btn, chip, meter, hilt }) => {
  const card = ({ name, board, blades, presets, fw, pct, flash, foot, blade, accent, crystalColor, state }) => `
    <article class="panel" style="display:flex;flex-direction:column;gap:0">
      <div class="ph" style="align-items:flex-start">
        <div class="col" style="gap:2px">
          <h3>${name}</h3>
          <div class="mute" style="font-size:12.5px">${board}</div>
        </div>
        ${state}
      </div>
      <div class="pb col" style="gap:16px">
        <div class="col" style="gap:8px;padding:6px 0">
          <div class="row" style="gap:0">${hilt(crystalColor)}<div class="blade grow" style="--c:${blade}"></div></div>
          ${accent ? `<div class="row" style="gap:0;padding-left:64px"><div class="blade thin" style="--c:${accent};width:40%"></div></div>` : '<div style="height:6px"></div>'}
        </div>
        <dl style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0">
          <div><dt class="label" style="font-size:10.5px">Blades</dt><dd style="margin:2px 0 0;font-size:13px">${blades}</dd></div>
          <div><dt class="label" style="font-size:10.5px">Presets</dt><dd style="margin:2px 0 0;font-size:13px">${presets}</dd></div>
          <div><dt class="label" style="font-size:10.5px">Firmware</dt><dd style="margin:2px 0 0;font-size:13px">${fw}</dd></div>
        </dl>
        <div class="col" style="gap:6px">
          <div class="row" style="justify-content:space-between"><span class="label" style="font-size:10.5px">Flash used</span><span class="mono" style="font-size:12px;color:var(--dim)">${flash}</span></div>
          ${meter(pct)}
        </div>
      </div>
      <div class="row" style="padding:12px 18px;border-top:1px solid var(--line);justify-content:space-between;margin-top:auto">
        <span class="mono mute" style="font-size:11.5px">${foot}</span>
        ${btn('Open', 'sm ghost', '')}
      </div>
    </article>`;

  const body = `
    <div class="row" style="justify-content:space-between;align-items:flex-end">
      <div>
        <div class="eyebrow">Armory</div>
        <h1>Your sabers</h1>
        <p class="lead" style="margin-top:8px">Every saber keeps its own wiring, presets, backups and firmware. Plug one in and Hiltwright recognises it.</p>
      </div>
      <div class="row">
        ${btn('Import from CFX / Xenopixel', '', icon.import)}
        ${btn('Add a saber', 'pri', icon.plus)}
      </div>
    </div>

    <section class="panel" aria-label="Connected saber">
      <div class="row" style="padding:16px 18px;gap:18px">
        <span style="color:var(--holo);display:flex;width:28px;height:28px">${icon.usb}</span>
        <div class="col grow" style="gap:2px">
          <h3>Graflex Mk II is connected</h3>
          <div class="dim" style="font-size:13px">Proffieboard V2.2 · ProffieOS 8.10 · 5 presets · presets.ini matches your last edit · backed up 12 minutes ago</div>
        </div>
        ${btn('Diagnostics', 'sm', icon.diag)}
        ${btn('Edit presets', 'sm pri', icon.presets)}
      </div>
    </section>

    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px">
      ${card({
        name: 'Graflex Mk II', board: 'Proffieboard V2.2 · 256 KB',
        blades: '4 · blade, crystal, accent, motor', presets: '5', fw: 'OS 8.10 · 7 Sep',
        pct: 82, flash: '214.8 / 256 KB', foot: 'Backed up 12 min ago',
        blade: '#3d7bff', crystalColor: '#3d7bff', state: chip('Connected', 'live'),
      })}
      ${card({
        name: 'Crossguard', board: 'Proffieboard V3.9 · 512 KB',
        blades: '3 · 144 px + two 20 px side blades', presets: '8', fw: 'OS 8.10 · 2 Sep',
        pct: 43, flash: '218.4 / 512 KB', foot: 'Last seen 3 days ago',
        blade: '#ff2a2a', accent: '#ff7a2a', state: chip('2 looks to install', 'warn'),
      })}
      <article class="panel plain" style="border-style:dashed;display:flex;flex-direction:column">
        <div class="ph" style="border-bottom:0"><h3>Add a saber</h3></div>
        <div class="list" style="padding:0 6px 6px">
          <a href="#" class="li" style="text-decoration:none;color:inherit;gap:14px">
            <span style="color:var(--holo);display:flex;width:18px">${icon.usb}</span>
            <span class="col grow" style="gap:1px"><b style="font-weight:600">Read from the saber</b><span class="hint">Plug it in. We read the board, firmware and presets.</span></span>
            <span class="mute" style="display:flex;width:16px">${icon.chev}</span>
          </a>
          <a href="#" class="li" style="text-decoration:none;color:inherit;gap:14px">
            <span style="color:var(--holo);display:flex;width:18px">${icon.sd}</span>
            <span class="col grow" style="gap:1px"><b style="font-weight:600">Read from the SD card</b><span class="hint">Uses the ProffieOS source folder your installer left.</span></span>
            <span class="mute" style="display:flex;width:16px">${icon.chev}</span>
          </a>
          <a href="#" class="li" style="text-decoration:none;color:inherit;gap:14px">
            <span style="color:var(--holo);display:flex;width:18px">${icon.build}</span>
            <span class="col grow" style="gap:1px"><b style="font-weight:600">Describe the hardware</b><span class="hint">Board, blades, buttons. Five steps.</span></span>
            <span class="mute" style="display:flex;width:16px">${icon.chev}</span>
          </a>
        </div>
      </article>
    </div>

    <div style="display:grid;grid-template-columns:minmax(0,1fr) 440px;gap:20px">
      <section class="panel">
        <div class="ph"><h2>Coming from Crystal Focus X or Xenopixel?</h2></div>
        <div class="pb col" style="gap:14px">
          <p class="dim" style="font-size:13.5px;max-width:620px;text-wrap:pretty">Point Hiltwright at your old card. It reads config.txt and colors.txt (CFX) or SET/config.ini (Xenopixel), turns each profile into a preset, converts font file names, and shows you the result before anything touches a saber.</p>
          <div class="row">
            ${btn('Choose old SD card', '', icon.sd)}
            <span class="hint">Nothing is written until you press Install.</span>
          </div>
        </div>
      </section>
      <section class="panel" aria-label="Recent backups">
        <div class="ph"><h2>Recent backups</h2>${btn('All backups', 'sm ghost')}</div>
        <div class="list">
          <div class="li"><span style="color:var(--green);display:flex;width:16px">${icon.shield}</span><span class="grow">Graflex Mk II · full flash + presets.ini</span><span class="mono mute" style="font-size:11.5px">12:04 today</span></div>
          <div class="li"><span style="color:var(--green);display:flex;width:16px">${icon.shield}</span><span class="grow">Graflex Mk II · presets.ini snapshot</span><span class="mono mute" style="font-size:11.5px">11:40 today</span></div>
          <div class="li"><span style="color:var(--green);display:flex;width:16px">${icon.shield}</span><span class="grow">Crossguard · full flash</span><span class="mono mute" style="font-size:11.5px">4 Sep</span></div>
        </div>
      </section>
    </div>`;

  return shell({ title: 'Hiltwright · Armory', active: 'armory', body });
};

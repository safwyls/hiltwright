export default ({ shell, icon, btn, chip, hilt }) => {
  const row = (name, type, rate, size, status) => `
    <tr>
      <td><div class="row" style="gap:10px"><button class="row" style="width:32px;height:32px;justify-content:center;border:1px solid var(--line2);color:var(--holo)" aria-label="Preview ${name}"><span style="width:14px;height:14px;display:flex">${icon.play}</span></button><span style="font-weight:600;white-space:nowrap">${name}</span></div></td>
      <td class="dim">${type}</td>
      <td class="mono dim" style="font-size:12.5px">${rate}</td>
      <td class="mono dim" style="font-size:12.5px">${size}</td>
      <td>${status}</td>
    </tr>`;

  const map = (a, b) => `<div class="row" style="justify-content:space-between;min-height:30px;border-bottom:1px solid var(--line)"><span class="mono dim" style="font-size:12px">${a}</span><span class="mute" style="display:flex;width:14px">${icon.chev}</span><span class="mono" style="font-size:12px;color:var(--text)">${b}</span></div>`;

  const body = `
    <div class="row" style="justify-content:space-between;align-items:flex-end">
      <div>
        <div class="eyebrow">Fonts &amp; SD card</div>
        <h1>Sound fonts</h1>
      </div>
      <div class="row">${btn('Open card in Explorer', '', icon.sd)}${btn('Add font folder', 'pri', icon.plus)}</div>
    </div>

    <section class="panel" aria-label="SD card status">
      <div class="row" style="padding:14px 18px;gap:18px">
        <span style="color:var(--holo);display:flex;width:26px;height:26px">${icon.sd}</span>
        <div class="col grow" style="gap:2px">
          <h3>Graflex Mk II's card · mounted through the saber</h3>
          <div class="dim" style="font-size:13px">29.1 GB free of 32 GB · 6 fonts · 7 tracks · presets.ini present</div>
        </div>
        ${chip('Slow link · use a card reader for big fonts', 'warn', icon.clock)}
        ${btn('Eject', 'sm', icon.eject)}
      </div>
      <div class="note amber" style="margin:0 18px 16px">${icon.warn}<span>While the card is mounted the saber cannot play sound. Eject before you ignite. Hiltwright ejects automatically when you leave this page.</span></div>
    </section>

    <div style="display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:20px;flex:1;min-height:0">
      <section class="panel" aria-label="Fonts on the card" style="min-height:0;overflow:hidden">
        <table>
          <thead><tr><th>Font</th><th>Type</th><th>Sample rate</th><th>Size</th><th>Status</th></tr></thead>
          <tbody>
            ${row('KyberPhonics Osha', 'Polyphonic', '44.1 kHz', '68 MB', chip('Ready', 'ok', icon.check))}
            ${row('Greyscale Sentinel', 'Polyphonic', '44.1 kHz', '91 MB', chip('Ready', 'ok', icon.check))}
            ${row('TeensySF', 'Monophonic', '44.1 kHz', '12 MB', chip('Ready', 'ok', icon.check))}
            ${row('Duality Alt', 'Polyphonic', '48 kHz', '40 MB', chip('hum.wav is 48 kHz', 'warn', icon.warn))}
            ${row('SmthJedi', 'Mixed', '44.1 kHz', '18 MB', chip('clash01 and clsh1 both present', 'err', icon.x))}
          </tbody>
        </table>
        <div class="col" style="padding:16px 18px;gap:12px;border-top:1px solid var(--line)">
          <div class="note red">${icon.x}<span><b style="font-weight:600">SmthJedi mixes two clash styles.</b> ProffieOS plays only one. Keep clash01–08 (polyphonic) or clsh1–8 (monophonic), not both.</span><a href="#" style="margin-left:auto;white-space:nowrap;font-weight:600">Fix</a></div>
          <div class="note amber">${icon.warn}<span><b style="font-weight:600">Duality Alt has a 48 kHz file.</b> The saber needs 44.1 kHz or lower. Hiltwright can convert hum.wav and keep the original.</span><a href="#" style="margin-left:auto;white-space:nowrap;font-weight:600">Convert</a></div>
        </div>
      </section>

      <aside class="col" style="gap:20px;min-height:0">
        <section class="panel plain" style="border-style:dashed;padding:26px 18px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center" aria-label="Add fonts">
          <span style="color:var(--holo);display:flex;width:26px;height:26px">${icon.import}</span>
          <b style="font-weight:600">Drop a font folder here</b>
          <span class="hint" style="max-width:280px">Any board's naming works. We check the files and convert names before copying.</span>
        </section>

        <section class="panel" style="display:flex;flex-direction:column;min-height:0" aria-label="Naming converter">
          <div class="ph"><div class="col" style="gap:2px"><h2>Jedi Temple</h2><span class="hint">Xenopixel naming detected · 41 files</span></div>${chip('Convert', 'warn', icon.warn)}</div>
          <div class="pb col" style="gap:0;padding-top:8px">
            ${map('in.wav', 'in01.wav')}
            ${map('out.wav', 'out01.wav')}
            ${map('swing (1).wav', 'swng01.wav')}
            ${map('swing (2).wav', 'swng02.wav')}
            ${map('hum.wav', 'hum01.wav')}
            <div class="hint" style="padding-top:10px">+ 36 more · nothing is renamed on your computer, only on the copy.</div>
          </div>
          <div class="row" style="margin-top:auto;padding:14px 18px;border-top:1px solid var(--line);justify-content:space-between">
            <span class="mono mute" style="font-size:11.5px">36 MB · about 2 min over the saber</span>
            ${btn('Convert and copy', 'pri sm', icon.check)}
          </div>
        </section>
      </aside>
    </div>`;

  const status = '<span><b>Board</b> Proffieboard V2.2 · 256 KB</span><span><b>SD</b> mounted via saber · 29.1 GB free</span><span><b>presets.ini</b> in sync</span><span style="margin-left:auto"><b>Backup</b> 12 min ago</span>';
  return shell({ title: 'Hiltwright · Fonts & SD', active: 'fonts', body, status });
};

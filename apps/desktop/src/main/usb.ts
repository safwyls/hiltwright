// Best-effort USB serial lookup. Web Serial only tells the renderer vendor and product ids; the serial number
// is what survives a reflash, so main asks the OS. Windows only for now (PnP instance id of the composite parent).

import { execFile } from 'node:child_process';

const PARENT_RE = /USB\\VID_1209&PID_6668\\([^\\\s"]+)/gi;

export async function proffieSerials(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  const script = `Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match '^USB\\\\VID_1209&PID_6668\\\\' } | ForEach-Object { $_.InstanceId }`;
  const out = await new Promise<string>((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 8000, windowsHide: true }, (err, stdout) => resolve(err ? '' : stdout));
  });
  const serials = new Set<string>();
  for (const m of out.matchAll(PARENT_RE)) serials.add(m[1]);
  return [...serials];
}

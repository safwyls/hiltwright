// The page's Content-Security-Policy for a production build (issue #30). index.html carries the development one,
// which lets the page reach the live-reload server on this computer (ws://localhost:<port>). A production page opens
// no WebSocket at all, so the build removes that source, and fails if it is not there to remove or if any ws:/wss:
// source would be left: a policy that changed shape must be looked at, not shipped as it is.

/** The one WebSocket source the development page allows: the live-reload server, on this computer only. */
export const DEV_LIVE_RELOAD = 'ws://localhost:*';

export function productionCsp(html: string): string {
  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"\s*\/?>/.exec(html);
  if (!meta) throw new Error('index.html has no Content-Security-Policy meta tag.');
  const policy = meta[1];
  const connect = /(?:^|;)\s*connect-src ([^;]*)/.exec(policy);
  if (!connect) throw new Error('The Content-Security-Policy has no connect-src.');
  const sources = connect[1].trim().split(/\s+/);
  if (!sources.includes(DEV_LIVE_RELOAD)) throw new Error(`The Content-Security-Policy's connect-src has no ${DEV_LIVE_RELOAD} to remove for production.`);
  const kept = sources.filter((s) => s !== DEV_LIVE_RELOAD);
  if (kept.some((s) => /^wss?:/i.test(s))) throw new Error(`The Content-Security-Policy's connect-src would let a production page open WebSockets: ${kept.join(' ')}`);
  const next = policy.replace(connect[0], connect[0].replace(connect[1], kept.join(' ')));
  if (/\bwss?:/i.test(next)) throw new Error('The production Content-Security-Policy still names a WebSocket source.');
  return html.replace(meta[0], meta[0].replace(policy, next));
}

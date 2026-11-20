// Which serial devices the page may reach. Main is the only gate: the page can open a port only if this allows it.

const PROFFIE_VID = 0x1209;
const PROFFIE_PID = 0x6668;

/** Electron reports ids as decimal strings on select-serial-port ("4617") and as numbers to the device handler. */
function idMatches(value: unknown, expected: number): boolean {
  if (typeof value === 'number') return value === expected;
  if (typeof value !== 'string' || !value) return false;
  return parseInt(value, 10) === expected || parseInt(value, 16) === expected;
}

export function isProffie(vendorId: unknown, productId: unknown): boolean {
  return idMatches(vendorId, PROFFIE_VID) && idMatches(productId, PROFFIE_PID);
}

/**
 * Whether the page may use this serial device. On Windows a serial device arrives as
 * { device_instance_id: "USB\\VID_1209&PID_6668&MI_00\\...", name } with no vendorId/productId; other platforms
 * report ids (macOS as `vendor_id`/`product_id`). With `noBoard` (the HILTWRIGHT_NO_BOARD development switch) nothing
 * is allowed.
 */
export function serialAllowed(device: unknown, noBoard: boolean, now = Date.now()): boolean {
  if (noBoard) return false;
  const d = (device ?? {}) as {
    vendorId?: unknown; productId?: unknown; vendor_id?: unknown; product_id?: unknown; device_instance_id?: string;
  };
  const byId = isProffie(d.vendorId, d.productId) || isProffie(d.vendor_id, d.product_id);
  if (!(byId || /VID_1209&PID_6668/i.test(d.device_instance_id ?? ''))) return false;
  // After an install only the saber installed may be reached, so that another board plugged in beside it is not
  // opened first (HW-2026-09-25c). An interface not yet known to be its board waits until main has looked it up.
  const w = activeWant(now);
  if (!w || !d.device_instance_id) return true;
  return w.ids.has(d.device_instance_id.toUpperCase());
}

/**
 * The board the page wants to reach next, by USB serial, and the serial interfaces known to belong to it (their PnP
 * parent is `USB\VID_1209&PID_6668\<serial>`). Set before an install's saber comes back; cleared once it is read.
 */
let want: { serial: string; ids: Set<string>; until: number } | null = null;
const WANT_MS = 5 * 60_000;

export function wantSerial(serial: string | null, now = Date.now()): void {
  want = serial ? { serial, ids: new Set(), until: now + WANT_MS } : null;
}
export function activeWant(now = Date.now()): { serial: string; ids: Set<string> } | null {
  if (want && want.until <= now) want = null;
  return want;
}
/** The interfaces found to belong to the wanted board (only while that board is still the one wanted). */
export function setWantedInterfaces(serial: string, ids: string[]): void {
  if (want?.serial === serial) want.ids = new Set(ids.map((i) => i.toUpperCase()));
}

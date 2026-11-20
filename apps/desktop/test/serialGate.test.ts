import { afterEach, describe, expect, it } from 'vitest';
import { activeWant, serialAllowed, setWantedInterfaces, wantSerial } from '../src/main/serialGate';
import { interfacesOf } from '../src/main/usb';

const byIds = { vendorId: 0x1209, productId: 0x6668 };
const byIdStrings = { vendorId: '4617', productId: '26216' };
const byInstance = { device_instance_id: 'USB\\VID_1209&PID_6668&MI_00\\7&380A8E11&0&0000', name: 'USB Serial Device (COM8)' };
const byMacIds = { name: 'Proffieboard', vendor_id: 4617, product_id: 26216, usb_driver: 'com.apple.driver.usb.cdc.acm' };
const other = { vendorId: 0x2341, productId: 0x0043 };

describe('which serial devices the page may use', () => {
  it('allows a Proffieboard however it is described, and nothing else', () => {
    expect(serialAllowed(byIds, false)).toBe(true);
    expect(serialAllowed(byIdStrings, false)).toBe(true);
    expect(serialAllowed(byInstance, false)).toBe(true);
    expect(serialAllowed(byMacIds, false)).toBe(true);
    expect(serialAllowed(other, false)).toBe(false);
    expect(serialAllowed(undefined, false)).toBe(false);
  });

  it('allows nothing in a no-board run', () => {
    expect(serialAllowed(byIds, true)).toBe(false);
    expect(serialAllowed(byInstance, true)).toBe(false);
  });
});

// install-target-safety design D6: after an install, only the saber coming back may be opened.
describe('reaching one board by its USB serial', () => {
  const hote2Port = { device_instance_id: 'USB\\VID_1209&PID_6668&MI_00\\7&380A8E11&0&0000', name: 'Serial' };
  const v3Port = { device_instance_id: 'USB\\VID_1209&PID_6668&MI_00\\7&2430EE5C&0&0000', name: 'Serial' };
  afterEach(() => wantSerial(null));

  it('with no board wanted, every Proffieboard is allowed', () => {
    expect(serialAllowed(hote2Port, false)).toBe(true);
    expect(serialAllowed(v3Port, false)).toBe(true);
  });

  it('while one is wanted, others wait, and so does it until its interface is known', () => {
    wantSerial('209133815232');
    expect(serialAllowed(hote2Port, false)).toBe(false);
    setWantedInterfaces('209133815232', [hote2Port.device_instance_id.toLowerCase()]);
    expect(serialAllowed(hote2Port, false)).toBe(true);
    expect(serialAllowed(v3Port, false)).toBe(false);
    expect(serialAllowed({ device_instance_id: 'USB\\VID_046D&PID_0AC4&MI_04\\8&1', name: 'USB VCOM' }, false)).toBe(false);
  });

  it('interfaces found for a board no longer wanted are ignored; the want lapses after five minutes', () => {
    wantSerial('209133815232', 1000);
    setWantedInterfaces('207A349A5430', [v3Port.device_instance_id]);
    expect(activeWant(1000)?.ids.size).toBe(0);
    expect(activeWant(1000 + 5 * 60_000)).toBeNull();
    expect(serialAllowed(v3Port, false, 1000 + 5 * 60_000)).toBe(true);
  });

  it("a board's serial interface is the one whose parent carries its serial", () => {
    const list = [
      { id: 'USB\\VID_1209&PID_6668&MI_00\\7&380A8E11&0&0000', parent: 'USB\\VID_1209&PID_6668\\209133815232' },
      { id: 'USB\\VID_1209&PID_6668&MI_02\\7&380A8E11&0&0002', parent: 'USB\\VID_1209&PID_6668\\209133815232' },
      { id: 'USB\\VID_1209&PID_6668&MI_00\\7&2430EE5C&0&0000', parent: 'USB\\VID_1209&PID_6668\\207A349A5430' },
      { id: 'USB\\VID_1209&PID_6668&MI_03\\x', parent: null },
    ];
    expect(interfacesOf(list, '209133815232')).toEqual(['USB\\VID_1209&PID_6668&MI_00\\7&380A8E11&0&0000']);
    expect(interfacesOf(list, '207a349a5430')).toEqual(['USB\\VID_1209&PID_6668&MI_00\\7&2430EE5C&0&0000']);
    expect(interfacesOf(list, 'NOPE')).toEqual([]);
  });
});

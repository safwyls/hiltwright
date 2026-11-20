// What to tell the owner when the saber's serial port would not open. A port opens for one program at a time, so the
// cause is nearly always another program holding it; the browser's own message ("Failed to open serial port") says
// neither that nor what to do.

/** `holders`: other programs found with a USB serial port open (usb.portHolders), empty when none or not known. */
export function openFailureText(detail: string, holders: string[]): string {
  const tail = ` (${detail.replace(/^NetworkError:\s*/, '').replace(/\.$/, '')}.)`;
  if (holders.length) {
    const who = holders.length === 1 ? holders[0] : `${holders.slice(0, -1).join(', ')} and ${holders[holders.length - 1]}`;
    return `The saber's port is in use by ${who}. Only one program can use it at a time: close it there (in the Arduino IDE, close the Serial Monitor), then press Connect.${tail}`;
  }
  return `The saber's port would not open. Another program probably has it: the Arduino IDE's Serial Monitor, another serial terminal, or a browser tab on the ProffieOS Workbench. Close it, then press Connect. If nothing else is open, unplug the saber, plug it in again and press Connect.${tail}`;
}

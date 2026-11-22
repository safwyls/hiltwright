// What a bootloader's flash size says about the board, and the words for refusing a board (install-target-safety).
// Shared by main (the flasher) and the page (the install sequence), so both say the same thing.

export type BoardType = 'V2' | 'V3';

/** Which Proffieboard a bootloader's flash size means: the V2's STM32L433 has 256 KB, the V3's STM32L452 512 KB. */
export function boardForFlash(bytes: number | null | undefined): BoardType | null {
  return bytes === 262144 ? 'V2' : bytes === 524288 ? 'V3' : null;
}

/** After a refusal with the board sitting in its bootloader: how to bring it back to its firmware. */
export const LEAVE_BOOTLOADER = 'To bring the saber back to its firmware, press RESET on the board, or unplug it and plug it back in.';

export function wrongBoard(actual: BoardType, built: BoardType): string {
  return `This saber is a Proffieboard ${actual}, but this firmware was built for a ${built}. Nothing was written. Choose ${actual} on the Wiring page and build again.`;
}

export function unknownBoard(flashBytes: number | null): string {
  return `Hiltwright does not recognise this board (its bootloader reports ${flashBytes ? `${Math.round(flashBytes / 1024)} KB of flash` : 'no flash size'}). Nothing was written.`;
}

export function otherSaber(other: string, wanted: string): string {
  return `The board in bootloader mode is ${other}, not ${wanted}. Nothing was written.`;
}

/** Checking the board met a bootloader Windows has no driver for: dfu-util cannot read it, nor send it back. */
export const NO_DRIVER_FOR_CHECK = 'Windows has no driver for the bootloader yet. It is installed with the first flash on Build & Flash; choose the board yourself for now.';

/** After a stop before anything was written: Hiltwright sent the board back to its firmware itself (FW29). */
export const BACK_ON_FIRMWARE = 'The saber is back on the firmware it had.';

/** The wait for the bootloader ended with the saber still running its firmware. */
export const IGNORED_REBOOT = 'The saber did not restart into bootloader mode; it is still running its firmware. Hold BOOT, tap RESET, release BOOT, then press Install again.';

/** The backup read was all erased: a blank or wiped board, so the install goes on (owner's decision, FW7). */
export const NOTHING_TO_BACK_UP = 'The board had no firmware on it, so there was nothing to back up.';

export const SEVERAL_BOOTLOADERS = 'More than one board is in bootloader mode. Unplug the other Proffieboards, then press Install again.';
export const NO_BOOTLOADER = 'No board is in bootloader mode. Hold BOOT, tap RESET, release BOOT, then press Install again.';

/** A backup whose size is not the board's flash: both named as boards where the sizes are known. */
export function backupSizeMismatch(backupBytes: number, flashBytes: number): string {
  const name = (b: number) => (boardForFlash(b) ? `a Proffieboard ${boardForFlash(b)} (${b / 1024} KB)` : `${Math.round(b / 1024)} KB`);
  return `This backup is from ${name(backupBytes)}; this saber is ${name(flashBytes)}. Nothing was written.`;
}

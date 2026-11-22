// What stops the toolchain setup from starting: a folder path too long for the compiler, or not enough free space.
// One check, used by the installer in main (which refuses with `error`) and by the Build page's panel (which shows
// `panel` and disables the button), so the two never disagree about when the setup can start.

/**
 * GCC opens its own headers through an un-normalised path (bin/../lib/gcc/arm-none-eabi/14.2.1/../../../../
 * arm-none-eabi/include/c++/...), which puts `bits/error_constants.h` 213 characters below the toolchain root.
 * Windows stops at 259, so the root gets 46 at the very most; 40 leaves a margin for other multilib variants.
 */
export const MAX_ROOT_LENGTH = 40;
/** On-disk footprint of a full install, and the free space the setup asks for (the footprint plus room to build). */
export const INSTALL_DISK_BYTES = 1.9 * 1024 * 1024 * 1024;
export const INSTALL_DISK_MARGIN = 2.5 * 1024 * 1024 * 1024;

export interface ToolchainFacts { root: string; ready: boolean; freeBytes: number | null; pathTooLong: boolean; open?: boolean | null }
export interface Blocker { error: string; panel: string }

export function toolchainBlockers(s: ToolchainFacts): { pathTooLong: Blocker | null; lowSpace: Blocker | null; untrusted: Blocker | null } {
  return {
    // Nothing is downloaded into, or run from, a folder another Windows account owns or can change (#20).
    untrusted: s.open ? {
      error: `Hiltwright will not set up the compiler in ${s.root}: another Windows account owns the folder or can change it. Choose Repair on the Compiler step first.`,
      panel: 'Repair the folder first: another Windows account owns it or can change it.',
    } : null,
    pathTooLong: s.pathTooLong ? {
      error: `The toolchain folder path is too long for the compiler on Windows (${s.root.length} characters, at most ${MAX_ROOT_LENGTH}): ${s.root}`,
      panel: `This folder's path is too long for the compiler on Windows: ${s.root.length} characters, where at most ${MAX_ROOT_LENGTH} fit. The compiler's own files sit about 213 characters deeper, and Windows stops at 259.`,
    } : null,
    lowSpace: !s.ready && s.freeBytes != null && s.freeBytes < INSTALL_DISK_MARGIN ? {
      error: `Not enough free space: ${(s.freeBytes / 1073741824).toFixed(1)} GB free, the toolchain needs about ${(INSTALL_DISK_BYTES / 1073741824).toFixed(1)} GB plus room to build.`,
      panel: 'Not enough free space. Free up at least 2.5 GB, then try again.',
    } : null,
  };
}

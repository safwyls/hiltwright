// The typed contract between renderer and main, exposed by the preload script as window.hiltwright.
// Only data crosses this boundary: no handles, no callbacks except the event subscriptions listed here.

import type { FirmwareManifest, FontReport, LookDef, PresetBank, PresetRecord, SaberConfigModel, VoicePackStatus } from '@hiltwright/core';

/** What the app can learn about a board without touching its SD card. */
export interface SaberIdentity {
  /** USB serial number of the composite device (Windows: from the PnP instance id). Stable across reflashes. */
  usbSerial: string | null;
  configName: string | null;
  version: string | null;
  prop: string | null;
  buttons: number | null;
  installed: string | null;
  /** Pixel counts per WS281X blade as reported by `scanid`, in blade order. */
  pixelBlades: number[];
  /** BladeConfig row the board selected at the last `scanid`. */
  bladeConfig: number | null;
}

export interface SaberRecord {
  id: string;
  name: string;
  identity: SaberIdentity;
  firstSeen: string;
  lastSeen: string;
  /** Last presets read from the board. */
  presets: PresetRecord[];
  fonts: string[];
  tracks: string[];
  /** The wiring, prop and looks the owner last built (or is preparing to build) for this saber. */
  model?: SaberConfigModel;
  /** What the last successful install compiled in. Absent on vendor firmware. */
  firmware?: FirmwareManifest;
  /** Set up before the hilt was ever connected: wiring, presets and looks chosen ahead. Adopted by the real saber when it appears. */
  planned?: boolean;
}

export interface SaberPatch { model?: SaberConfigModel | null; firmware?: FirmwareManifest | null }

export interface SnapshotMeta {
  file: string;
  at: string;
  label: string;
  presets: number;
}

export interface CardInfo {
  root: string;
  label: string | null;
  freeBytes: number | null;
  totalBytes: number | null;
  proffie: boolean;
  hasPresetsIni: boolean;
}

export interface PackInfo {
  id: string; kind: 'hilt' | 'font'; name: string; creator: string; licence: string;
  allow: { copyToCard: boolean; demoPlayback: boolean };
  fit?: { flip?: boolean; rollDeg?: number; lengthCm?: number | null; offsetXmm?: number; offsetZmm?: number; seatMm?: number; tiltXDeg?: number; tiltZDeg?: number; staffSeatMm?: number; axis?: 'auto' | 'origin' | 'box' };
  file: string; sounds: number; packed: string;
}
export interface PackMesh {
  positions: Float32Array; normals: Float32Array; indices: Uint32Array;
  groups: { start: number; count: number; color: [number, number, number]; metalness: number; roughness: number; name: string }[];
  fit?: PackInfo['fit']; name: string; creator: string;
}

export interface FontSounds { name: string; files: Record<string, ArrayBuffer>; ini: Record<string, string>; smoothsw: Record<string, string>; bytes: number; skipped: number }

export interface FontEntry {
  name: string;
  path: string;
  report: FontReport;
}

export interface XenoFontInfo {
  slot: string;
  path: string;
  name: string;
  /** Folder name the font gets on the ProffieOS card. */
  folder: string;
  hex: string;
  /** Colour as a ProffieOS style argument word. */
  colorWord: string;
  effect: string | null;
  sounds: number;
  tracks: number;
  bytes: number;
}

export interface ToolchainStatus {
  root: string;
  cli: boolean;
  cliVersion: string | null;
  core: boolean;
  gcc: boolean;
  dfuUtil: string | null;
  proffieOS: boolean;
  proffieOSVersion: string | null;
  ready: boolean;
  /** Free space on the volume that would hold the toolchain, when known. */
  freeBytes: number | null;
  /** Windows: the folder is too deep for the compiler's 260-character path limit. */
  pathTooLong: boolean;
}

export interface BuildResult {
  ok: boolean;
  cached: boolean;
  ms: number;
  configPath: string;
  configHash: string;
  dfuPath: string | null;
  textBytes: number | null;
  flashBytes: number;
  flashPct: number | null;
  problems: string[];
  output: string;
  warnings: string[];
  /** Which look went into which slot, for the saber record once installed. */
  manifest: Omit<FirmwareManifest, 'os' | 'at'> | null;
  os: string;
}

export interface UsbState {
  runtimePresent: boolean;
  bootloaderPresent: boolean;
  bootloaderDriver: string | null;
  bootloaderProblem: number | null;
}

export interface BackupInfo { file: string; at: string; label: string; bytes: number; /** Starts like real firmware; anything else is refused. */ valid: boolean }

export interface FlashStepResult { ok: boolean; ms: number; detail: string; file?: string }

/** Progress lines from long-running main-process jobs. */
export interface JobEvent { job: 'toolchain' | 'build' | 'flash'; line: string; at: number }

export interface HiltwrightApi {
  appVersion: string;
  platform: string;
  library: {
    list(): Promise<SaberRecord[]>;
    /** Match an identity to a known saber, or create one. Returns the stored record. */
    upsert(input: { identity: SaberIdentity; presets: PresetRecord[]; fonts: string[]; tracks: string[]; name?: string }): Promise<SaberRecord>;
    rename(id: string, name: string): Promise<SaberRecord>;
    remove(id: string): Promise<void>;
    /** Store the build model and/or firmware manifest for a saber. `null` clears a field. */
    update(id: string, patch: SaberPatch): Promise<SaberRecord>;
    /** A saber set up ahead of its hilt: a record with no identity and the given build model. */
    plan(name: string, model: SaberConfigModel): Promise<SaberRecord>;
    /** The connected saber takes over a plan's model, and the plan is dropped. */
    adopt(plannedId: string, targetId: string): Promise<SaberRecord>;
  };
  /** Preset banks built without a saber, in userData/banks.json. */
  banks: {
    list(): Promise<PresetBank[]>;
    save(bank: PresetBank): Promise<PresetBank[]>;
    remove(id: string): Promise<PresetBank[]>;
  };
  /** Pasted looks, shared across sabers, in userData/looks.json. */
  looks: {
    list(): Promise<LookDef[]>;
    add(look: LookDef): Promise<LookDef[]>;
    update(id: string, look: LookDef): Promise<LookDef[]>;
    remove(id: string): Promise<LookDef[]>;
  };
  snapshots: {
    list(saberId: string): Promise<SnapshotMeta[]>;
    save(saberId: string, label: string, presets: PresetRecord[]): Promise<SnapshotMeta>;
    read(saberId: string, file: string): Promise<PresetRecord[]>;
  };
  usb: {
    /** Serial numbers of Proffieboards currently attached, when the platform can tell us. */
    proffieSerials(): Promise<string[]>;
  };
  sd: {
    /** Removable volumes, flagged when they look like a ProffieOS card. */
    locate(): Promise<CardInfo[]>;
    listFonts(root: string): Promise<FontEntry[]>;
    /** Flush and dismount the card's volume, as 'Safely remove' does. Before the saber takes its card back. */
    eject(root: string): Promise<{ ok: boolean; detail: string }>;
    /** A font's playable sounds, from a known card or the font bank. Slow over the saber's USB link. */
    readFont(root: string, fontName: string): Promise<FontSounds>;
    onReadFontProgress(cb: (p: { file: string; done: number; total: number }) => void): () => void;
    /** The folder of fonts on this computer used when no card is about, or null. */
    fontBank(): Promise<string | null>;
    pickFontBank(): Promise<string | null>;
    bankFonts(): Promise<FontEntry[]>;
    listTracks(root: string): Promise<{ name: string; size: number }[]>;
    /** The Fett263 voice pack in the card's common folder. */
    voicePack(root: string): Promise<VoicePackStatus>;
    /** Ask the user for a font folder on this computer and check it without copying. */
    pickFont(): Promise<FontEntry | null>;
    copyFont(src: string, root: string, replace: boolean): Promise<FontEntry>;
  };
  packs: {
    list(): Promise<PackInfo[]>;
    /** The folder the owner can drop .hwpack files into. */
    dir(): Promise<string>;
    mesh(id: string): Promise<PackMesh>;
    font(id: string): Promise<FontSounds>;
  };
  /** Bring fonts over from another board's SD card. The source is only read. */
  importer: {
    /** Ask for a Xenopixel card folder and list the fonts on it. Null when cancelled. */
    pickXeno(): Promise<{ root: string; fonts: XenoFontInfo[] } | null>;
    /** Convert one listed font onto the ProffieOS card at `root`, as folder `folder`. */
    xenoFont(src: string, root: string, folder: string, replace: boolean): Promise<FontEntry>;
  };
  toolchain: {
    status(): Promise<ToolchainStatus>;
    /** Download and install whatever is missing. Progress arrives through onJobEvent. */
    install(): Promise<ToolchainStatus>;
  };
  build: {
    /** Generate config.h for the model and compile it. Progress arrives through onJobEvent. */
    run(saberId: string, model: SaberConfigModel, force: boolean): Promise<BuildResult>;
    /** The generated config text, without compiling. */
    preview(model: SaberConfigModel): Promise<{ text: string; hash: string; warnings: string[]; errors: string[] }>;
  };
  flash: {
    usb(): Promise<UsbState>;
    /** Wait up to timeoutMs for the bootloader to enumerate with a usable driver. */
    waitForBootloader(timeoutMs: number): Promise<{ ok: boolean; text: string }>;
    backup(saberId: string, label: string): Promise<FlashStepResult>;
    write(dfuPath: string): Promise<FlashStepResult>;
    /** Windows: download the official bootloader driver installer, run it elevated, wait for WinUSB to bind. */
    installDriver(): Promise<{ ok: boolean; text: string }>;
    /** Flash backups taken before installs for this saber, newest first. */
    listBackups(saberId: string): Promise<BackupInfo[]>;
    /** Write one of this saber's backups back. The board must be in bootloader mode. */
    restore(saberId: string, file: string): Promise<FlashStepResult>;
    /** Wait for the running firmware's serial device to be back. */
    waitForRuntime(timeoutMs: number): Promise<boolean>;
  };
  onJobEvent(cb: (e: JobEvent) => void): () => void;
  app: {
    userDataPath(): Promise<string>;
    openPath(path: string): Promise<void>;
    /** Open a known help page in the system browser. Only pod.hubbe.net and fredrik.hubbe.net are allowed. */
    openHelp(url: string): Promise<void>;
  };
}

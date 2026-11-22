// The typed contract between renderer and main, exposed by the preload script as window.hiltwright.
// Only data crosses this boundary: no handles, no callbacks except the event subscriptions listed here.

import type { HiltFit, SceneSettings } from './demoSettings';
import type { BusyFacts, UpdateState } from './updates';
import type { CustomProp, FirmwareManifest, FontReport, LookDef, PresetBank, PresetRecord, SaberConfigModel, VoicePackStatus } from '@hiltwright/core';

/** A demo-room hilt the owner loaded, as the room lists it: everything but the model's bytes. */
export interface HiltInfo { id: string; name: string; format: 'glb' | 'obj' | 'stl'; fit: HiltFit; creator?: string }
/** A hilt's model and the files that came with it (an OBJ's .mtl and textures), by the names the model uses. */
export interface HiltModelData { format: 'glb' | 'obj' | 'stl'; data: ArrayBuffer | Uint8Array; sideFiles: { name: string; data: ArrayBuffer | Uint8Array }[] }
export interface HiltInput extends HiltModelData { name: string; fit?: unknown; creator?: string }
/** 'new': add under its own name, or report the hilt that has it. 'keepBoth': add under the next free numbered name. `replace`: swap that hilt's model, keeping its name, fit and credit. */
export type HiltAddMode = 'new' | 'keepBoth' | { replace: string };
export type HiltAddResult = { added: HiltInfo } | { taken: { id: string; name: string } };
/**
 * What an earlier version kept in one page origin's own storage. `origin` is recorded once adopted, so it is never
 * brought over twice. `chosen` is `pack:<packId>` or `name:<hilt name>`.
 */
export interface LegacyHilts { origin: string; hilts: (HiltInput & { packId?: string })[]; scene?: unknown; chosen?: string }
/** Hilts added, pack fit adjustments added, and entries skipped because they were already here. */
export interface HiltMergeResult { added: number; fits: number; skipped: number }

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
  /** What its bootloader showed at the last install or restore: the serial it had there, and its flash size and so its board. */
  bootloader?: { serial: string | null; flashBytes: number; board: 'V2' | 'V3'; at: string };
  /** The SD cards that belong to this saber, by volume serial number, so one in a card reader is known as its own. */
  cards?: { serial: string; label: string | null; at: string }[];
}

/** A saber's setup written for someone else (saberShare.ts). */
export interface SaberShareExported { file: string; presets: number; styles: number; fonts: string[]; customProp: string | null }
/** A shared saber brought in as a planned one. `propMissing`: it names a custom prop file but does not carry it. */
export interface SaberShareImported { saber: SaberRecord; from: string; app: string; stylesAdded: number; fonts: string[]; customProp: string | null; propMissing: boolean }

/** A change to a remembered saber. `presets`: its presets as last read, kept up to date by live edits (preset-editor-fixes D5). */
export interface SaberPatch { model?: SaberConfigModel | null; firmware?: FirmwareManifest | null; presets?: PresetRecord[] }

export interface SnapshotMeta {
  file: string;
  at: string;
  label: string;
  presets: number;
  /** The file ends with its `end` line. One cut short is shown as incomplete and never restored (issue #28). */
  complete: boolean;
}

export interface CardInfo {
  root: string;
  label: string | null;
  freeBytes: number | null;
  totalBytes: number | null;
  proffie: boolean;
  hasPresetsIni: boolean;
  /** The USB serial of the Proffieboard this drive belongs to, when a saber is sharing its own card. */
  saberSerial: string | null;
  /** The card's file system as Windows names it (FAT32, exFAT, NTFS...), or null when unknown. */
  fileSystem: string | null;
  /** Nothing on it but the system's own files. */
  empty: boolean;
  /** The volume serial number Windows reports (8 hex digits), unchanged until the card is formatted; null elsewhere. */
  volumeSerial: string | null;
  /**
   * The volume that was in the drive at this look (8 or more hex digits; the volume serial on Windows). Writes pass
   * it back, and are refused if the drive holds another card by then (issue #9). Missing only in tests' made-up cards.
   */
  volumeId?: string | null;
  /** The font and name of each preset in its presets.ini, or null when it has none. */
  presets: { font: string; name: string }[] | null;
  /** How many times this app has written to it since it started: what was read from it is current while this holds. */
  writes: number;
}

/** A drive mounted now, and the volume in it, so a card swapped for another at the same letter is noticed (issue #9). */
export interface MountedDrive { root: string; volumeId: string | null }

/**
 * One look for drives (`sd.look`): the cards found, or that Windows did not answer the drive list in time or the
 * query failed (`answered: false`), which is not "no card". `ms` is how long the look took.
 */
export type DriveLook = { answered: true; cards: CardInfo[]; ms: number } | { answered: false; detail: string; ms: number };

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

/** A Fett263 voice pack zip on this computer, as checked before copying. */
export interface VoicePackInfo {
  /** The zip on this computer. */
  file: string;
  /** From the zip's name. */
  name: string;
  /** voice_pack_version from its voicepack.ini; 1 when it has none, as ProffieOS reads it. */
  version: number;
  files: number;
  bytes: number;
  /** The first line of the pack's licence or readme, when it has one. */
  credit: string | null;
}

/** One voice pack Hiltwright offers (resources/voicepack/catalogue.json, made by scripts/voicepacks.ts). */
export interface VoicePackCataloguePack {
  id: string;
  name: string;
  /** "Proffie voices" (the plain spoken defaults, by language) or "Characters". */
  group: string;
  author: string;
  year: number | null;
  /** The pack's own words about itself, from its readme. */
  about: string;
  version: number;
  /** Files and bytes it puts in common. */
  files: number;
  bytes: number;
  /** The zip, on the release (baseUrl + asset) or beside the app when bundled. */
  asset: string;
  assetBytes: number;
  sha256: string;
  /** A small JPEG data URL of the pack's picture. */
  picture: string | null;
}

export interface VoicePackCatalogue {
  /** The GitHub release holding every pack's zip. */
  release: string;
  baseUrl: string;
  /** The pack that ships inside the app. */
  bundled: string;
  /** The credit shown wherever the packs are offered, the author's support link, and where the packs are published. */
  credit: string;
  support: string;
  source: string;
  packs: VoicePackCataloguePack[];
}

/** A catalogue pack and whether this computer already has it. */
export interface VoicePackChoice extends VoicePackCataloguePack { have: 'bundled' | 'downloaded' | null }

export interface FontEntry {
  name: string;
  path: string;
  report: FontReport;
}

export interface FontMeta { name: string; maker: string; notes: string; added: string; from?: string; /** A set the maker released together. */ bundle?: string }
/** Someone credited for a font or a look, with their logo (a data URL) and link when the owner added them. */
export interface ContributorInfo { name: string; logo: string | null; url: string | null }
export interface FontSound { path: string; effect: string; kind: 'mono' | 'poly' | 'shared' | 'other'; seconds: number | null; size: number }
export interface FontSupport { type: FontReport['type']; smoothSwing: boolean; effects: string[]; special: string[]; tracks: number }
export interface LibraryFont { folder: string; meta: FontMeta; report: FontReport; support: FontSupport; bytes: number }
export interface LibraryFontDetail extends LibraryFont { sounds: FontSound[]; tracks: FontSound[] }
/** A picked library export that is locked: `name` is the file's name, `wrong` that the passphrase given did not open it. */
export interface LockedImport { needsPassphrase: true; name: string; wrong: boolean }
/** `reason` and `from` are set when a folder was left out on purpose, so the page can say each kind once. */
export interface ImportResult { /** Makers whose logo or link came in with an export file. */ makers?: string[]; added: string[]; skipped: { name: string; why: string; reason?: 'other-board' | 'extra' | 'have'; from?: string }[] }
export interface FontLibraryStatus {
  root: string;
  /** The library is in its default place, userData/fonts. */
  isDefault: boolean;
  /** The folder the owner chose is not there (its drive unplugged, say); nothing was created in its place. */
  missing: boolean;
  /** A folder chosen as the old "font bank", offered once for import. */
  legacyBank: string | null;
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
  /** What is installed, read back: arduino-cli's version, the board support's version folders, the ProffieOS source. */
  versions: { cli: string | null; core: string | null; proffieOS: string | null };
  /**
   * Windows: the folder fails the ownership check (#20), so nothing in it is run: another account owns it or can change
   * it, or its permissions could not be read. Null when it does not exist.
   */
  open: boolean | null;
  /** Why the folder is open: another account owns it, other accounts can change it, or the check could not run. */
  openWhy?: 'owner' | 'writers' | 'unknown' | null;
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
  /** The board this firmware was built for; the install checks it against the bootloader's flash size. */
  board: 'V2' | 'V3';
}

export interface UsbState {
  runtimePresent: boolean;
  bootloaderPresent: boolean;
  bootloaderDriver: string | null;
  bootloaderProblem: number | null;
  /** Every board in its bootloader (serial null when the device gave none), and the serials of every running board. */
  bootloaders: { serial: string | null; driver: string | null; problem: number | null }[];
  runtimeSerials: string[];
  /** Running boards that gave no USB serial. */
  runtimeNoSerial: number;
}

/** What one bootloader says about its board: the flash size, and the board type it means (null when unknown). */
export interface FlashTarget { serial: string | null; flashBytes: number | null; board: 'V2' | 'V3' | null; found: boolean }

export interface BackupInfo { file: string; at: string; label: string; bytes: number; /** Starts like real firmware; anything else is refused. */ valid: boolean; /** The config the saber reported when this was taken, if known. */ configName: string | null }

/** `kind`: for a backup, what the read turned out to be; only 'firmware' is a backup (an erased read means a blank board). */
/** `refused`: main would not write it (not this saber's last build, or unconfirmed wiring), so nothing was written. */
export interface FlashStepResult { ok: boolean; ms: number; detail: string; file?: string; kind?: 'firmware' | 'erased' | 'unusable' | 'partial'; refused?: boolean }

/** Progress lines from long-running main-process jobs. */
export interface JobEvent { job: 'toolchain' | 'build' | 'flash'; line: string; at: number }

/** What the page knows about the connection and the saber being worked on, for the diagnostics file. */
export interface ConnectionSnapshot {
  status: string;
  error: string | null;
  /** vid:pid of the open port. */
  port: string | null;
  board: {
    version: string | null; config: string | null; prop: string | null; buttons: number | null;
    battery: number | null; volume: number | null; presets: number; fonts: number; tracks: number; blades: number[];
  } | null;
  /** Times this connection's link stalled and the port was opened again (usb-power-connect D7). */
  pauses: number;
  /** The saber every page is about (the connected one, or the one chosen in the Armory). */
  saberId: string | null;
}

export interface HiltwrightApi {
  appVersion: string;
  platform: string;
  /** The app's look (shared/themes.ts). */
  theme: {
    /** The theme the window opened in: the saved one, or the default. */
    initial: string;
    /** Save a theme and recolour the window's own parts. Resolves to the theme now in force. */
    set(id: string): Promise<string>;
  };
  library: {
    list(): Promise<SaberRecord[]>;
    /** Match an identity to a known saber, or create one. Returns the stored record. */
    /** Match or create. `expect` names the saber just installed and the config it now reports (matched without a serial). */
    upsert(input: { identity: SaberIdentity; presets: PresetRecord[]; fonts: string[]; tracks: string[]; name?: string; expect?: { id: string; configName: string } | null }): Promise<SaberRecord>;
    rename(id: string, name: string): Promise<SaberRecord>;
    remove(id: string): Promise<void>;
    /** Store the build model and/or firmware manifest for a saber. `null` clears a field. */
    update(id: string, patch: SaberPatch): Promise<SaberRecord>;
    /** A saber set up ahead of its hilt: a record with no identity and the given build model. */
    plan(name: string, model: SaberConfigModel): Promise<SaberRecord>;
    /** The connected saber takes over a plan's model, and the plan is dropped. */
    adopt(plannedId: string, targetId: string): Promise<SaberRecord>;
    /** Save a saber's setup as a .hwsaber file for someone else (asks where). Null when the owner cancels. */
    exportShare(name: string, model: SaberConfigModel): Promise<SaberShareExported | null>;
    /** Import a .hwsaber file (asks which) as a planned saber. Null when the owner cancels. */
    importShare(): Promise<SaberShareImported | null>;
    /** Remember what this saber's bootloader showed at an install: its serial and flash size (256 KB or 512 KB only). */
    noteBootloader(id: string, seen: { serial: string | null; flashBytes: number }): Promise<SaberRecord>;
    /** This SD card (by volume serial number) is the saber's own; any other saber holding it lets it go. */
    linkCard(id: string, card: { serial: string; label: string | null }): Promise<SaberRecord>;
    unlinkCard(id: string, serial: string): Promise<SaberRecord>;
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
    /** Store the new version, and give it to every saber whose plan holds a copy (how many is `sabersUpdated`). */
    update(id: string, look: LookDef): Promise<{ looks: LookDef[]; sabersUpdated: number }>;
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
    /** Let only the board with this USB serial be reached until it is read (null: every board). Returns how many of its serial interfaces were found. */
    wantSerial(serial: string | null): Promise<number>;
    /** The other programs that have a USB serial port open now, by name (macOS and Linux; empty where it cannot be told). */
    portHolders(): Promise<string[]>;
  };
  sd: {
    /** Removable volumes, flagged when they look like a ProffieOS card. */
    locate(): Promise<CardInfo[]>;
    /** The same look as `locate`, saying when Windows did not answer instead of returning an empty list. */
    look(): Promise<DriveLook>;
    /** The drives mounted now, by root, with the volume in each: cheap, to notice a card put in, taken out or swapped without a full look. */
    mounted(): Promise<MountedDrive[]>;
    listFonts(root: string): Promise<FontEntry[]>;
    /** Flush and dismount the card's volume, as 'Safely remove' does. Before the saber takes its card back. */
    eject(root: string): Promise<{ ok: boolean; detail: string }>;
    /** Whether a folder of this name is on the card at `root`. */
    hasFolder(root: string, name: string): Promise<boolean>;
    /** A font's playable sounds, from a known card. Slow over the saber's USB link. */
    readFont(root: string, fontName: string): Promise<FontSounds>;
    /** Progress of readFont and fontLibrary.readFont. */
    onReadFontProgress(cb: (p: { file: string; done: number; total: number }) => void): () => void;
    listTracks(root: string): Promise<{ name: string; size: number }[]>;
    /** The Fett263 voice pack in the card's common folder. */
    voicePack(root: string): Promise<VoicePackStatus>;
    /**
     * Remove presets.ini and presets.tmp from a known card (staged presets installed while the card is in a reader).
     * The card's own files are kept first, in this saber's data folder and as a snapshot; nothing is removed if they cannot be.
     * `volumeId` (from the look, CardInfo.volumeId): refused if the drive holds another card by then. The same for every write below.
     */
    clearPresets(root: string, saberId: string, volumeId?: string | null): Promise<string[]>;
    /** Config files (.h with a BladeConfig) at the top of a known card or in its config folder, with their text. */
    configFiles(root: string): Promise<{ name: string; text: string }[]>;
    /** Ask for a config file on this computer and read it; null when the owner cancels. */
    pickConfig(): Promise<{ name: string; text: string } | null>;
    /** The voice packs Hiltwright offers, with the author's links; empty when this build has no catalogue. */
    voicePacks(): Promise<{ packs: VoicePackChoice[]; support: string | null; source: string | null; credit: string | null }>;
    /** Open the packs' author's support page, or the thread they come from (addresses from the catalogue). */
    openVoicePackLink(which: 'support' | 'source'): Promise<void>;
    /** Ask for a voice pack zip on this computer and check it without copying. */
    pickVoicePack(): Promise<VoicePackInfo | null>;
    /**
     * Put a voice pack in the card's common folder: a catalogue pack by id (downloaded first when this computer does
     * not have it), or the `file` of a picked zip. What it replaces is copied to this computer first (`backup`). Copy
     * progress comes through onCopyProgress, download progress through onVoicePackDownload.
     */
    installVoicePack(root: string, source: { pack: string } | { file: string }, volumeId?: string | null): Promise<{ status: VoicePackStatus; backup: string | null; replaced: number }>;
    onVoicePackDownload(cb: (p: { name: string; got: number; total: number }) => void): () => void;
    /** Ask the user for a font folder on this computer and check it without copying. */
    pickFont(): Promise<FontEntry | null>;
    copyFont(src: string, root: string, replace: boolean, volumeId?: string | null): Promise<FontEntry>;
    /** Files copied so far for a copy onto the card, from Fonts & SD or the font library (card-safety D5). */
    onCopyProgress(cb: (p: { name: string; done: number; total: number }) => void): () => void;
  };
  /** Sound fonts the owner added to this computer, in a folder they can move (default userData/fonts). */
  fontLibrary: {
    status(): Promise<FontLibraryStatus>;
    list(): Promise<LibraryFont[]>;
    /** One font with every sound and track in it. */
    detail(folder: string): Promise<LibraryFontDetail>;
    setMeta(folder: string, patch: Partial<Pick<FontMeta, 'name' | 'maker' | 'notes' | 'bundle'>>): Promise<LibraryFont>;
    /** Moves the font's folder to the recycle bin. */
    remove(folder: string): Promise<void>;
    /** The bytes of one sound or track (a path from detail()), to play. */
    readSound(folder: string, path: string): Promise<ArrayBuffer>;
    /** The playable sounds, for the demo room's font engine. Progress arrives through sd.onReadFontProgress. */
    readFont(folder: string): Promise<FontSounds>;
    /** `volumeId`: as for sd.clearPresets, the card the page read; refused if the drive holds another by then. */
    copyToCard(folder: string, root: string, replace: boolean, volumeId?: string | null): Promise<FontEntry>;
    /** Ask for .zip packages, or for folders, and copy the fonts found in them into the library. Null when cancelled. */
    addZip(): Promise<ImportResult | null>;
    addFolder(): Promise<ImportResult | null>;
    importLegacy(): Promise<ImportResult | null>;
    /** Ask where to save, then write every font and its details to one compressed, encrypted file. Null when cancelled. */
    /** `folders`: only these fonts. `passphrase`: lock the file with it; without one any copy of Hiltwright opens it. */
    exportPack(opts?: { folders?: string[]; passphrase?: string }): Promise<{ file: string; locked: boolean; fonts: number; files: number; bytes: number } | null>;
    /**
     * Ask for a file made by exportPack and add its fonts; a font already here is left as it is. Null when cancelled.
     * A file locked with a passphrase answers `needsPassphrase`: call again with the passphrase to open that file.
     */
    importPack(passphrase?: string): Promise<ImportResult | LockedImport | null>;
    dismissLegacy(): Promise<FontLibraryStatus>;
    /** Ask for a new location; offers to move the fonts there. */
    chooseRoot(): Promise<FontLibraryStatus>;
    resetRoot(): Promise<FontLibraryStatus>;
    /** Open the library folder, or one font's folder, in the file manager. */
    open(folder?: string): Promise<void>;
    onProgress(cb: (line: string) => void): () => void;
  };
  /** Font makers and look authors, credited with a logo and a link. Shared by the font library and the looks. */
  contributors: {
    /** Everyone given a logo or a link. Names without either are only on the fonts and looks themselves. */
    list(): Promise<ContributorInfo[]>;
    /** Ask for an image and make it the person's logo. Null when cancelled. */
    setLogo(name: string): Promise<ContributorInfo | null>;
    clearLogo(name: string): Promise<void>;
    /** An http(s) address, or '' to drop it. */
    setUrl(name: string, url: string): Promise<void>;
    /** Give `to` a copy of `from`'s logo and link (after an author rename). False when `from` has neither. */
    copy(from: string, to: string): Promise<boolean>;
    /** Open the person's saved link in the browser. */
    open(name: string): Promise<void>;
  };
  /** The demo room's hilts, fit adjustments to pack hilts, and scene settings, kept in the app's data folder. */
  hilts: {
    list(): Promise<HiltInfo[]>;
    model(id: string): Promise<HiltModelData>;
    add(input: HiltInput, mode: HiltAddMode): Promise<HiltAddResult>;
    setFit(id: string, fit: HiltFit): Promise<void>;
    setCreator(id: string, creator: string): Promise<void>;
    remove(id: string): Promise<void>;
    packFits(): Promise<Record<string, HiltFit>>;
    setPackFit(packId: string, fit: HiltFit): Promise<void>;
    resetPackFit(packId: string): Promise<void>;
    /** `adopted`: the page origins whose earlier storage has been brought over. */
    room(): Promise<{ scene: SceneSettings | null; chosen: string | null; adopted: string[] }>;
    /** `chosen`: a hilt id, `pack:<packId>`, or null for the built-in hilt. */
    setRoom(patch: { scene?: SceneSettings; chosen?: string | null }): Promise<void>;
    /** Bring over what an earlier version kept in page storage; never replaces anything. */
    adopt(legacy: LegacyHilts): Promise<HiltMergeResult>;
    /** Ask where to save, then write every hilt and pack fit to one zip. Null when cancelled. */
    export(): Promise<{ file: string; hilts: number; packFits: number } | null>;
    /** Ask for an export and add what is not already here. Null when cancelled. */
    import(): Promise<HiltMergeResult | null>;
  };
  packs: {
    list(): Promise<PackInfo[]>;
    /** The folder the owner can drop .hwpack files into. */
    dir(): Promise<string>;
    mesh(id: string): Promise<PackMesh>;
    font(id: string): Promise<FontSounds>;
    /** Copy a font pack's folder to the card at `root`, all or nothing. Refused unless the pack allows copying to a card. */
    copyFontToCard(packId: string, root: string, opts: { replace: boolean; volumeId?: string | null }): Promise<FontEntry>;
  };
  /** Bring fonts over from another board's SD card. The source is only read. */
  importer: {
    /** Ask for a Xenopixel card folder and list the fonts on it. Null when cancelled. */
    pickXeno(): Promise<{ root: string; fonts: XenoFontInfo[] } | null>;
    /** Convert one listed font onto the ProffieOS card at `root`, as folder `folder`. */
    xenoFont(src: string, root: string, folder: string, replace: boolean, volumeId?: string | null): Promise<FontEntry>;
  };
  toolchain: {
    status(): Promise<ToolchainStatus>;
    /** Download and install whatever is missing. Progress arrives through onJobEvent. Joins a setup already running. */
    install(): Promise<ToolchainStatus>;
    /** Stop the running setup. False when none is running. */
    cancel(): Promise<boolean>;
    /** Lock a toolchain folder other users can change (asks Windows for approval when needed). */
    repair(): Promise<{ ok: boolean; text: string; status: ToolchainStatus }>;
  };
  build: {
    /** Generate config.h for the model and compile it. Progress arrives through onJobEvent. */
    run(saberId: string, model: SaberConfigModel, force: boolean): Promise<BuildResult>;
    /** The generated config text, without compiling. */
    preview(model: SaberConfigModel): Promise<{ text: string; hash: string; warnings: string[]; errors: string[] }>;
    /** Ask for a ProffieOS prop file (.h), check it, and keep a copy; null when the owner cancels. */
    pickProp(): Promise<CustomProp | null>;
  };
  flash: {
    usb(): Promise<UsbState>;
    /**
     * Wait up to timeoutMs for a bootloader to enumerate with a usable driver. With `before` (the bootloader serials
     * present before a reboot), only a new one counts. `serials` are the new bootloaders found.
     */
    waitForBootloader(timeoutMs: number, before?: (string | null)[]): Promise<{ ok: boolean; text: string; serials: (string | null)[] }>;
    /** The flash size and board type of the bootloader with this serial (or the only one, for null). */
    target(serial: string | null): Promise<FlashTarget>;
    /** Send the board with this serial from its bootloader back to its firmware, writing nothing. */
    leave(serial: string | null): Promise<FlashStepResult>;
    /** `configName`: what the saber reported before its reboot, kept beside the backup so a restore can expect it back. `serial`: the board to read. */
    backup(saberId: string, label: string, configName?: string | null, serial?: string | null): Promise<FlashStepResult>;
    /**
     * Write this saber's last build. Main refuses any other file, wiring the owner has not confirmed, a board of another
     * type, or a board main did not read just before (`refused`, issue #29). `noBackup`: the owner chose to install
     * although that read could not be a backup.
     */
    write(saberId: string, dfuPath: string, serial?: string | null, opts?: { noBackup?: boolean }): Promise<FlashStepResult>;
    /** Windows: download the official bootloader driver installer, run it elevated, wait for WinUSB to bind. */
    installDriver(): Promise<{ ok: boolean; text: string }>;
    /** Flash backups taken before installs for this saber, newest first. */
    listBackups(saberId: string): Promise<BackupInfo[]>;
    /** Write one of this saber's backups back to the board with this serial. The board must be in bootloader mode, and read by `backup` just before. */
    restore(saberId: string, file: string, serial?: string | null): Promise<FlashStepResult>;
    /** Wait for the running firmware's serial device to be back; with a serial, that board's. */
    waitForRuntime(timeoutMs: number, serial?: string | null): Promise<boolean>;
  };
  onJobEvent(cb: (e: JobEvent) => void): () => void;
  support: {
    /** Write a diagnostics file into <userData>/support, show it in its folder, and return its name. Nothing is sent. */
    save(snapshot: ConnectionSnapshot): Promise<{ file: string }>;
  };
  app: {
    /** Stores that could not be read at start and were set aside: what the owner calls each, and the file it was kept as. */
    storeProblems(): Promise<{ store: string; keptAs: string; startedFrom: 'backup' | 'readable records' | 'nothing'; place: 'data' | 'fonts' }[]>;
    userDataPath(): Promise<string>;
    /** False when a development run was started with HILTWRIGHT_NO_BOARD: no board can be reached. */
    boardAccess(): Promise<boolean>;
    openPath(path: string): Promise<void>;
    /** The licence and third-party notices that ship with the app. A file that is missing is null. */
    legal(): Promise<{ licence: string | null; notices: string | null }>;
    /** Open the tagged source of this build on GitHub, in the system browser. Takes no address: main builds it from the app version. */
    openSource(): Promise<void>;
    /** Open a known help page in the system browser. Only pod.hubbe.net and fredrik.hubbe.net are allowed. */
    openHelp(url: string): Promise<void>;
  };
  tour: {
    /** The guided tour started or ended. While it runs, main refuses every request that would change anything. */
    setActive(on: boolean): Promise<boolean>;
  };
  /** In-app updates from GitHub's releases (main/updates.ts). Nothing is downloaded or installed without a press. */
  updates: {
    state(): Promise<UpdateState>;
    /** Ask GitHub for a newer version. `asked`: the owner pressed Check now, so a failure is shown. */
    check(asked: boolean): Promise<UpdateState>;
    /** Download the newer version found. Progress arrives through onChange. */
    download(): Promise<UpdateState>;
    /** Close and run the downloaded installer. Refused, with what to wait for, while a job or card sharing is running. */
    install(facts: BusyFacts): Promise<{ ok: boolean; text: string }>;
    onChange(cb: (s: UpdateState) => void): () => void;
  };
}

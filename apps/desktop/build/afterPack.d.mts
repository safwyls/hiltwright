// Types for afterPack.mjs, so the tests that import it are type-checked.

export interface PackContext {
  appOutDir: string;
  electronPlatformName: string;
  packager: { appInfo: { productFilename: string }; executableName?: string };
}

export interface FuseCalls {
  flipFuses(pathToElectron: string, config: Record<string, unknown>): Promise<unknown>;
  getCurrentFuseWire(pathToElectron: string): Promise<Record<string | number, unknown>>;
}

export const FUSES: {
  RunAsNode: false;
  EnableNodeOptionsEnvironmentVariable: false;
  EnableNodeCliInspectArguments: false;
  OnlyLoadAppFromAsar: true;
  EnableEmbeddedAsarIntegrityValidation: true;
};
export function fuseConfig(platform: string): Record<string, unknown>;
export function packagedPaths(context: PackContext): { electron: string; asar: string };
export function setFuses(context: PackContext, fuses?: FuseCalls): Promise<void>;
export function afterPack(context: PackContext): Promise<void>;
export default afterPack;

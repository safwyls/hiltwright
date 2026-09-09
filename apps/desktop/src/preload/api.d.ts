export interface HiltwrightApi {
  appVersion: string;
  platform: string;
}

declare global {
  interface Window {
    hiltwright: HiltwrightApi;
  }
}

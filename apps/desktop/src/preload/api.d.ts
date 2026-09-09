import type { HiltwrightApi } from '../shared/api';

declare global {
  interface Window {
    hiltwright: HiltwrightApi;
  }
}

export {};

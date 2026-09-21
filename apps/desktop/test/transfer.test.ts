import { describe, expect, it } from 'vitest';
import { readTransfer } from '../src/renderer/src/transfer';

describe('dfu-util transfer progress', () => {
  it('reads whole progress lines and keeps them out of the log', () => {
    expect(readTransfer('\rDownload\t[=================        ]  68%       151552 bytes')).toEqual({ fragment: true, mode: 'Download', pct: 68 });
    expect(readTransfer('Upload\t[=========================] 100%       262144 bytes')).toEqual({ fragment: true, mode: 'Upload', pct: 100 });
  });

  it('copes with a line the pipe cut into pieces', () => {
    expect(readTransfer('Download\t[=================        ]  70%  ')).toMatchObject({ fragment: true, pct: 70 });
    expect(readTransfer('     155648 bytes')).toEqual({ fragment: true, mode: null, pct: null });
    expect(readTransfer('Download\t[=================        ]')).toEqual({ fragment: true, mode: 'Download', pct: null });
    expect(readTransfer('  71%       159744 bytes')).toEqual({ fragment: true, mode: null, pct: 71 });
  });

  it('leaves real messages alone', () => {
    for (const line of ['Download done.', 'File downloaded successfully', 'Transitioning to dfuMANIFEST state', 'Erase   \t[====] 100% done', 'Opening DFU capable USB device...']) {
      expect(readTransfer(line).fragment, line).toBe(false);
    }
    expect(readTransfer('Download done.').pct).toBeNull();
  });
});

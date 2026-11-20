// When the saber's port will not open: who has it (usb.ts parseLsofHolders, from `lsof -F pcn`), and what the owner
// is told (shared/openFailure.ts).

import { describe, expect, it } from 'vitest';
import { parseLsofHolders } from '../src/main/usb';
import { openFailureText } from '../src/shared/openFailure';

const LISTING = [
  'p4312', 'cArduino', 'n/dev/cu.usbmodem2051318552421',
  'p4312', 'cArduino', 'n/dev/tty.usbmodem2051318552421',
  'p900', 'cHiltwright', 'n/dev/cu.usbmodem2051318552421',
  'p901', 'cHiltwright Helper (Renderer)', 'n/dev/cu.usbmodem2051318552421',
  'p77', 'cscreen', 'n/dev/cu.usbmodem14101',
].join('\n');

describe('who has the saber\'s port', () => {
  it('names each other program once, and never this app', () => {
    expect(parseLsofHolders(LISTING, [900])).toEqual(['Arduino', 'screen']);
  });

  it('leaves out this app\'s own process ids whatever they are called', () => {
    expect(parseLsofHolders('p55\ncnode\nn/dev/ttyACM0\n', [55])).toEqual([]);
  });

  it('finds nobody in an empty listing', () => {
    expect(parseLsofHolders('', [1])).toEqual([]);
  });
});

describe('what the owner is told when the port will not open', () => {
  const DETAIL = "NetworkError: Failed to execute 'open' on 'SerialPort': Failed to open serial port.";

  it('names the program that has it and says what to do', () => {
    const text = openFailureText(DETAIL, ['Arduino']);
    expect(text).toContain("in use by Arduino.");
    expect(text).toContain('then press Connect');
    expect(text).toContain("(Failed to execute 'open' on 'SerialPort': Failed to open serial port.)");
  });

  it('lists several programs in plain words', () => {
    expect(openFailureText(DETAIL, ['Arduino', 'screen', 'minicom'])).toContain('in use by Arduino, screen and minicom.');
  });

  it('says what usually has it when nobody could be named', () => {
    const text = openFailureText(DETAIL, []);
    expect(text).toContain("Serial Monitor");
    expect(text).toContain('unplug the saber');
  });
});

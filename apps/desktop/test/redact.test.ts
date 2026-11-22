import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRedactor, maskSerial, maskSerials, shortNamePrefix, shortPathOf } from '../src/main/redact';

const r = makeRedactor({ home: 'C:\\Users\\Al', user: 'Al', host: 'DESKTOP-SAM7' });

describe('keeping personal details out', () => {
  it('replaces the user folder in either slash direction and keeps the rest of the path', () => {
    expect(r('saved C:\\Users\\Al\\AppData\\Local\\Hiltwright\\tc\\x.zip')).toBe('saved %USERPROFILE%\\AppData\\Local\\Hiltwright\\tc\\x.zip');
    expect(r('file:///C:/Users/Al/AppData/x.js:1')).toBe('file:///%USERPROFILE%/AppData/x.js:1');
    expect(r('c:\\users\\al\\x')).toBe('%USERPROFILE%\\x');
  });

  it('replaces the user name and computer name in any case', () => {
    expect(r('user AL on desktop-sam7')).toBe('user <user> on <computer>');
    expect(r('\\\\DESKTOP-SAM7\\share')).toBe('\\\\<computer>\\share');
  });

  it('leaves a name alone inside another word', () => {
    expect(r('Alert: Almost done')).toBe('Alert: Almost done');
    expect(r('C:\\Users\\Alice\\x')).toBe('C:\\Users\\Alice\\x');
  });

  it('leaves other text unchanged', () => {
    const s = '[board] > hwt| version ProffieOS v8.10 COM8 1209:6668';
    expect(r(s)).toBe(s);
  });
});

// Issue #24: a user folder with a space, as a file:// address and in its 8.3 short form.
describe('a user folder with a space in it', () => {
  const sam = makeRedactor({ home: 'C:\\Users\\Sam Smith', user: 'Sam Smith', host: 'PC1', short: 'C:\\Users\\SAMSMI~1' });

  it('replaces it in a file:// address, percent-encoded, in either hex case', () => {
    expect(sam('at file:///C:/Users/Sam%20Smith/AppData/Local/Programs/Hiltwright/resources/app.asar/out/renderer/index.js:12'))
      .toBe('at file:///%USERPROFILE%/AppData/Local/Programs/Hiltwright/resources/app.asar/out/renderer/index.js:12');
    expect(sam('file:///c:/users/sam%20smith/x')).toBe('file:///%USERPROFILE%/x');
    expect(sam('file:///C%3A/Users/Sam%20Smith/x')).toBe('file:///%USERPROFILE%/x');
    expect(sam('C:\\Users\\Sam Smith\\x')).toBe('%USERPROFILE%\\x');
  });

  it('replaces the user name percent-encoded too', () => {
    expect(sam('user Sam%20Smith')).toBe('user <user>');
  });

  it('replaces the 8.3 short form Windows gave it', () => {
    expect(sam('temp C:\\Users\\SAMSMI~1\\AppData\\Local\\Temp\\hw-1')).toBe('temp %USERPROFILE%\\AppData\\Local\\Temp\\hw-1');
    expect(sam('C:/Users/samsmi~1/x')).toBe('%USERPROFILE%/x');
  });

  it('replaces the usual short form even when it could not be looked up', () => {
    const unknown = makeRedactor({ home: 'C:\\Users\\Sam Smith', user: 'sam', host: 'PC1' });
    expect(unknown('C:\\Users\\SAMSMI~2\\AppData\\Local\\Temp')).toBe('%USERPROFILE%\\AppData\\Local\\Temp');
    expect(unknown('C:\\Users\\SAMSMIX\\x')).toBe('C:\\Users\\SAMSMIX\\x');
  });

  it('guesses the start of a short name only for a name that needs one', () => {
    expect(shortNamePrefix('Sam Smith')).toBe('SAMSMI');
    expect(shortNamePrefix('verylongname')).toBe('VERYLO');
    expect(shortNamePrefix('Al')).toBeNull();
    expect(shortNamePrefix('Zoë')).toBe('ZO_');
  });

  // 8.3 names can be turned off for a drive, so a folder may have none: then the answer is null, never the long path.
  it.skipIf(process.platform !== 'win32')('looks up the short form of a long folder name with Windows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hw redact long name '));
    try {
      const short = shortPathOf(dir);
      if (short !== null) {
        expect(short).toMatch(/~\d/);
        expect(existsSync(short)).toBe(true);
      }
      expect(shortPathOf('C:\\100%\\x')).toBeNull();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('replaces a non-ASCII folder name in its percent-encoded form', () => {
    const zoe = makeRedactor({ home: 'C:\\Users\\Zoë', user: 'Zoë', host: 'PC1' });
    expect(zoe('file:///C:/Users/Zo%C3%AB/x')).toBe('file:///%USERPROFILE%/x');
    expect(zoe('file:///C:/Users/Zo%c3%ab/x')).toBe('file:///%USERPROFILE%/x');
  });
});

// Issue #24: serials keep only their last four characters, so two boards still read as two.
describe('serial numbers', () => {
  it('masks a serial to its last four characters', () => {
    expect(maskSerial('209133815232')).toBe('****5232');
    expect(maskSerial('1A2B')).toBe('****');
  });

  it('masks the serials it is told of wherever they stand as a whole word', () => {
    expect(maskSerials('card 1A2B3C4D and board 209133815232', ['1A2B3C4D', '209133815232'])).toBe('card ****3C4D and board ****5232');
    expect(maskSerials('x1A2B3C4Dy', ['1A2B3C4D'])).toBe('x1A2B3C4Dy');
    // Short values are left alone: they could be any number.
    expect(maskSerials('port 1234', ['1234'])).toBe('port 1234');
  });

  it('masks serials the redactor was given', () => {
    const known = ['205E35774D4B'];
    const withSerials = makeRedactor({ home: 'C:\\Users\\Al', user: 'Al', host: 'PC1' }, () => known);
    expect(withSerials('[usb] want 205E35774D4B: 2 interface(s) found')).toBe('[usb] want ****4D4B: 2 interface(s) found');
  });

  it('masks serials a line names, without being told of them', () => {
    expect(r('Found DFU: [0483:df11] ver=2200, path="1-1", alt=0, serial="205E35774D4B"')).toBe('Found DFU: [0483:df11] ver=2200, path="1-1", alt=0, serial="****4D4B"');
    expect(r('saber x "hote2" serial=209133815232 firstSeen=2026')).toBe('saber x "hote2" serial=****5232 firstSeen=2026');
    expect(r('waiting for the drive (serial 209133815232)')).toBe('waiting for the drive (serial ****5232)');
    expect(r('"USB Serial Number" = "209133815232"')).toBe('"USB Serial Number" = "****5232"');
    expect(r('USB\\VID_1209&PID_6668\\209133815232')).toBe('USB\\VID_1209&PID_6668\\****5232');
    expect(r('USB\\VID_1209&PID_6668\\6&2A3B4C5&0&1')).toBe('USB\\VID_1209&PID_6668\\6&2A3B4C5&0&1');
  });

  it('leaves words after "serial" alone', () => {
    for (const s of ['[serial] opened with {"baudRate":115200}', 'the serial opened again', 'no USB serial to know it by', 'serial=none']) expect(r(s)).toBe(s);
  });
});

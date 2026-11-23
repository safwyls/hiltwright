# Hiltwright 0.2.0-beta.16: install guide

This Hiltwright beta isn't signed, so Windows will warn you along the way. This guide takes you from the download to your first firmware install.

## Before you start

You need:

- Windows 10 or 11, 64-bit. Windows in S mode isn't supported, since S mode can only run Microsoft Store apps. Microsoft says you can leave S mode for free, but you can't go back.
- A Proffieboard V2.2 or V3.
- A USB data cable (some cables only charge).
- About 2.5 GB of free disk space. The first-run setup downloads about 360 MB and uses about 1.9 GB.
- The installer is about 205 MB.

## 1 Download

1. Open https://github.com/safwyls/hiltwright/releases/tag/v0.2.0-beta.16
2. Download `Hiltwright-0.2.0-beta.16-setup.exe`.

## 2 Windows warnings when you run the installer

The installer installs for your account only, and doesn't ask for administrator approval.

**Browser.** Edge and Chrome flag the download and ask whether to keep the file, so choose to keep it. The exact words differ between browsers and versions; look for **Keep**, sometimes under a **…** or arrow menu beside the download.

**Unblock.** Windows marks downloaded files, and you can clear the mark like this:

1. Right-click the installer and choose **Properties**.
2. On the **General** tab, tick **Unblock**.
3. Choose **OK**.

If you don't see **Unblock**, the file isn't marked and you can go on.

**SmartScreen.** Double-click the installer, and you may see "Windows protected your PC".

1. Choose **More info**.
2. Choose **Run anyway**.

If there's no **Run anyway** button, read the next section.

## 3 Smart App Control

Check this before you download. Smart App Control is on some Windows 11 PCs, and when Smart App Control is **On**, it blocks both the Hiltwright installer and the installed app, since this beta isn't signed. There's no **Run anyway** choice, and Microsoft says there's no way to allow one app.

To check:

1. Open **Windows Security**.
2. Choose **App & browser control**.
3. Choose **Smart App Control settings**.
4. The setting reads **On**, **Evaluation** or **Off**.

- **Off:** nothing to do. Carry on.
- **Evaluation:** Smart App Control is only watching, and may switch itself to **On** or **Off** later.
- **On:** the installer is blocked, and so is the app itself. Windows says: "We blocked … because we could not verify its publisher to confirm it was safe to run. This app has been blocked to help protect your device and data."

If yours is **On**, you have two choices:

- Use another PC for this beta.
- Turn Smart App Control off: on the same screen, choose **Off**. This lowers the protection of your PC for every app. On current Windows 11 you can choose **On** again later, but on older versions you can't turn Smart App Control back on without resetting Windows, so check that **On** can still be chosen on your PC and read Microsoft's page first: https://support.microsoft.com/topic/what-is-smart-app-control-285ea03d-fa88-4d56-882e-6698afdb7003

![Smart App Control settings in Windows Security, with On, Evaluation and Off](images/smart-app-control.png)

Turning Smart App Control off only for the install isn't enough. The installed app is unsigned too, and with Smart App Control turned back on, Windows blocks Hiltwright when you open it (we tested this on our own PC), so Smart App Control has to stay off for as long as you use this beta.

All of this comes from the beta being unsigned. A signed build wouldn't be blocked, and there isn't one yet.

## 4 First run: the one-time setup download

1. Open Hiltwright.
2. Go to the **Build** page and find **Compiler**. The Compiler step says "one-time download".
3. Choose **Download and install**.
4. Wait while setup downloads about 360 MB, checking each file before using it.
5. When the Compiler step says ProffieOS is ready, setup is done.

Setup gets arduino-cli and the ProffieOS source from GitHub, and the Proffieboard board support (with the compiler and dfu-util) from the ProffieOS author's package index.

Setup installs to `C:\ProgramData\Hiltwright`. If that folder isn't available, setup uses a short folder in your own profile instead. Only administrators and your account can change the folder.

If setup says there isn't enough space, free some up and choose **Try again**.

On a fast connection, setup takes about a minute.

## 5 The one Windows approval to expect

Your first install needs a one-time bootloader driver, so Windows asks for administrator approval once.

1. Plug in your saber with the USB data cable.
2. Put the board in bootloader mode if Hiltwright asks: hold BOOT, tap RESET, then release BOOT.
3. During the install, the **Build** page stops at "Windows needs a driver". Choose **Install the driver**.
4. Hiltwright downloads a 3 MB installer from the ProffieOS author, checks it, and starts it.
5. Choose **Yes** when Windows asks for approval.
6. Leave the saber plugged in, and the install carries on by itself.

If you choose **No**, the driver isn't installed and you won't be able to flash.

## 6 If antivirus flags something

Unsigned files are sometimes flagged by mistake. If Defender or another antivirus blocks or removes a file:

1. Don't turn your antivirus off.
2. Note the file name and the warning.
3. Tell us (section 8).
4. You can also submit the file to Microsoft at https://www.microsoft.com/wdsi/filesubmission. Say the file is a false positive.

## 7 Newer betas

0.2.0-beta.1 and 0.2.0-beta.2 can't update themselves. If you're on either, install this beta by hand, once: download the installer and run it, as in sections 1 and 2. The new beta installs over the old one, and your sabers, styles, fonts and backups are kept.

From 0.2.0-beta.3 on, Hiltwright looks for newer versions by itself:

- A little after Hiltwright starts, and every few hours while it's open, it asks GitHub for Hiltwright's list of releases. The check sends nothing about you or your sabers (GitHub sees your internet address, as with any web page).
- When a newer version is out, a small chip under the version in the sidebar says "Version ... is available". Nothing is downloaded yet.
- On the **About** page, press **Download version ...**. You can keep working while the update downloads.
- Press **Restart to update**. Hiltwright closes, the installer runs, and Hiltwright opens again. Hiltwright won't restart while a build, a firmware install, a **Put back**, a copy to the card or card sharing is running, and says what to wait for.
- To stop the checks, turn off **Check for updates when Hiltwright starts** on the About page. **Check now** still works.

The browser warning and the **Unblock** step in section 2 are only for installers you download in a browser, since an update Hiltwright downloads itself doesn't carry the mark. Smart App Control still has to stay off, though (section 3).

## 8 Where to report a problem

1. In Hiltwright, press **Save diagnostics**. Hiltwright saves a file on your PC and sends nothing.
2. Open https://github.com/safwyls/hiltwright/issues
3. Describe what happened and which step you were on.
4. Attach the diagnostics file.

## 9 On a Mac

This guide is for Windows. A macOS test build is attached to the same release, and the release notes say what we know about it and how to open it.

Source for this build: https://github.com/safwyls/hiltwright/tree/v0.2.0-beta.16

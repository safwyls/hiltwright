---
title: Settings and About
summary: Pick the app's theme, and see the version, the license, the source and updates.
section: Tools
order: 1
---
The **Tools** part of the sidebar has two pages. **Settings** holds your own choices for the app, which are not about any one saber. **About** is about the app itself. This page covers both.

## Settings

Settings has a **Theme** panel. Choose one of the themes to change how every page looks. The choice is saved, and each theme shows a short description and a row of its colors. The theme used to be on the About page.

> **Note:** While the guided tour runs, nothing is saved, so the themes are shown but cannot be chosen. Pick one after the tour.

![The Settings page with its themes](shots/clean-48.png)

## About

The **About** page shows the version you are running and the license: GPL-3.0-or-later. The About page has **Show the licence** and **Show the third-party notices** buttons, and **Open the source**, which opens the source code of this exact build on GitHub. The page also says that Hiltwright's own styles were composed from ProffieOS building blocks, taking ideas only from public style descriptions.

![The About page with the version, license and source link](shots/clean-49.png)

The version is also at the bottom right of the window, in the bar along the bottom, with the update chip beside it.

### Updates

Versions from 0.2.0-beta.3 on have a working **Updates** panel on the About page. 0.2.0-beta.1 has none, and the one in 0.2.0-beta.2 cannot check: install a newer beta by hand once, over either.

- **Check for updates when Hiltwright starts** is on unless you turn it off. Hiltwright then asks GitHub for its list of releases a little after it starts, and every few hours while it is open. The check sends nothing about your sabers or you; GitHub sees your internet address, as with any web page. A check that fails by itself says nothing, and being offline is not an error.
- **Check now** checks at once, whether the setting is on or off, and says what it found: "You have the latest version", or "Could not check:" and why.
- When a newer version is out, the panel says "Version ... is available", and a small chip beside the version, in the bar along the bottom of the window, says so too. Press the chip to open About. Nothing is downloaded until you press **Download version ...**. The panel shows how far the download has got.
- **Restart to update** closes Hiltwright, runs the installer and opens Hiltwright again. Your sabers, styles and fonts are kept. **Restart to update** waits while a build, a firmware install, a **Put back**, a copy to the card or card sharing is running, and says what to wait for. Quitting Hiltwright never installs an update by itself.

Nothing about updates shows or runs during the guided tour.

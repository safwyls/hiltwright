# Install and Live plan

Written 2026-11-21, from a talk with the owner. It changes the app's main flow. It is a plan only: nothing here is built yet.

## Why

- **Copying over the saber's USB is very slow.** The Proffieboard runs USB at full speed, which is USB 1.1. On hote2 (2026-11-14), one font took about 4 s through a USB 3 card reader and about 120 s over the saber's USB, roughly 30 times slower. Listing a shared card took 9 s to over 30 s. The app offers sharing over USB as an equal choice to a reader, so people pick the slow path without knowing it.
- **Using a reader conflicts with editing presets.** With the saber plugged in and its card in a reader, the saber reports no card. Presets then goes read-only, and it does not stage the edits either (preset-editor-fixes D6). So the reader habit we want people to have locks them out of step 2.
- **One flow is doing two jobs.**
  - *Setting a saber up* builds something to flash.
  - *Adjusting a flashed saber* talks to a saber that is already running.
  - Today the Presets step switches between the two depending on whether a saber is plugged in. That switch is the source of both problems above.

## The split

The firmware already draws the line for us:

| | **Install** | **Live** |
|---|---|---|
| Works on | what is compiled into the firmware | what the running saber holds: `presets.ini` on its card and its settings |
| Presets go | into the build; `presets.ini` is removed so the compiled list wins (`applyStagedPresets`) | to the saber at once, written to `presets.ini` and read back |
| Needs the saber plugged in | only to flash | always |
| Needs the card | once, near the end | for preset edits, in the saber |
| Planned sabers | yes | no |

**Install** is the set-up path. **Live** is for adjusting an installed saber.

## The sidebar

| Section | Pages |
|---|---|
| (top) | Armory |
| **Install** (was Saber) | 1 Wiring · 2 Fonts · 3 Presets · 4 Card & Flash |
| **Live** (new) | Presets · Controls · Card |
| **Workshop** | Styles · Style editor · Font library · Contributors · Demo room |
| **Tools** | Settings (new: the owner's preferences, starting with the theme) · About (the app, its version, credits and licences) |

The Armory moves above the sections because it is where you choose between them (see below).

**A bar along the bottom of the window** takes over the sidebar's foot, so the longer list of pages fits (owner, 2026-11-21). It shows:
- Take the tour;
- the saber being worked on, and whether it is plugged in;
- the full ProffieOS line, which the title bar used to cut short;
- Hiltwright's version, with the update chip beside it. Step 4 is renamed so the section does not read "Install › Build & Install".

## Install

Nothing in this section writes to a running saber until step 4 flashes it.

1. **Wiring.** No change. It stays first: it holds the pin check, and the blade count decides what the presets look like.
2. **Fonts.** *Choose the fonts this saber will carry.* This is new as a step.
   - You choose from the Font library, with import right on the page, so the hidden "go to the Workshop first" detour goes away.
   - No card is needed. The result is a list on the saber's model.
   - The card checks that Fonts & SD runs today (mono/poly mix, sample rate, `common/`) move to step 4, where the card is.
3. **Presets.** Always the staged list; there is no live mode here.
   - Fonts are picked from step 2's list. A font named here that is not on that list is added to it.
   - Without a card the page is never read-only: edits made with no card are kept as staged.
   - While the saber is plugged in, it still shows the saber's presets for comparison, with "Bring in the saber's current presets" (see *When both change*).
4. **Card & Flash.** One trip with the card in a reader, then one flash.
   - **The card comes first.** "Take the SD card out of the saber and put it in a card reader."
     - It shows an estimate from the total size to copy, for example "about 40 s in a reader, about 20 minutes over the saber's USB".
     - The rate starts from the 2026-11-14 measurement and is updated from each real copy on this computer.
   - **On the card, in one go:**
     - copy the fonts the list is missing;
     - set up the voice pack;
     - remove `presets.ini` and `presets.tmp` when presets are staged;
     - write the `ProffieOS source/` config copy;
     - link the card to the saber (card-ownership D-series).
   - **Then the saber:** "Put the card back in the saber and plug it in." Then backup, bootloader, write, verify, as today.
   - Because `presets.ini` was removed during the reader trip, the post-flash check sees the compiled list without a second restart.
   - **Sharing over USB is the labelled fallback**, "Share over the saber's USB (slow, about 20 minutes for this)", for people without a reader. It does the same card work.
   - Today's Build & Install reader checks (`installFlow`'s `card.where`) carry over.

## Live

For any plugged-in saber, whatever firmware it runs (owner, 2026-11-21). Each page offers what that firmware answers: Controls already hides settings the firmware rejects, and Presets needs `list_presets`.

- **Presets.** Today's live mode of the Presets page: changes go to the saber and are read back. Snapshots and restore live here.
  - It uses the same editor component as Install's step 3, in a different mode, so there is one editor to maintain.
  - A style the firmware does not carry is not queued for the next build from here. The page says so and offers "Add it in Install › Presets".
- **Controls.** Today's Diagnostics page: settings (volume and others, from `Controls.tsx`), effect triggers, battery, the console, Save diagnostics.
- **Card.** Share the card over USB for a small fix, such as one font or the voice pack, with the time estimate shown before the copy starts. This is Fonts & SD's share and give-back, and the font list of the card the saber is sharing.

**Unplugged:** each page shows what the saber last reported, with "Plug the saber in to change it". Nothing is staged from Live; staging is what Install is for.

**No card in the saber:** Live Presets says the card is out and that presets are saved on it. It offers to put the card back, or to make the change in Install instead.

## The Armory decides where you go

**Layout (owner picked variant D, 2026-11-21):**
- **Left:** Your sabers, as a list to pick from.
- **Right:** the picked saber's name and firmware line, with its two panels stacked below, each with a short explanation:
  - *Adjust it live*, showing what is on the saber now;
  - *Change its setup*, showing the four steps.
- **Highlighting:** the panel you can use is the highlighted one. With an unplugged saber picked, *Adjust it live* dims, shows what the saber reported when it was last read, and says "Plug it in to adjust".
- **Picking a saber:** you can pick another saber to change its setup while one is plugged in. That relaxes today's rule. The connected saber keeps the Live section, and flashing still only ever targets the saber that is plugged in.
- Mock pictures and the script that drew them: `armory-mock.js` (made in the session's scratchpad, not kept in the repo).

- **A plugged-in saber, any firmware:** two equal buttons, "Adjust it live" (Live › Presets) and "Change its setup" (Install, at the step `nextStep` gives).
- **A remembered saber that is not plugged in:** "Change its setup", and "Adjust it live" disabled with "Plug it in".
- **A planned saber:** Install only.
- The progress card keeps the four steps, with Fonts and Card & Flash in place of Fonts & SD and Build & Install.

This is where a newcomer could get lost, so mock the Armory first and let the owner pick by eye before building it.

## When both change

Live edits change the saber's `presets.ini`. Install's staged list can then drift from it, and an install would overwrite those tweaks without saying so.

- **The rule:** Live always shows the truth on the saber; Install's list is a draft.
- **Opening Install › Presets** with the saber plugged in, when the saber's presets differ from what the draft started from, shows a note: "{saber} has changed since this list was made (N presets differ)". It offers two choices:
  - "Bring in the saber's presets": replaces the draft, and keeps a snapshot of the draft;
  - "Keep my list".
- **Step 4 repeats that warning** before it flashes, so it cannot be missed.
- **Detecting the drift:** `presetsFrom` already records when the draft started. Store the saber's preset list at that moment beside it, and compare with `samePresets`.

## What moves where in the code

| Today | Becomes |
|---|---|
| `Presets.tsx`, live and staged modes | One editor with a `mode` prop; Install mounts `staged`, Live mounts `live`. The read-only-without-card branch goes from Install. |
| `Fonts.tsx` (Fonts & SD) | Split three ways: the font choice goes to Install › Fonts (new), the card checks and copy go to Install › Card & Flash, and the share and give-back go to Live › Card. |
| `Build.tsx` + `installFlow.ts` | Install › Card & Flash, with the reader trip in front of the flash. `applyStagedPresets` keeps its reader and in-saber branches as the fallback when the trip was skipped. |
| `Diagnostics` in `App.tsx` + `Controls.tsx` | Live › Controls. |
| `About.tsx`, Theme panel | Tools › Settings (new page); About keeps the rest. |
| `NAV` in `App.tsx` | New sections and pages; `workspace.ts` `flowStatus`/`nextStep` learn the new steps. |
| `tourSteps.ts` | The tour walks Install, then shows Live once. |
| `site/content/docs` | Help pages for the new pages; the old pages' URLs redirect. |

## Order of work

One commit each, with tests; hidden-app checks as usual (no board connected during automated runs).

1. **Armory mock**, two or three variants, for the owner to pick from. Nothing else waits on this except step 5.
2. **Sidebar and pages, no behaviour change.**
   - Rename Saber to Install and add Live.
   - Move Diagnostics to Live › Controls.
   - Add Tools › Settings with the theme picker from About.
   - Add Live › Presets and Live › Card as the existing pages in their live mode.
   - The steps keep their current pages for now.
3. **Install › Presets is always staged.** Remove the live mode and the read-only-without-card branch, and add the drift note and "Bring in the saber's presets".
4. **Install › Fonts.** The font choice on the model, with library import on the page; Presets picks from it.
5. **Card & Flash.**
   - Put the reader trip first, with the time estimate.
   - Do the card work in one go, followed by the flash.
   - Keep USB sharing as the labelled fallback.
   - Fonts & SD is gone after this.
6. **Armory fork** from the picked mock.
7. **Tour and help pages.**
8. **One hardware session on hote2.** It runs:
   - a full reader-first install with staged presets;
   - the USB fallback, timed;
   - a live edit followed by Install showing the drift;
   - a live edit with the card out.

## Decided (owner, 2026-11-21)

- **Live works with any firmware**, page by page as above.
- **Live keeps its own Card page** for small fixes; a one-font fix does not mean a reflash.
- **Tools stays, split in two:** Settings for the owner's preferences (the theme picker moves there from About), and About for the app itself.

## Out of scope

- Faster copies over USB. The board's USB speed is the limit; serial file transfer is slower still (`docs/04-paths.md`).
- Live editing of anything compiled: blade layout, styles that are not in the firmware, `#define`s. Those stay in Install.

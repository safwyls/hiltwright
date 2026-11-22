// The words of the guided tour, one chapter per page in sidebar order after a short welcome. Edit freely: the engine
// (tourEngine.ts) and the overlay (Tour.tsx) take whatever is here. Each step names the page it is on (its chapter's),
// the `data-tour` attribute of the thing it points at, and anything to click first so that thing is on screen.
// A test (test/tour.test.ts) checks that every page and target named here exists in the app.
//
// Rules for the words: plain, short sentences; "style", never "look"; a few words of explanation for any term.

import type { TourChapter } from './tourEngine';

export const TOUR: TourChapter[] = [
  {
    id: 'welcome', name: 'Welcome', page: 'armory', steps: [
      {
        title: 'Welcome to Hiltwright',
        text: [
          'Hiltwright sets up a Proffieboard saber for you: its wiring, presets, styles and sound fonts. Then it builds the firmware and installs it over USB.',
          'You never touch Arduino or code. This tour shows what each page is for. It takes about five minutes.',
        ],
      },
      {
        title: 'An example saber',
        target: 'top-saber',
        text: [
          'The tour shows an example saber, so every page has something on it. It is not one of yours.',
          'Nothing is sent to a real saber or saved while the tour runs. When it ends, your own sabers are back as they were.',
        ],
      },
      {
        title: 'From plan to installed saber',
        target: 'nav-install',
        text: [
          'Install\'s numbered steps take a saber from a plan to an installed board: 1 Wiring, 2 Fonts, 3 Presets, 4 Card, 5 Build & Flash.',
          'Live, below them, changes a saber that is plugged in now. The Armory, on top, is where you pick a saber.',
        ],
      },
      {
        title: 'The Workshop and Tools',
        target: 'nav-workshop',
        text: [
          'The Workshop sits beside that path. Browse and build styles, keep your sound fonts, and try any of it in the demo room.',
          'Tools, below, has your Settings, such as the theme, and About.',
        ],
      },
      {
        title: 'Connecting a saber',
        target: 'top-status',
        text: [
          'This shows whether a saber is plugged in, and its battery. Plug a saber in with a USB data cable and Hiltwright connects by itself.',
          'Some cables only charge. If nothing happens, try another cable.',
        ],
      },
      {
        title: 'Help on every page',
        target: 'top-tour',
        text: [
          'On any page, press "Show me this page" to see just that part of this tour.',
          '"Take the tour", at the bottom left of the window, starts it again from the beginning.',
        ],
      },
    ],
  },
  {
    id: 'armory', name: 'Armory', page: 'armory', steps: [
      {
        title: 'Your sabers',
        target: 'armory-sabers',
        text: [
          'Every saber Hiltwright has seen is remembered here, plugged in or not. A saber you plug in is picked on its own.',
          'The picked saber is the one the Install steps are about. Pick another at any time, even while one is plugged in.',
        ],
      },
      {
        title: 'Plan a saber ahead',
        target: 'armory-new',
        text: [
          'No saber in your hands yet? "New saber" sets one up ahead: its wiring, presets and styles, ready to install.',
          'When you plug the real saber in, Hiltwright asks whether it is the one you planned.',
        ],
      },
      {
        title: 'Live, or a new setup',
        target: 'armory-progress',
        text: [
          '"Adjust it live" changes a plugged-in saber at once. "Change its setup" shows the five Install steps and how far this saber has got.',
          'A tick means a step is done; the bright one is next. Press a step to go to it.',
        ],
      },
    ],
  },
  {
    id: 'wiring', name: '1 Wiring', page: 'wiring', steps: [
      {
        title: 'Board, buttons and prop',
        target: 'wiring-basics',
        text: [
          'Start here with every saber. Choose the Proffieboard (its label says V2.2 or V3) and how many buttons it has.',
          'The prop file decides what each button press does, such as ignite, change preset or edit mode.',
        ],
      },
      {
        title: 'Blades',
        target: 'wiring-blades',
        text: [
          'A blade is anything the saber lights or runs on its own: the main blade, a crystal chamber, an accent LED, a motor.',
          'Set how many there are, then open each one to say which pins it is wired to. The example has a main blade and one accent.',
        ],
      },
      {
        title: 'The pin table',
        target: 'wiring-pins',
        text: [
          'Which board pins each blade uses, and any clash between them.',
          'Two blades on one power pin is allowed. Hiltwright adds the setting for it.',
        ],
      },
      {
        title: 'Check it, then confirm',
        target: 'wiring-confirm',
        text: [
          'Check every data pin and power pin against what the installer wrote down, then turn this on.',
          'Nothing is installed until you do: a wrong power pin can damage hardware. Any change to the wiring turns it off again.',
        ],
      },
    ],
  },
  {
    id: 'fonts', name: '2 Fonts', page: 'fonts', steps: [
      {
        title: 'Fonts for this saber',
        target: 'fontchoice-chosen',
        text: [
          'Choose the sound fonts this saber will carry. They are copied onto its card on the Card step.',
          'No card or saber is needed for this. Every font a preset names is on this list too.',
        ],
      },
      {
        title: 'Your font library',
        target: 'fontchoice-library',
        text: [
          'Fonts come from your font library. Add a downloaded font package or a font folder here, and it is chosen at once.',
          'Six free ProffieOS fonts come with Hiltwright: TeensySF, SmthJedi, SmthGrey, SmthFuzz, RgueCmdr and TthCrstl.',
        ],
      },
    ],
  },
  {
    id: 'presets', name: '3 Presets', page: 'presets', steps: [
      {
        title: 'Presets',
        target: 'presets-list',
        text: [
          'A preset is one setup you switch to with the buttons: a sound font, a music track, and a style for each blade.',
          'Pick a preset in the list to change it. The arrows move it up or down the list.',
        ],
      },
      {
        title: 'Kept for the next install',
        target: 'presets-state',
        text: [
          'Changes here are "staged": they wait in Hiltwright and replace the saber\'s presets at the next flash. A copy of the saber\'s own is kept first.',
          'To change a plugged-in saber right away, use Live › Presets instead.',
        ],
      },
      {
        title: 'Font and track',
        target: 'presets-fields',
        text: [
          'Click the sound font or the track to choose one: from your library with a quick listen, from the card, or a name you type.',
          'The line underneath says whether that font is on the card yet.',
        ],
      },
      {
        title: 'A style for each blade',
        target: 'presets-styles',
        text: [
          'Each blade gets a style: its colour, flicker and effects. A style already in the saber\'s firmware switches at once.',
          '"Queued" means the style is chosen but not in the firmware yet. It goes on with the next Build & Flash.',
        ],
      },
      {
        title: 'Preset sets',
        target: 'presets-sets',
        text: [
          'A set is a saved copy of a whole preset list. Save one to reuse it on another saber, or to keep a copy.',
          'Loading a set stages it: it replaces this saber\'s presets at the next install.',
        ],
      },
    ],
  },
  {
    id: 'card', name: '4 Card', page: 'card', steps: [
      {
        title: 'The card, in one trip',
        target: 'card-trip',
        text: [
          'Take the SD card out of the saber and put it in a card reader: it is found by itself. "Prepare the card" copies the fonts it lacks, puts on the voice pack and readies it for your preset list.',
          'Sharing the card over the saber\'s USB works too, but is about 30 times slower.',
        ],
      },
      {
        title: 'Everything else on the card',
        target: 'fonts-table',
        text: [
          'The same page is under Live, for a quick fix on a saber that is already flashed. Here it works on the saber picked in the Armory.',
        ],
      },
    ],
  },
  {
    id: 'build', name: '5 Build & Flash', page: 'build', steps: [
      {
        title: 'Four steps to the saber',
        target: 'build-steps',
        text: [
          'This turns the saber\'s wiring, presets and styles into firmware, and flashes it onto the saber. The Card line says whether its card is ready.',
          'Each step turns green when it is done. The bright one is next.',
        ],
      },
      {
        title: 'The compiler',
        target: 'build-compiler',
        text: [
          'The first build needs the compiler: a one-time download of about 360 MB, into Hiltwright\'s own folder.',
          'After that, a build takes about a minute, and nothing more is downloaded.',
        ],
      },
      {
        title: 'Build',
        target: 'build-build',
        text: [
          'Build makes the firmware. Queued styles are built in here.',
          'Hiltwright writes the settings file for you; you never have to read C++. The Config tab shows it, if you are curious.',
        ],
      },
      {
        title: 'Flash, with a backup first',
        target: 'build-install',
        text: [
          'Flash reads the saber\'s whole firmware into a backup file first. Then it writes the new firmware, and waits for the saber to start again.',
          'Leave the saber plugged in until it says Installed. Windows asks once for a driver the first time.',
        ],
      },
      {
        title: 'Putting the old firmware back',
        target: 'build-workspace',
        before: ['build-tab-backups'],
        text: [
          'Every backup is kept here. "Put back" writes one onto the saber exactly as it was, to undo an install.',
          'Presets and fonts on the SD card are not touched.',
        ],
      },
    ],
  },
  {
    id: 'live-presets', name: 'Live presets', page: 'live-presets', steps: [
      {
        title: 'Change a saber as it runs',
        target: 'nav-live',
        text: [
          'Live is for a saber that is already installed and plugged in. Its presets change on the saber at once, with nothing built or flashed.',
          '"Live on the saber" means a change is written to it now, and shows as saved when the saber reads it back. It works with any ProffieOS firmware.',
        ],
      },
    ],
  },
  {
    id: 'diag', name: 'Controls', page: 'diag', steps: [
      {
        title: 'Talk to the saber',
        target: 'diag-console',
        text: [
          'With a saber plugged in, this page changes its volume and brightness, plays effects, and sends ProffieOS commands.',
          'A command that restarts the saber or changes its files asks first.',
        ],
      },
      {
        title: 'Reporting a problem',
        target: 'diag-save',
        text: [
          'Something went wrong? Press "Save diagnostics". It writes one file on this computer about what happened, and sends nothing.',
          'Attach that file when you report the problem. The same button shows up when a build or install fails.',
        ],
      },
    ],
  },
  {
    id: 'live-card', name: 'Live card', page: 'live-card', steps: [
      {
        title: 'A small fix on the card',
        target: 'fonts-card',
        text: [
          '"Share the saber\'s card" lends it over the USB cable for a small fix, such as one font. It is slow: a card reader is about 30 times faster.',
          'The card shown is the one this computer can see, shared or in a reader.',
        ],
      },
      {
        title: 'Fonts on the card',
        target: 'fonts-table',
        text: [
          'Every font folder on the card, checked for the usual faults, such as a missing hum or mixed sound files.',
          '"Ready" means the saber should play it. Pick a font to see its sounds.',
        ],
      },
    ],
  },
  {
    id: 'looks', name: 'Styles', page: 'looks', steps: [
      {
        title: 'Styles',
        target: 'looks-grid',
        text: [
          'A style is what a blade does: its colour, flicker, ignition, and how it reacts to clashes and swings.',
          'Hiltwright\'s own styles are here, with any you build or paste.',
        ],
      },
      {
        title: 'On the saber, queued, or needs a build',
        target: 'looks-state',
        before: ['look-card-queued'],
        text: [
          '"On the saber": in its firmware now. "Queued": chosen for a preset, and goes on with the next build.',
          '"Needs a build": not in the saber\'s firmware yet, so a build is needed before the saber can use it.',
        ],
      },
      {
        title: 'Try it first',
        target: 'looks-detail',
        text: [
          'The preview runs the same maths as the saber. Try other colours here; nothing is sent.',
          'The colours you try go with the style when you put it on a preset.',
        ],
      },
      {
        title: 'Put it on a preset',
        target: 'looks-use',
        text: [
          'Choose a preset and a blade, then put the style in.',
          'If the saber\'s firmware has it, it switches at once. If not, it is queued for the next build.',
        ],
      },
      {
        title: 'Make your own',
        target: 'looks-new',
        text: [
          '"Build a style" opens the Style editor. "Paste style code", beside it, takes a style from the Fett263 style library or anywhere else, with its credit.',
        ],
      },
    ],
  },
  {
    id: 'editor', name: 'Style editor', page: 'editor', steps: [
      {
        title: 'Simple or Full',
        target: 'editor-mode',
        before: ['editor-simple'],
        text: [
          'Simple builds a style from a few plain blocks. Full shows every ProffieOS layer, nested however you like.',
          'You can open a Simple style in Full at any time.',
        ],
      },
      {
        title: 'Simple: blocks',
        target: 'editor-layers',
        text: [
          'A blade underneath, effects stacked on top (the top one paints over the rest), then the ignition and retraction.',
          'Each block has its own colours and sliders.',
        ],
      },
      {
        title: 'Full: every layer',
        target: 'editor-layers',
        before: ['editor-full'],
        text: [
          'Pick a layer on the left, then say what it shows, where on the blade and when.',
          'When the preview can show part of a style only roughly, a note says it is approximate. That part may differ a little on the saber.',
        ],
      },
      {
        title: 'Watch it, then save it',
        target: 'editor-preview',
        text: [
          'The blade here shows the style as you change it.',
          '"Save as a style" adds it to your Styles, ready for any preset. Saving is off during the tour.',
        ],
      },
    ],
  },
  {
    id: 'library', name: 'Font library', page: 'library', steps: [
      {
        title: 'Your font library',
        target: 'library-table',
        text: [
          'Your sound fonts, kept in one place on this computer. Add a font package as you downloaded it (.zip), or a font folder.',
          'They are copied in; your originals are left alone. These are your own fonts, not the example saber\'s.',
        ],
      },
      {
        title: 'One font up close',
        target: 'library-detail',
        before: ['library-row'],
        text: [
          'Pick a font to play its sounds, note who made it, and copy it to a card.',
          '"Demo room" lets you hear it on a blade.',
        ],
      },
    ],
  },
  {
    id: 'contributors', name: 'Contributors', page: 'contributors', steps: [
      {
        title: 'Who made what',
        target: 'contributors-list',
        text: [
          'Everyone whose work you use: font makers, style authors and hilt makers, each with a logo and a link.',
          'Names come from the fonts, styles and hilts themselves. Spell a name the same way and its work is counted together.',
        ],
      },
    ],
  },
  {
    id: 'demo', name: 'Demo room', page: 'demo', steps: [
      {
        title: 'Try before you install',
        target: 'demo-panel',
        before: ['demo-tab-blade'],
        text: [
          'Try any style with any font on a saber in a dark room, before it goes near a real one.',
          'Choose the style on the Blade tab and a font on the Sound tab.',
        ],
      },
      {
        title: 'Swing it',
        target: 'demo-deck',
        text: [
          'Ignite with Space or a double-click. Drag to swing, and scroll to twist the hilt.',
          'Clash, blast, lockup and the rest are here, each with its key. Press ? to see every control.',
        ],
      },
      {
        title: 'The scene',
        target: 'demo-scene',
        text: [
          'Set the light, the blade\'s length and thickness, and the hilt model.',
        ],
      },
    ],
  },
  {
    id: 'settings', name: 'Settings', page: 'settings', steps: [
      {
        title: 'Your settings',
        target: 'settings-theme',
        text: [
          'Your own preferences for Hiltwright, not about any one saber. Start with the theme: it sets the colours and textures of every page.',
        ],
      },
    ],
  },
  {
    id: 'about', name: 'About', page: 'about', steps: [
      {
        title: 'About',
        target: 'about-panel',
        text: [
          'The version you are running, the licence, and a link to the source of this exact build.',
        ],
      },
      {
        title: 'That is the tour',
        text: [
          'Your own sabers are back when you press Finish. Start in the Armory: plug a saber in, or press "New saber" to plan one.',
          '"Show me this page" and "Take the tour" are there whenever you need them.',
        ],
      },
    ],
  },
];

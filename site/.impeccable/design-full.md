---
name: Hiltwright website
description: A graphite bay with the app on show in each of its themes; cool white lettering and marks, one accent borrowed from the theme the visitor chose, amber for caution only.
colors:
  ground: "#121416"
  raised: "#1a1d20"
  well: "#0a0b0d"
  high: "#252a2e"
  cel: "#eef1f3"
  dim: "#c3c9ce"
  mute: "#8f979e"
  accent: "#b8141e"
  accent-hi: "#c33a42"
  accent-ink: "#fff6f4"
  warn: "#f2b23e"
  warn-hi: "#ffc960"
  good: "#a6d9a0"
  bad: "#ff9a86"
  line: "rgba(238,241,243,.14)"
  line-strong: "rgba(238,241,243,.32)"
typography:
  display:
    fontFamily: "Gloock, 'Iowan Old Style', Georgia, serif"
    fontSize: "clamp(40px, 5.6vw, 84px)"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Gloock, 'Iowan Old Style', Georgia, serif"
    fontSize: "clamp(30px, 3.6vw, 46px)"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Gloock, 'Iowan Old Style', Georgia, serif"
    fontSize: "clamp(26px, 2.6vw, 34px)"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  subhead:
    fontFamily: "'Hanken Grotesk', 'Segoe UI', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.3
  lede:
    fontFamily: "'Hanken Grotesk', 'Segoe UI', system-ui, sans-serif"
    fontSize: "clamp(18px, 1.6vw, 21px)"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "'Hanken Grotesk', 'Segoe UI', system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Hanken Grotesk', 'Segoe UI', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.6
  fine:
    fontFamily: "'Hanken Grotesk', 'Segoe UI', system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.6
  numeral:
    fontFamily: "Gloock, 'Iowan Old Style', Georgia, serif"
    fontSize: "54px"
    fontWeight: 400
    lineHeight: 1
  mono:
    fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, monospace"
    fontSize: "0.88em"
    fontWeight: 400
rounded:
  xs: "5px"
  sm: "8px"
  window: "10px"
  md: "12px"
  lg: "14px"
  pill: "999px"
spacing:
  gutter-narrow: "16px"
  gutter: "24px"
  control-gap: "12px"
  column-gap: "36px"
  split-gap: "56px"
  band-compact: "72px"
  band: "104px"
components:
  button:
    backgroundColor: "rgba(18,20,22,.42)"
    textColor: "{colors.cel}"
    rounded: "{rounded.pill}"
    padding: "11px 22px"
    height: "46px"
  button-hover:
    backgroundColor: "rgba(238,241,243,.1)"
    textColor: "{colors.cel}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.pill}"
    padding: "11px 22px"
    height: "46px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hi}"
    textColor: "{colors.accent-ink}"
  button-big:
    rounded: "{rounded.pill}"
    padding: "15px 30px"
    height: "56px"
  nav-link:
    textColor: "{colors.cel}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  nav-link-current:
    backgroundColor: "rgba(238,241,243,.16)"
    textColor: "{colors.cel}"
  nav-download:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.pill}"
    padding: "8px 18px"
  choice-pill:
    backgroundColor: "rgba(10,11,13,.55)"
    textColor: "{colors.cel}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
    height: "40px"
  choice-pill-selected:
    backgroundColor: "{colors.cel}"
    textColor: "{colors.ground}"
  key:
    backgroundColor: "{colors.well}"
    textColor: "{colors.cel}"
    rounded: "{rounded.pill}"
    padding: "9px 16px"
    height: "44px"
  field:
    backgroundColor: "{colors.well}"
    textColor: "{colors.cel}"
    rounded: "{rounded.pill}"
    padding: "9px 16px"
    height: "44px"
  window:
    backgroundColor: "{colors.well}"
    rounded: "{rounded.window}"
  deck-window:
    backgroundColor: "{colors.well}"
    rounded: "{rounded.window}"
    width: "clamp(440px, 45vw, 720px)"
  panel:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.cel}"
    rounded: "{rounded.lg}"
    padding: "24px 28px"
  callout-warning:
    backgroundColor: "rgba(242,178,62,.08)"
    textColor: "{colors.cel}"
    rounded: "{rounded.md}"
    padding: "16px 20px"
---

# Design System: Hiltwright website

This file records the public website in `site/` only. The desktop app in `apps/desktop` has its own, different theme system (ten switchable themes) and is not described here. The site shows those themes as pictures and borrows one thing from them: the accent.

## Overview

**Creative North Star: "The Graphite Bay"**

The site is a workshop bay in neutral graphite: a dark, even, colorless room where the app is the thing on show. It has no palette of its own beyond graphite and a cool white. All the color on a page comes from the app: from its ten themes shown as windows, from the theme paintings, and from one accent that the site borrows from whichever theme the visitor has chosen. Choose a theme on the home page and the primary buttons, the blade of the mark and the browser tab icon all take that theme's accent, on every page, until another is chosen.

Density is low on the promo pages (one idea per band, a picture beside most of them) and steady on the reading pages: the walkthrough keeps a painting only behind its page head, and the docs carry none and are a plain three-column reader on the same ground. Everything a visitor can press is a pill. Everything that shows the app is a rounded window with a soft, deep shadow and a hairline edge. The accent fills the primary action and nothing else, amber is kept for caution, and every small mark (underlines, dots, focus rings, progress) is cool white, so a page reads the same whichever theme lends the accent.

The home stage is the system's one piece of theater: a deck of ten app windows, one per theme, the chosen one sharp in front and the rest stepping up and to the right, each smaller, dimmer and softer. Behind the deck is a grayscale painting of a sabersmith's bench in a ship's bay, out of focus, whose one small indicator light takes the accent's hue. Elsewhere the theme paintings appear in two ways: shaded, behind a page head or the closing band, where lettering sits on them; and clear, as a full-bleed band at full strength with no lettering on it, in a tall section.

**Key Characteristics:**
- Neutral graphite ground with three tonal steps (well, raised, high) and cool white lettering; no warm darks.
- One accent, borrowed from the chosen theme and remembered across pages; a deep red when scripts are off.
- Amber means caution only: the warning card and the warning callout.
- Gloock for titles at regular weight, Hanken Grotesk for everything read or pressed.
- Pill controls with a 1.5px translucent white edge; the selected state inverts to white.
- The app is shown as a floating window, never in a device frame; on the home stage, as a deck of ten.
- Paintings are whole surfaces: shaded where lettering sits on them, clear where it does not.
- Motion is the deck's slide and a lift on scroll; both stop under reduced motion.

## Colors

A neutral graphite scale carries the page, a cool white carries the lettering and every small mark, and one borrowed accent carries intent. Token names follow the stylesheet's custom properties, with one exception: the accent is recorded here as `accent`, `accent-hi` and `accent-ink`, while the stylesheet still calls them `--lamp`, `--lamp-hi` and `--lamp-ink`, a name left over from when the accent was a fixed amber. It is no longer amber and no longer fixed. `cel` is likewise the stylesheet's name for the cool white.

### Primary
- **Theme Accent** (`accent`; `--lamp` in the stylesheet): the fill of the primary button (Get the beta), of the Download link in the top bar and of the skip link; the blade and corner ticks of the mark in the top bar and footer; the blade in the browser tab icon; and the hue of the one indicator light in the stage backdrop. The value in the frontmatter is the stylesheet's own, a deep blade red, and it shows only when scripts are off. With scripts on, a script in the head of every page replaces it with the accent of the theme the visitor chose on the home deck, or of Crait, the theme the deck opens on, when nothing has been chosen.
- **Accent Highlight** (`accent-hi`; `--lamp-hi`): the hover state of an accent fill. For a theme it is the accent mixed 16% toward white.
- **Accent Ink** (`accent-ink`; `--lamp-ink`): the only text color allowed on an accent fill. For a theme it is the light ink (`#fff6f4`) or the Well dark (`#0a0b0d`), whichever has the higher contrast against that accent.

The accents come from `site/data/themes.json`, which is the source; the build turns them into the table the head script carries. As built: Station `#86dc5f`, Scorched hull `#d9642b`, Hoth `#e8742a`, Ronin `#d8281d`, The Ninth Jedi `#f2a93e`, Coruscant at night `#ffad42`, Crait `#b8141e`, Naboo `#4fb8a3`, Kashyyyk `#f0a030`, Original `#5fd3ff`.

### Secondary
- **Caution Amber** (`warn`): caution, and nothing else. The edge (60%) and tint (8%) of the download warning card and the docs warning callout. It does not change with the theme.
- **Caution Highlight** (`warn-hi`): the heading or label of a warning.
- **Leaf Green** (`good`): done and included. Tick marks in the list of what is in the beta, and the tip callout's edge (50%), tint (7%) and label.
- **Ember** (`bad`): declared in the stylesheet for errors; nothing in the shipped stylesheet uses it yet.

### Neutral
- **Graphite Ground** (`ground`): the page, the top bar (at 86%, or 92% on the home page once scrolled) and the open mobile menu. Also the text color on a white selected pill.
- **Raised Graphite** (`raised`): alternate bands and inset panels (the blade demo's control panel, the walkthrough card, docs index cards).
- **Well** (`well`): the darkest step. Behind pictures while they load, code blocks, form fields, keys, the footer, and the base of every shade laid over a painting (`rgba(10,11,13,…)`).
- **High Graphite** (`high`): the lightest step. Inline code, keyboard keys, the search results popover, the scrollbar thumb.
- **Cel White** (`cel`): a cool white. Titles, body text, control labels, and the fill of a selected pill. Also every small mark: link text and its underline (at 50%), the focus ring, the text selection, step dots and numerals, the walkthrough progress bar, the range control, the current entry in the docs contents, strong text in docs, and the simulator's Ignite pill. Hover on a link or a white fill goes to pure white.
- **Dim** (`dim`): secondary prose: ledes, feature paragraphs, card text, nav lists at rest, the caption under a feature picture.
- **Mute** (`mute`): the quietest text: fine print, table heads, counters, placeholders, footer labels and legal, and the bullet dots of a points list.
- **Line** (`line`) and **Strong Line** (`line-strong`): Cel White at 14% and 32%. Line divides (band borders, table rows, list rows); Strong Line edges things you can touch or that float (pill borders, window hairlines, the rule above a step or card).

### Named Rules
**The Accent Follows the Theme Rule.** The site has no accent of its own. It borrows the accent of the theme the visitor chose on the home deck: an inline script in the head of every page sets the accent, its hover and its ink before anything paints, from a table the build makes out of the themes' own accents. The choice is kept in localStorage under `hw-theme` and holds on every page. Never write an accent value into a rule; use the custom properties (`--lamp`, `--lamp-hi`, `--lamp-ink`), and never assume the accent is red, or light, or dark.

**The One Accent Fill Rule.** An accent fill on a control means this is the primary action here. A group of controls carries at most one. Everything else in the group is a clear pill with a white edge.

**The Marks Are White Rule.** Anything small that points, counts or tracks is Cel White, not the accent: link underlines, step dots, the focus ring, selection, the current-page and current-chapter highlight, progress and range controls. The accent changes with the theme; the marks must not.

**The Graphite Rule.** Every dark is graphite and every light is Cel White. Shades over paintings are the Well color at an alpha, lines are Cel White at an alpha (14% and 32%), and translucent fills on controls are Ground or Well at an alpha. No warm darks, and no tint of any theme in the ground.

**The Amber Means Caution Rule.** Amber is not an accent here. It appears only on warning surfaces (the download warning card, the docs warning callout), as an 8% tint with a 60% edge and a Caution Highlight label, and it does not change with the theme. A warning never carries a solid fill. Three themes (The Ninth Jedi, Coruscant at night, Kashyyyk) have amber accents of their own; when one is chosen, the accent is still only a solid fill on a control and caution is still only a tint and an edge.

## Typography

**Display Font:** Gloock (with Iowan Old Style, Georgia, serif), one weight, self-hosted.
**Body Font:** Hanken Grotesk (with Segoe UI, system-ui, sans-serif), variable 400 to 700, self-hosted.
**Label/Mono Font:** a system monospace stack (ui-monospace, Cascadia Mono, Consolas) for code, `kbd` and nothing else.

**Character:** A high-contrast display serif at regular weight, set large and slightly tight, against a plain, friendly grotesque. The serif is the nameplate; the grotesque is the instruction sheet.

### Hierarchy
- **Display** (400, `clamp(40px, 5.6vw, 84px)`, 1.12): the one `h1` on the home stage (`clamp(34px, 9vw, 56px)` under 980px). Page heads cap it lower (`clamp(36px, 4.6vw, 64px)`, max 18ch) and docs lower still (`clamp(32px, 3.6vw, 48px)`).
- **Headline** (400, `clamp(30px, 3.6vw, 46px)`, 1.12): the `h2` that opens a band.
- **Title** (400, `clamp(26px, 2.6vw, 34px)`, 1.15): the heading beside a screenshot in a feature row; the walkthrough step title sits just under it (`clamp(24px, 2.4vw, 30px)`).
- **Subhead** (Hanken 700, 20px, 1.3): `h3` in steps and ruled cards (19px in cards), and the heading of a warning card.
- **Lede** (400, `clamp(18px, 1.6vw, 21px)`, max 60ch): the paragraph under a display title, in Dim (full Cel White on the stage).
- **Body** (400, 17px, 1.6; 16.5px under 900px): prose. Supporting paragraphs cap at 68ch, docs articles at 72ch.
- **Label** (600, 15 to 16px, sentence case): every control, nav link and small heading.
- **Fine** (400, 14 to 14.5px, Mute): fine print, captions, counters, table heads (table heads at 700).
- **Numeral** (Gloock 400, 54px, 1): the step number in a row of steps.

The site's own wording uses American spelling. App labels quoted in the docs keep the spelling the app uses.

### Named Rules
**The Sentence Case Rule.** Labels, table heads, nav group names and footer column labels are sentence case at weight 600 or 700 with no added tracking. The only uppercase, letter-spaced text on the site is the wordmark in the top bar and footer (700, 0.2em).

**The One Weight Serif Rule.** Gloock is always 400. Emphasis in a title comes from size, never from a bolder or italic cut. Headings balance their line breaks (`text-wrap: balance`).

## Layout

A centered container (max 1200px, 24px gutters, 16px under 560px) holds everything except the paintings and the stage, which bleed to the viewport edge. A narrow variant (800px) holds closing and single-column passages. A short page still fills the window: the content grows and the footer sits at the foot.

Promo pages are a stack of bands: 104px above and 96px below (72/64 under 900px), divided by a 1px Line, with alternate bands on Raised Graphite. Two containers inside one band sit 88px apart. Picture-and-text rows split 4:7 (56px gap) and alternate sides down a section: text first, then picture first, then text first again; informational splits are 6:5 or 1:1. Steps and ruled cards run three or four across with 36 to 40px between columns. Everything collapses to one column under 900px, with steps and cards passing through two columns on the way and reaching one under 560px.

A tall section (several rows of pictures and text) carries its painting as a clear full-bleed band, `clamp(240px, 48vh, 500px)` high (`clamp(180px, 34vh, 300px)` under 900px), with a 1px Line above and below. It stands under the section's heading when there is one (48px above, 80px below) and flush at the top of the section when there is not. The rows stand on Graphite Ground below it.

The home stage is the exception to the container: a full-viewport scene (`clamp(700px, 100svh, 960px)`) with absolutely placed layers. The lettering is at the left, aligned to the container edge, `min(40vw, 540px)` wide. The deck starts 64px after the lettering and runs to the right edge of the viewport; its front window is `clamp(440px, 45vw, 720px)` wide at the app's 1480:980 proportion and stands `clamp(104px, 13svh, 136px)` above the foot of the stage. The theme names run along the bottom. Under 980px the stage becomes a normal column: the lettering, then the theme names (scrolling sideways, fading at the right), then the deck at the full column width with room kept at its top and right (88px and 72px) for the five windows that peek out behind the front one; windows further back are hidden.

Reading pages use sticky side columns: docs are 240px nav, article, 200px contents (the contents drop under 1100px, the nav becomes a collapsible menu under 900px); the walkthrough is a 220px chapter list beside the picture and card, turning into a sideways-scrolling row under 900px. The top bar is 64px, sticky and blurred; on the home page it is fixed with no background, border or blur over the stage and turns solid after 40px of scroll. Its links collapse behind a Menu pill under 820px.

Touch targets are at least 40px tall on the stage, 44px in the demo and forms, 46px for buttons and 56px for big buttons.

## Elevation & Depth

Depth comes from three devices, in this order: a painting behind, a graphite shade between, and floating windows in front. The deck adds a fourth, used once: windows standing one behind another, each a step further back. Flat content (steps, ruled cards, tables, nav) has no shadow at all.

### Shadow Vocabulary
- **Deck front** (`box-shadow: 0 40px 80px rgba(0,0,0,.8), 0 10px 24px rgba(0,0,0,.55), 0 0 0 1px rgba(238,241,243,.36)`): the front window of the deck. A wide soft layer, a close dark layer and the brightest hairline on the site.
- **Deck back** (`box-shadow: 0 12px 30px rgba(0,0,0,.5), 0 0 0 1px rgba(238,241,243,.26)`): every window behind the front one. A shorter shadow and a quieter hairline, so each window's edge still shows against the one behind it.
- **Window** (`box-shadow: 0 30px 60px rgba(0,0,0,.55), 0 0 0 1px var(--line2)`): screenshots in feature rows and the walkthrough; the blade demo at `.5` alpha.
- **Inline shot** (`box-shadow: 0 18px 40px rgba(0,0,0,.45), 0 0 0 1px var(--line2)`): pictures inside docs articles.
- **Popover** (`box-shadow: 0 20px 50px rgba(0,0,0,.7)`): the docs search results, which take a 1px Strong Line border in place of the ring.
- **Primary lift** (`box-shadow: 0 8px 22px rgba(0,0,0,.4)`): under a primary button, so it reads over a painting.
- **Lettering shadow** (`text-shadow: 0 2px 24px rgba(0,0,0,.55)` on the title, tighter and darker on smaller text): lettering on the stage, and the top bar's links on the home page while the bar is clear.

### Named Rules
**The Shade Before Text Rule.** Lettering never sits on a painting at full strength. Behind a page head a shade in the Well color runs from 94% at the text side to 35% at the far side; behind the closing band, from 92% to 50%. Under 900px, where lettering runs the full width, both become even shades from top to bottom (78% to 90%, and 80% to 86%). The stage backdrop is already gray and out of focus, so its shades are lighter: 45% at the left falling to clear, 80% at the foot under the theme names, 50% at the head under the top bar, and the lettering carries a soft dark shadow; under 980px it takes one vertical shade (72%, 50%, 80%). A tall section does not put lettering on its painting at all: the painting is a clear band and the rows stand on Graphite Ground below it.

**The Hairline With Every Shadow Rule.** A floating window always pairs its soft shadow with a 1px Cel White ring (26% on a window back in the deck, 32% on a screenshot, 36% on the deck's front window). The ring, not the shadow, is what separates a dark screenshot from the dark ground.

**The One Sharp Window Rule.** On the deck only the front window is sharp and at full brightness. Each window behind it sits 30px further right and 44px further up, 3.5% smaller, 7.5% dimmer (never below 50%) and 0.45px softer (never above 2.4px). Choosing a theme deals it to the front: its window slides forward over 0.7s on `cubic-bezier(.16,1,.3,1)` while the windows that stood in front of it each move one step back, and the blur and dimming follow over 0.5s. A window under the pointer comes sharp and bright, so it can be judged before it is chosen. Where scroll-driven animation is supported the whole deck lifts 60px over the first screen of scroll. Under `prefers-reduced-motion: reduce` the windows change places without the slide and the deck does not lift.

## Shapes

Two shapes do nearly all the work. Anything pressed or typed into is a full pill (999px): buttons, nav links, theme names, jump links, keys, the search field, chapter buttons. Anything that shows the app is a 10px-cornered window with its picture clipped to the corner; the deck is ten of them.

Containers that hold text step up slightly: 12px for callouts, the warning card, docs cards and the popover; 14px for panels (the tick list, the walkthrough card, the blade demo, pager links). Small inline pieces (code, `kbd`) are 5px, docs nav rows 8px, code blocks and the select 10px. Round dots (9 to 11px) mark list items and step origins.

Edges are 1.5px Strong Line on controls and on the rule above a step or card, 1px Line for dividers. A dashed 1.5px edge marks a key that is held rather than tapped.

The mark is the one shape that is neither: the app's own icon, a square tile with two cut corners and a saber across it, redrawn in graphite and steel grays. Its blade, the glow around it and the two corner ticks are drawn in `currentColor`, which the top bar and footer set to the accent, so the mark changes with the chosen theme (over 0.4s). The browser tab icon is the same drawing with the accent written in by the head script.

## Components

### Buttons
Clear pills you can see the painting through, with a white edge; one of them filled with the accent.
- **Shape:** full pill (999px), 1.5px edge, min height 46px, 11px 22px padding, label at 600/16px. Big variant: 15px 30px, 18px, min height 56px.
- **Default:** Cel White label on Graphite Ground at 42%, Strong Line edge.
- **Primary:** accent fill and edge, Accent Ink label, Primary lift shadow. Hover goes to Accent Highlight. All three colors come from the chosen theme.
- **Hover / Active / Focus:** edge goes to full Cel White and the fill to white at 10%; pressed moves down 1px; focus is a 2px Cel White outline offset 3px (site-wide). Disabled is 40% opacity.
- **White-filled (the simulator's Ignite):** Cel White fill and edge, Graphite Ground label, no shadow; hover goes to pure white. It is the main control of the simulator, not the page's primary action, so it does not take the accent.
- **Links:** Cel White text with a 1.5px underline in white at 50% (4px offset); hover turns text and underline pure white. A standalone link at the end of a passage is the same at weight 600.

### Chips
- **Choice pills (theme names, jump links, walkthrough chapters):** pill, 600/15px, Well at 50 to 55% with a Strong Line edge; hover brightens the edge. **Selected inverts:** Cel White fill, Graphite Ground text. The same inversion marks the current docs page and the current chapter. The theme names are a radio group: one tab stop, arrow keys move the choice and bring that window forward.
- **Keys (blade demo):** pill on Well, min height 44px; pressed or held inverts to white like a selected pill; hold-type keys carry a dashed edge.

### Cards / Containers
- **Ruled card and step:** not a box. A 1.5px Strong Line rule across the top, 20px above the text, no background, no radius, no shadow. A step adds an 11px Cel White dot at the start of its rule and a Gloock numeral, and its link sits at the foot of the column.
- **Panel:** Raised Graphite (or Well at 72% over a painting), 1px Strong Line edge, 14px radius; rows inside divide with 1px Line.
- **Docs card:** Raised Graphite, 1px Line edge, 12px radius, 16px 18px padding; hover brightens the edge to Cel White.
- **Callout:** 1.5px edge, 12px radius, 16px 20px padding, white at 5%, Cel White label. Warning: Caution Amber edge at 60% and tint at 8%, Caution Highlight label. Tip: Leaf Green edge at 50% and tint at 7%.
- **Warning card (download page):** the same amber edge and tint at 22px 24px padding, with a Hanken 700/20px heading in Caution Highlight. On a page head it sits on a near-opaque graphite fill (86%) so the painting does not show through the tint.
- **Window (screenshot frame):** 10px radius, picture clipped, Well behind, Window shadow with hairline. A feature picture carries a caption strip naming the theme it is shown in (600/14.5px Dim on Well, 1px Line above), because the pictures are deliberately not all in one theme. Docs shots carry a Mute caption above a 1px Line.

### Inputs / Fields
- **Search:** pill, Well fill, 1.5px Strong Line edge, 16px text, min height 44px, Mute placeholder. Results open in a High Graphite popover (12px radius) with hits emphasized in bold pure white.
- **Select:** Well fill, 1.5px Strong Line edge, 10px radius, min height 44px. **Range:** native, `accent-color` Cel White. **Color swatch:** 32px circle with a Strong Line edge; selected gains a 2px Cel White outline offset 2px.
- **Field labels:** 600/14px Dim above the control.

### Navigation
- **Top bar:** 64px, Graphite Ground at 86% with a 10px backdrop blur and a 1px Line beneath. On the home page it has no background, border or blur until the page scrolls: the stage's own head shade and a tight text shadow carry the links, then it turns to Graphite Ground at 92% with a 1px Line. At the left, the mark (30px, blade in the accent) and the wordmark (uppercase, 700, 0.2em); at the right, pill links (600/15.5px; hover white at 12%, current page white at 16%), ending in the accent-filled Download pill.
- **Mobile (under 820px):** links hide behind a Menu pill and open as a full-width column on Graphite Ground.
- **Footer:** Well, four columns (2:1:1:1), the mark and wordmark again, Dim links, Mute sentence-case column labels (700/14px; plain paragraphs, not headings, so they stay out of the page outline), a ruled legal line.
- **Docs nav / contents:** Dim rows with 8px radius; hover white at 8%; current page inverted to white; current section in the contents turns Cel White at 700.
- **Skip link:** an accent-filled pill that appears at the top left on focus.

### The Deck (signature)
One full-viewport section on the home page: the backdrop, the lettering, the deck and a radio row of theme names. The deck is ten app windows, one per theme, each a capture of the same page of the app. The chosen theme's window is in front, sharp and at full brightness; the others stand behind it, each a step further up and to the right, smaller, dimmer and softer, under The One Sharp Window Rule. Choosing a name, clicking a window, or pressing an arrow key on the names brings that window forward and sets the site's accent to that theme's. The deck opens on Crait, or on the theme chosen last time. Without scripts the first theme stays in front.

Only the theme names are in the tab order. The windows are a pointer shortcut, out of the tab order and hidden from assistive technology, and the deck as a whole is one image whose label names the theme in front. The names follow the site's theme order, in which the themes with no painting of their own are spread apart; the deck's order is whatever the visitor's choices have made it.

The backdrop is one picture (`site/assets/stage.webp`): a grayscale painting of a sabersmith's bench in a ship's bay, out of focus. A layer over it in the accent color, blended by hue, gives its one small indicator light the accent's hue and leaves the grays alone. The theme paintings are inside the windows, not behind them.

### The Painted Head and the Clear Band
A page head or the closing band carries one theme painting behind a left-heavy Well shade (94% to 35% for heads, 92% to 50% for the closing band). Each page has its own painting; the docs have none. A tall section takes the other form: its painting is a full-bleed band with no shade and no lettering, and the rows below stand on Graphite Ground with the ordinary Window shadow, alternating sides.

## Do's and Don'ts

### Do:
- **Do** take the accent from the custom properties (`--lamp`, `--lamp-hi`, `--lamp-ink`) and let the chosen theme set them; check a new surface with a light accent (Station green, Original cyan) and a dark one (Crait red).
- **Do** keep one accent-filled button per group of controls, with Accent Ink text.
- **Do** draw small marks in Cel White: link underlines (white at 50%), step dots, the focus ring (2px Cel White, 3px offset), selection, progress.
- **Do** keep amber for caution: an 8% tint, a 60% edge and a Caution Highlight label.
- **Do** put a Well-colored shade under any lettering that sits on a painting, heaviest on the text side. In a tall section keep lettering off the painting and show it as a clear band.
- **Do** show the app as a floating window: 10px corners, deep soft shadow, 1px white hairline.
- **Do** make every pressable thing a pill with a 1.5px translucent white edge, and show the selected state by inverting to Cel White with Graphite Ground text.
- **Do** caption a feature picture with the theme it is shown in.
- **Do** set titles in Gloock 400 and everything else in Hanken Grotesk; labels in sentence case at 600.
- **Do** separate flat content with rules (1.5px above a step or card, 1px between bands) and keep it shadowless.
- **Do** give every motion a still state under `prefers-reduced-motion: reduce`.

### Don't:
- **Don't** take anything from the chosen theme but its accent. The ground stays graphite, and the shapes and type stay the site's own; the themes otherwise appear only as paintings and as captures inside windows.
- **Don't** write an accent value into a rule, and don't assume the accent is red.
- **Don't** spend the accent on anything but the primary action's fill, the skip link, the mark and the stage's indicator light: no accent underlines, dots, focus rings, progress bars or secondary buttons.
- **Don't** use amber as an accent or give a warning a solid fill.
- **Don't** bring back warm darks or cream lettering, and don't lay plain black over a painting where text sits.
- **Don't** put the app in a device frame (laptop, monitor, browser chrome).
- **Don't** use a painting as a small decorative tile; a painting is a whole surface or it is absent.
- **Don't** put more than one sharp window on the deck, and don't put the deck's windows in the tab order.
- **Don't** set uppercase, letter-spaced labels; the wordmark is the only one.
- **Don't** embolden or italicize Gloock.
- **Don't** box the ruled cards and steps, and don't put shadows on flat content.

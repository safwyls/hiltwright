---
name: Hiltwright website
description: Painted planes with the app on the nearest one; deep umber ground, cel-white lettering and marks, lamp amber for the primary action and for caution.
colors:
  ground: "#17110c"
  raised: "#211911"
  well: "#0e0a07"
  high: "#2c2218"
  cel: "#f6efe2"
  dim: "#d3c9b6"
  mute: "#a99e86"
  lamp: "#f2b23e"
  lamp-hi: "#ffc960"
  lamp-ink: "#231500"
  good: "#a6d9a0"
  bad: "#ff9a86"
  line: "rgba(246,239,226,.14)"
  line-strong: "rgba(246,239,226,.32)"
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
    backgroundColor: "rgba(23,17,12,.42)"
    textColor: "{colors.cel}"
    rounded: "{rounded.pill}"
    padding: "11px 22px"
    height: "46px"
  button-hover:
    backgroundColor: "rgba(246,239,226,.1)"
    textColor: "{colors.cel}"
  button-primary:
    backgroundColor: "{colors.lamp}"
    textColor: "{colors.lamp-ink}"
    rounded: "{rounded.pill}"
    padding: "11px 22px"
    height: "46px"
  button-primary-hover:
    backgroundColor: "{colors.lamp-hi}"
    textColor: "{colors.lamp-ink}"
  button-big:
    rounded: "{rounded.pill}"
    padding: "15px 30px"
    height: "56px"
  nav-link:
    textColor: "{colors.cel}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  nav-link-current:
    backgroundColor: "rgba(246,239,226,.16)"
    textColor: "{colors.cel}"
  choice-pill:
    backgroundColor: "rgba(14,10,7,.55)"
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

This file records the public website in `site/` only. The desktop app in `apps/desktop` has its own, different theme system (ten switchable themes) and is not described here; the site wears none of those themes and shows them only as pictures.

## Overview

**Creative North Star: "Painted Planes"**

The site is a multiplane animation stand. Background paintings are the large surfaces, lettering sits in front of them as if inked on a clear cel, and the app itself always appears as a floating window on the nearest plane. The ground between paintings is deep umber, warm and nearly black, so that a painting never has to compete with a neutral page: where there is no picture there is only dark, warm quiet.

Density is low on the promo pages (one idea per band, a picture beside most of them) and steady on the reading pages (docs and walkthrough), which drop the paintings below the page head and become a plain three-column reader on the same ground. Everything a visitor can press is a pill. Everything that shows the app is a rounded window with a soft, deep shadow and a hairline edge. Lamp amber is the single accent: it fills the primary action and tints a warning, and nothing else. Every small mark (underlines, dots, focus rings, progress) is cel.

The home stage is the system's one piece of theatre: one painting fills the screen, the other themes stand at the right as slanted slices of their own paintings, and choosing one racks focus to it. Other pages reuse the idea at rest: a page head or a closing band carries one painting, held back by a Well shade so the lettering reads, and a tall section opens with its painting as a clear band at full strength, with no lettering on it.

**Key Characteristics:**
- Deep umber ground with three tonal steps (well, raised, high); no neutral grey anywhere.
- Paintings are surfaces, not decoration: full-bleed, always under a Well shade where text sits on them.
- Gloock for titles at regular weight, Hanken Grotesk for everything read or pressed.
- Pill controls with a 1.5px translucent cel edge; selected state inverts to cel white.
- One accent, lamp amber: the primary action's fill and the caution tint. Links, dots, focus rings and progress are cel.
- The app is shown as a floating window, never in a device frame.
- Motion is focus and drift, and all of it stops under reduced motion.

## Colors

A warm, near-black umber scale carries the page, a warm paper white carries the lettering, and a single lamp amber carries intent.

### Primary
- **Lamp Amber** (`lamp`): the fill of the primary button (Get the beta) and of the Download link in the top bar. Its only other use is caution: the edge (60%) and tint (8%) of the download warning card and the docs warning callout.
- **Lamp Highlight** (`lamp-hi`): hover state of a lamp fill, and the heading or label of a warning.
- **Lamp Ink** (`lamp-ink`): the only text colour allowed on a lamp fill.

### Secondary
- **Leaf Green** (`good`): done and included. Tick marks in the "what is in the beta" list and the tip callout edge and label.
- **Ember** (`bad`): declared in the stylesheet for errors; nothing in the shipped stylesheet uses it yet.

### Neutral
- **Umber Ground** (`ground`): the page. Also the text colour on a cel-white selected pill.
- **Raised Umber** (`raised`): alternate bands and inset panels (the blade demo's control panel, the walkthrough card, docs index cards).
- **Well** (`well`): the darkest step. Behind pictures while they load, code blocks, form fields, keys, the footer, and the base of every shade laid over a painting (`rgba(14,10,7,…)`).
- **High Umber** (`high`): the lightest step. Inline code, keyboard keys, the search results popover.
- **Cel White** (`cel`): titles, body text, control labels, and the fill of a selected pill. Also every small mark: link text and its underline (cel at 50%), the focus ring, the text selection, step dots and numerals, the walkthrough progress bar, the range control, the current entry in the docs contents, strong text in docs, and the simulator's Ignite pill. Hover on a link or a cel fill goes to pure white.
- **Dim Cel** (`dim`): secondary prose: ledes, feature paragraphs, card text, nav lists at rest, the caption under a feature picture.
- **Mute** (`mute`): the quietest text: fine print, table heads, counters, placeholders, footer labels and legal, and the bullet dots of a points list.
- **Line** (`line`) and **Strong Line** (`line-strong`): cel white at 14% and 32%. Line divides (band borders, table rows, list rows); Strong Line edges things you can touch or that float (pill borders, window hairlines, the rule above a step or card).

### Named Rules
**The One Lamp Rule.** A lamp-amber fill on a control means "this is the primary action here". A group of controls carries at most one. Everything else in the group is a clear cel tab.

**The Marks Are Cel Rule.** Anything small that points, counts or tracks is cel, not lamp: link underlines, step dots, the focus ring, selection, the current-section highlight, progress and range controls. If a mark is amber, it is competing with the download button.

**The Warm Dark Rule.** Every dark is umber and every light is cel. Shades over paintings are the Well colour at an alpha, never plain black over text; lines are cel white at an alpha, never grey.

**The Amber Means Caution Too Rule.** Warning surfaces (the download warning card, the docs warning callout) use the same lamp hue as an 8% tint with a 60% edge. The stylesheet's `--warn` is the same value as `--lamp`. This is a deliberate second job for the hue, the only one, and it widens the direction contract's "primary action only": the solid *fill* stays reserved for the action, the tint and edge mean caution. A warning never carries a lamp fill.

## Typography

**Display Font:** Gloock (with Iowan Old Style, Georgia, serif), one weight, self-hosted.
**Body Font:** Hanken Grotesk (with Segoe UI, system-ui, sans-serif), variable 400 to 700, self-hosted.
**Label/Mono Font:** a system monospace stack (ui-monospace, Cascadia Mono, Consolas) for code, `kbd` and nothing else.

**Character:** A high-contrast display serif at regular weight, set large and slightly tight, against a plain, friendly grotesque. The serif is the title card; the grotesque is the instruction sheet.

### Hierarchy
- **Display** (400, `clamp(40px, 5.6vw, 84px)`, 1.12): the one `h1` on the home stage. Page heads cap it lower (`clamp(36px, 4.6vw, 64px)`, max 18ch) and docs lower still (`clamp(32px, 3.6vw, 48px)`).
- **Headline** (400, `clamp(30px, 3.6vw, 46px)`, 1.12): the `h2` that opens a band.
- **Title** (400, `clamp(26px, 2.6vw, 34px)`, 1.15): the heading beside a screenshot in a feature row; the walkthrough step title sits just under it.
- **Subhead** (Hanken 700, 20px, 1.3): `h3` in steps and ruled cards (19px in cards).
- **Lede** (400, `clamp(18px, 1.6vw, 21px)`, max 60ch): the paragraph under a display title, in Dim Cel (full Cel White on the stage).
- **Body** (400, 17px, 1.6; 16.5px under 900px): prose. Supporting paragraphs cap at 68ch, docs articles at 72ch.
- **Label** (600, 15 to 16px, sentence case): every control, nav link and small heading.
- **Fine** (400, 14 to 14.5px, Mute): fine print, captions, counters, table heads (table heads at 700).
- **Numeral** (Gloock 400, 54px, 1): the step number in a travelled path.

### Named Rules
**The Sentence Case Rule.** Labels, table heads, nav group names and footer column labels are sentence case at weight 600 or 700 with no added tracking. The only uppercase, letter-spaced text on the site is the wordmark in the top bar and footer (700, 0.2em).

**The One Weight Serif Rule.** Gloock is always 400. Emphasis in a title comes from size, never from a bolder or italic cut. Headings balance their line breaks (`text-wrap: balance`).

## Layout

A centred container (max 1200px, 24px gutters, 16px under 560px) holds everything except the paintings, which bleed to the viewport edge. A narrow variant (800px) holds closing and single-column passages.

Promo pages are a stack of bands: 104px above and 96px below (72/64 under 900px), divided by a 1px Line, with alternate bands on Raised Umber. Two containers inside one band sit 88px apart. Picture-and-text rows split 4:7 (56px gap) and alternate sides down a section: text first, then picture first, then text first again; informational splits are 6:5 or 1:1. Steps and ruled cards run three or four across with 36 to 40px between columns. Everything collapses to one column under 900px, with steps and cards passing through two columns on the way and reaching one under 560px.

The home stage is the exception to the container: a full-viewport scene (`clamp(700px, 100svh, 960px)`) with absolutely placed layers, lettering on the left 40vw (max 540px) aligned to the container edge, the app window (`clamp(420px, 41vw, 660px)`) starting 24px after the lettering and reaching over the slices, and the theme names along the bottom. The slices are 5vw wide (40 to 84px) and lean 6.4vw (48 to 110px); the whole stack sits one lean in from the right edge so no slice is cut off at the top. Under 980px it becomes a normal column: the other planes stand as a 76px-high slanted band directly under the top bar, then the lettering, then the theme names (scrolling sideways, fading at the right), then the window, with the front painting behind all of it.

Reading pages use sticky side columns: docs are 240px nav, article, 200px contents (contents drop under 1100px, nav becomes a collapsible menu under 900px); the walkthrough is a 220px chapter list beside the picture and card. The top bar is 64px, sticky and blurred; on the home page it has no background, border or blur over the stage and turns solid after 40px of scroll. Its links collapse behind a "Menu" pill under 820px.

Touch targets are at least 40px tall in the stage, 44px in the demo and forms, 46px for buttons and 56px for big buttons.

## Elevation & Depth

Depth is the subject. It comes from three devices, in this order: paintings behind, a directional shade between, and floating windows in front. Flat content (steps, ruled cards, tables, nav) has no shadow at all.

### Shadow Vocabulary
- **Stage window** (`box-shadow: 0 34px 70px rgba(0,0,0,.62), 0 0 0 1px rgba(246,239,226,.22)`): the app window on the home stage.
- **Window** (`box-shadow: 0 30px 60px rgba(0,0,0,.55), 0 0 0 1px var(--line2)`): screenshots in feature rows and the walkthrough; the blade demo at `.5` alpha.
- **Inline shot** (`box-shadow: 0 18px 40px rgba(0,0,0,.45), 0 0 0 1px var(--line2)`): pictures inside docs articles.
- **Popover** (`box-shadow: 0 20px 50px rgba(0,0,0,.7)`): the docs search results.
- **Lamp lift** (`box-shadow: 0 8px 22px rgba(0,0,0,.4)`): under a primary button, so it reads over a painting.
- **Cel shadow** (`text-shadow: 0 2px 24px rgba(0,0,0,.55)` on the title, tighter and darker on smaller text): lettering on the stage only.

### Named Rules
**The Shade Before Text Rule.** Lettering never sits directly on a painting. A linear shade in the Well colour runs from 92 to 94% at the text side to 35 to 50% at the far side (on the stage: 93%, 80% at 36%, clear by 64%, plus a foot and a head shade for the names and the top bar). A tall section does not put lettering on its painting at all: the painting is a clear band (`clamp(240px, 48vh, 500px)` high; `clamp(180px, 34vh, 300px)` under 900px) and the rows stand on Umber Ground below it. Under 980px the stage shade becomes vertical (78% to 70% to 92%). Under 900px, where lettering runs the full width, a page head and a closing scene also take an even shade (78% to 90% and 80% to 86%), and fine print on a page head steps up from Mute to Dim Cel.

**The Hairline With Every Shadow Rule.** A floating window always pairs its soft shadow with a 1px cel-white ring. The ring, not the shadow, is what separates a dark screenshot from the dark ground.

**The Rack Focus Rule.** Planes change by focus, not by sliding content: the incoming plane sharpens from a 16px blur over 0.9s on `cubic-bezier(.16,1,.3,1)` while slices re-seat, and the window cross-fades (0.35s). A theme with no painting comes to rest out of focus (10px blur, dimmed to 72%) because its plane is its own app capture and the sharp copy is in the window. On scroll, planes drift at different speeds and the stage window lifts 60px where scroll-driven animation is supported. State changes on controls take 0.2s. Under `prefers-reduced-motion: reduce` all of it holds still.

## Shapes

Two shapes do nearly all the work. Anything pressed or typed into is a full pill (999px): buttons, nav links, theme names, jump links, keys, the search field, chapter buttons. Anything that shows the app is a 10px-cornered window with its picture clipped to the corner.

Containers that hold text step up slightly: 12px for callouts, the warning card, docs cards and the popover; 14px for panels (the tick list, the walkthrough card, the blade demo, pager links). Small inline pieces (code, `kbd`) are 5px, docs nav rows 8px. Round dots (9 to 11px) mark list items and step origins.

Edges are 1.5px Strong Line on controls and on the rule above a step or card, 1px Line for dividers. A dashed 1.5px edge marks a key that is held rather than tapped. The slanted slice (a parallelogram cut with `clip-path`, 40 to 84px wide, leaning 48 to 110px over the stage height; 76px high and leaning 18px in the narrow band) belongs to the home stage alone.

## Components

### Buttons
Clear cel tabs: a pill you can see the painting through, with a painted edge.
- **Shape:** full pill (999px), 1.5px edge, min height 46px, 11px 22px padding, label at 600/16px. Big variant: 15px 30px, 18px, min height 56px.
- **Default:** Cel White label on Umber Ground at 42%, Strong Line edge.
- **Primary:** Lamp Amber fill and edge, Lamp Ink label, Lamp lift shadow. Hover goes to Lamp Highlight.
- **Hover / Active / Focus:** edge goes to full Cel White and the fill to cel at 10%; pressed moves down 1px; focus is a 2px Cel White outline offset 3px (site-wide). Disabled is 40% opacity.
- **Cel-filled (the simulator's Ignite):** Cel White fill and edge, Umber Ground label, no shadow; hover goes to pure white. It is the main control of the simulator, not the page's primary action, so it does not take the lamp.
- **Links:** Cel White text with a 1.5px underline in cel at 50% (4px offset); hover turns text and underline pure white. A standalone "more" link is the same at weight 600.

### Chips
- **Choice pills (theme names, jump links, walkthrough chapters):** pill, 600/15px, Well at 50 to 55% with a Strong Line edge; hover brightens the edge. **Selected inverts:** Cel White fill, Umber Ground text. The same inversion marks the current docs page and the current chapter.
- **Keys (blade demo):** pill on Well, min height 44px; pressed or held inverts to cel like a selected pill; hold-type keys carry a dashed edge.

### Cards / Containers
- **Ruled card and step:** not a box. A 1.5px Strong Line rule across the top, 20px above the text, no background, no radius, no shadow. A step adds an 11px Cel White dot at the start of its rule and a Gloock numeral.
- **Panel:** Raised Umber (or Well at 72% over a painting), 1px Strong Line edge, 14px radius; rows inside divide with 1px Line.
- **Docs card:** Raised Umber, 1px Line edge, 12px radius, 16px 18px padding; hover brightens the edge to Cel White.
- **Callout:** 1.5px edge, 12px radius, 16px 20px padding, cel at 5%, Cel White label. Warning: lamp edge at 60% and tint at 8%, Lamp Highlight label. Tip: Leaf Green edge at 50% and tint at 7%.
- **Window (screenshot frame):** 10px radius, picture clipped, Well behind, Window shadow with hairline. A feature picture carries a caption strip naming the theme it is shown in ("Shown in the … theme": 600/14.5px Dim Cel on Well, 1px Line above), because the pictures are deliberately not all in one theme. Docs shots carry a Mute caption above a 1px Line.

### Inputs / Fields
- **Search:** pill, Well fill, 1.5px Strong Line edge, 16px text, min height 44px, Mute placeholder. Results open in a High Umber popover (12px radius) with hits emphasised in bold pure white.
- **Select:** Well fill, 1.5px Strong Line edge, 10px radius, min height 44px. **Range:** native, `accent-color` cel. **Colour swatch:** 32px circle with a Strong Line edge; selected gains a 2px Cel White outline offset 2px.
- **Field labels:** 600/14px Dim Cel above the control.

### Navigation
- **Top bar:** 64px, Umber Ground at 86% with a 10px backdrop blur and a 1px Line beneath. On the home page it has no background, border or blur until the page scrolls: the stage's own head shade and a tight text shadow carry the links, then it turns to Umber Ground at 92% with a 1px Line. Wordmark at left (icon plus uppercase tracked name), pill links at right (600/15.5px; hover cel at 12%, current page cel at 16%), ending in the lamp-filled Download pill.
- **Mobile (under 820px):** links hide behind a "Menu" pill and open as a full-width column on Umber Ground.
- **Footer:** Well, four columns (2:1:1:1), Dim Cel links, Mute sentence-case column labels (700/14px; plain paragraphs, not headings, so they stay out of the page outline), a ruled legal line.
- **Docs nav / contents:** Dim Cel rows with 8px radius; hover cel at 8%; current page inverted to cel; current section in the contents turns Cel White at 700.

### The Stage (signature)
One full-viewport section: a front plane filling the scene, the other themes as slanted slices stacked at the right edge (dimmed to 82% brightness, brightening on hover or focus), a shade, the lettering cel, the app window, and a radio row of theme names. Choosing a slice or a name racks focus to that plane and swaps the window to that theme's capture. The slices and the row of names share one order, so a name sits where its slice does. A theme with no painting uses its own app capture as its plane: softly blurred (3px) as a slice, further out of focus (10px, dimmed) when in front; the build spreads these evenly through the order. The window overlaps the first slices rather than stopping short of them. Used once, on the home page.

### The Painted Head and Scene
A page head or a closing band with one painting behind a left-heavy Well shade (94% to 35% for heads, 92% to 50% for scenes). A tall section (several rows of pictures and text) takes the deep variant: its painting is a full-bleed band with no shade and no lettering, under the section's heading when it has one, and the rows below stand on Umber Ground with the ordinary Window shadow. Each page has its own painting. This is the stage at rest and the way paintings appear anywhere off the home page.

## Do's and Don'ts

### Do:
- **Do** put a Well-coloured shade under any lettering that sits on a painting: heaviest on the text side. In a tall section keep lettering off the painting and show it as a clear band.
- **Do** show the app as a floating window: 10px corners, deep soft shadow, 1px cel hairline.
- **Do** make every pressable thing a pill with a 1.5px translucent cel edge, and show "selected" by inverting to Cel White with Umber Ground text.
- **Do** keep one lamp-filled button per group of controls, with Lamp Ink text.
- **Do** draw small marks in cel: link underlines (cel at 50%), step dots, the focus ring (2px Cel White, 3px offset), selection, progress.
- **Do** caption a feature picture with the theme it is shown in.
- **Do** set titles in Gloock 400 and everything else in Hanken Grotesk; labels in sentence case at 600.
- **Do** separate flat content with rules (1.5px above a step or card, 1px between bands) and keep it shadowless.
- **Do** give every motion a still state under `prefers-reduced-motion: reduce`.

### Don't:
- **Don't** dress the site in any one app theme. The themes appear as paintings and as captures inside windows, nothing else.
- **Don't** put the app in a device frame (laptop, monitor, browser chrome).
- **Don't** use a painting as a small decorative tile on a neutral page; a painting is a whole surface or it is absent.
- **Don't** spend lamp amber on anything but the primary action's fill and a warning's tint and edge: no amber underlines, dots, focus rings, progress bars or secondary buttons.
- **Don't** introduce a second accent hue for actions, or grey neutrals, or plain black shades over text.
- **Don't** set uppercase, letter-spaced labels; the wordmark is the only one.
- **Don't** embolden or italicise Gloock.
- **Don't** box the ruled cards and steps, and don't put shadows on flat content.

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

<!-- impeccable:design-map -->
Name: Hiltwright website
Colors: primary: accent #b8141e; secondary: warn #f2b23e; neutral: ground #121416; primary: accent-hi #c33a42; primary: accent-ink #fff6f4; secondary: warn-hi #ffc960; secondary: good #a6d9a0 (+9 more in the sidecar)
Fonts: Gloock (display, headline, title, numeral); Hanken Grotesk (subhead, lede, body, label, fine); ui-monospace (mono)
Spacing: gutter-narrow 16px, gutter 24px, control-gap 12px, column-gap 36px, split-gap 56px, band-compact 72px, band 104px
Radius: xs 5px, sm 8px, window 10px, md 12px, lg 14px, pill 999px
North Star: "The Graphite Bay"
Rules:
- The Accent Follows the Theme Rule. The site has no accent of its own.
- The One Accent Fill Rule. An accent fill on a control means this is the primary action here.
- (+8 more)
Elevation:
- Deck front: 0 40px 80px rgba(0,0,0,.8), 0 10px 24px rgba(0,0,0,.55), 0 0 0 1px rgba(238,241,243,.36)
- Deck back: 0 12px 30px rgba(0,0,0,.5), 0 0 0 1px rgba(238,241,243,.26)
- Window: 0 30px 60px rgba(0,0,0,.55), 0 0 0 1px var(--line2)
- Inline shot: 0 18px 40px rgba(0,0,0,.45), 0 0 0 1px var(--line2)
- Popover: 0 20px 50px rgba(0,0,0,.7)
- Primary lift: 0 8px 22px rgba(0,0,0,.4)
- Lettering shadow: text-shadow: 0 2px 24px rgba(0,0,0,.55)
Don't:
- Don't take anything from the chosen theme but its accent.
- Don't write an accent value into a rule, and don't assume the accent is red.
- Don't spend the accent on anything but the primary action's fill, the skip link, the mark and the stage's indicator light: no accent underlines, dots, focus rings, progress bars or secondary buttons.
- Don't use amber as an accent or give a warning a solid fill.
- Don't bring back warm darks or cream lettering, and don't lay plain black over a painting where text sits.
- Don't put the app in a device frame (laptop, monitor, browser chrome).
- Don't use a painting as a small decorative tile; a painting is a whole surface or it is absent.
- Don't put more than one sharp window on the deck, and don't put the deck's windows in the tab order.
- Don't set uppercase, letter-spaced labels; the wordmark is the only one.
- Don't embolden or italicize Gloock.
- Don't box the ruled cards and steps, and don't put shadows on flat content.
Full: .impeccable/design-full.md (read a section when you need its detail)

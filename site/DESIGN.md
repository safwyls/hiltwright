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

<!-- impeccable:design-map -->
Name: Hiltwright website
Colors: primary: lamp #f2b23e; secondary: good #a6d9a0; neutral: ground #17110c; primary: lamp-hi #ffc960; primary: lamp-ink #231500; secondary: bad #ff9a86; neutral: raised #211911 (+7 more in the sidecar)
Fonts: Gloock (display, headline, title, numeral); Hanken Grotesk (subhead, lede, body, label, fine); ui-monospace (mono)
Spacing: gutter-narrow 16px, gutter 24px, control-gap 12px, column-gap 36px, split-gap 56px, band-compact 72px, band 104px
Radius: xs 5px, sm 8px, window 10px, md 12px, lg 14px, pill 999px
North Star: "Painted Planes"
Rules:
- The One Lamp Rule. A lamp-amber fill on a control means "this is the primary action here".
- The Marks Are Cel Rule. Anything small that points, counts or tracks is cel, not lamp: link underlines, step dots, the focus ring, selection, the current-section highlight, progress and range controls.
- The Warm Dark Rule. Every dark is umber and every light is cel.
- The Amber Means Caution Too Rule. Warning surfaces (the download warning card, the docs warning callout) use the same lamp hue as an 8% tint with a 60% edge.
- The Sentence Case Rule. Labels, table heads, nav group names and footer column labels are sentence case at weight 600 or 700 with no added tracking.
- (+4 more)
Elevation:
- Stage window: 0 34px 70px rgba(0,0,0,.62), 0 0 0 1px rgba(246,239,226,.22)
- Window: 0 30px 60px rgba(0,0,0,.55), 0 0 0 1px var(--line2)
- Inline shot: 0 18px 40px rgba(0,0,0,.45), 0 0 0 1px var(--line2)
- Popover: 0 20px 50px rgba(0,0,0,.7)
- Lamp lift: 0 8px 22px rgba(0,0,0,.4)
- Cel shadow: text-shadow: 0 2px 24px rgba(0,0,0,.55)
Don't:
- Don't dress the site in any one app theme.
- Don't put the app in a device frame (laptop, monitor, browser chrome).
- Don't use a painting as a small decorative tile on a neutral page; a painting is a whole surface or it is absent.
- Don't spend lamp amber on anything but the primary action's fill and a warning's tint and edge: no amber underlines, dots, focus rings, progress bars or secondary buttons.
- Don't introduce a second accent hue for actions, or grey neutrals, or plain black shades over text.
- Don't set uppercase, letter-spaced labels; the wordmark is the only one.
- Don't embolden or italicise Gloock.
- Don't box the ruled cards and steps, and don't put shadows on flat content.
Full: .impeccable/design-full.md (read a section when you need its detail)

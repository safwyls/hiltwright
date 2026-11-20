# The Hiltwright website

Promo pages, the walkthrough and the user docs. Plain HTML, CSS and a little JavaScript, built by `build.mjs` into `site/dist` and published with GitHub Pages by `.github/workflows/pages.yml` on every push to `main` that touches it.

```bash
cd site
npm install
npm run dev       # build, then serve on http://localhost:4173
npm run build     # build only; fails on a broken link or a missing picture
npm run hilt      # redraw the hilt beside the live blade (assets/hilt.png) from the demo room's model
npm run capture   # retake the screenshots and the tour's words (needs `npm install` at the repo root)
```

| Path | What |
|---|---|
| `src/pages/*.html` | The promo pages: home, features, walkthrough, download, 404. Page content only; `build.mjs` adds the header and footer. |
| `content/docs/*.md` | The docs, one page per file. The frontmatter gives the title, the summary, the section and the order in the sidebar. |
| `docs/install-guide.md`, `docs/release-notes-beta-12.md` (repo root) | Shown in the docs as they are, so there is one copy of each. |
| `src/blade-demo.ts` | The live blade on the home page. It bundles the app's own simulator from `packages/core/src/sim.ts`. |
| `assets/shots/`, `data/tour.json` | Screenshots and the tour's words, written by `scripts/capture.mjs` from the app's guided tour. Retake them when the app's pages or `tourSteps.ts` change. |
| `assets/site.css` | All the styling. The site has its own design, recorded in `DESIGN.md`; it wears none of the app's themes. |
| `assets/themes/`, `assets/feature/`, `data/themes.json`, `data/feature.json` | The Armory in every theme and the feature rows' pictures, also written by `scripts/capture.mjs`. The theme paintings come from the app at build time. |

In the docs, a blockquote starting with `**Note:**`, `**Tip:**` or `**Warning:**` becomes a callout, and `![alt](shots/clean-14.png)` shows a screenshot with its alt text as the caption.

One-time setup on GitHub: Settings, Pages, Source: "GitHub Actions". The site is published at hiltwright.com (the custom domain set in the same Pages settings).

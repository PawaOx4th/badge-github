# AGENTS.md

## What this is

Manifest V3 browser extension (Chrome + Firefox) that injects a one-row
toolbar of status badges above GitHub comment boxes. Click an option →
inser[...]

Single dev dependency: **esbuild** (no React, no bundler config file — build
logic lives in `build-manifests.js`).

## Commands

```bash
npm install                # one-time, installs esbuild
npm run build              # builds BOTH Chrome and Firefox (dev mode, no minify)
npm run build:chrome       # Chrome only
npm run build:firefox      # Firefox only
npm run icons              # regenerate icons (only if changing `scripts/gen-icons.js`)
```

**Production / minified build** — there is **no npm script** for this. Run
esbuild directly:

```bash
node build-manifests.js prod        # both browsers, minified
node build-manifests.js chrome prod # Chrome only, minified
```

Output lands in `build/chrome/` and `build/firefox/`. Both are gitignored.

## Loading the extension

- **Chrome:** `chrome://extensions` → Developer mode → "Load unpacked" → `build/chrome/`
- **Firefox:** `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on..." → `build/firefox/manifest.json`

After editing `src/`, re-run the build **and** reload the extension in the
browser. Source changes are not picked up automatically.

## Project layout

```
manifest-base.json     MV3 manifest shared by both browsers
build-manifests.js     build script (esbuild + manifest templating) — READ THIS
src/
  content.js           entrypoint; imports from ./content/
  background.js        copied as-is (no bundling)
  style.css            copied as-is
  content/
    platform.js        GitHub textarea selectors, marker class, storage facade
    badges.js          OPTIONS list, badge-markdown builder, toolbar render
docs/superpowers/      design specs, plans, handoffs (read before changing design)
```

## Build quirks (non-obvious)

- **Only `src/content.js` is bundled** by esbuild. `src/background.js` and
  `src/style.css` are **copied as-is** into the build output.
- Default `buildMode` is `"dev"` (unminified). Pass `prod` as a CLI arg to
  minify. There is **no npm script** wrapping this.
- `build-manifests.js` wipes `build/chrome/` and `build/firefox/` on every
  run (`fs.rmSync(..., { recursive: true, force: true })`) — safe to delete
  them by hand if a build is half-finished.
- Chrome adds `background.service_worker` (type module); Firefox adds
  `background.scripts` + `browser_specific_settings.gecko.id`. Both are
  generated from `manifest-base.json` — do not edit the generated files.

## Adding a new badge option

Edit **one place**: `src/content/badges.js` → `OPTIONS` array. The insert /
replace / toggle / state-detection logic is generic and picks up new entries
automatically. Update `README.md`'s badge table to match.

For a badge that needs a date stamp (see `In Review` / `Approve`), add a
`dynamicText: (date) => \`Label - ${formatDateTime(date)}\`` field. Without
it, the label and alt text are identical.

## Constraints

- No test suite. Verification is **manual smoke test only** (see spec at
  `docs/superpowers/specs/2026-10-01-badge-github-design.md`). Open a PR
  on github.com, click each button, confirm insert / replace / toggle-off.
- No linter, no formatter config, no typecheck. Match the surrounding style.
- Extension runs **only on `github.com`**, and **excludes `/login*`** (see
  `manifest-base.json`).
- `chrome.storage` permission is **reserved for future use**; not consumed
  anywhere in the current code.
- No settings UI, no popup, no GitLab support, no Slack integration — these
  are deliberate non-goals (see spec).

## Where to look first when something breaks

1. `build-manifests.js` — if the build is wrong, the issue is almost always
   here (esbuild config, manifest generation, file copy order).
2. `src/content/platform.js` — if the toolbar isn't appearing, the GitHub
   textarea selectors are probably stale (GitHub ships class-hash changes
   frequently).
3. `src/content/badges.js` — if badges insert but behave wrong, the
   `LEADING_BADGE_REGEX` / `applyOption` logic is the suspect.
4. `src/content.js` — SPA URL-change handling and MutationObserver live
   here; GitHub's navigation model changes will require updates.

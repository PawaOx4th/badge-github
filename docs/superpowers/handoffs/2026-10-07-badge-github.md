# Handoff — badge-github

**Date:** 2026-10-07
**Repo:** `/Users/pawaox4th/Desktop/PawaOx4th/me/badge-github`
**Remote:** `git@pawaox4th.github.com:PawaOx4th/badge-github.git` (SSH, `gh` authed as `PawaOx4th`)
**Branch:** `main` — clean, up to date with `origin/main` at `84f400c`

## What this project is

Chrome + Firefox Manifest V3 extension. Injects a one-row toolbar of status
badge buttons above every GitHub comment box; a click inserts a shields.io
Markdown badge at the top of the comment. Source of truth for behaviour and
usage: `README.md` (Thai). Original design spec + plan are historical:
`docs/superpowers/specs/2026-10-01-badge-github-design.md` and
`docs/superpowers/plans/2026-10-01-badge-github.md` (not updated per change).

## Work completed this session

1. **feat(badges)** — commit `84f400c` (pushed to `origin/main`). Changed the
   badge row from 5 to 6 options:
   `Solved · Skip · In Review · Request Change · Comment · Approve`.
   - `In Review` (#F59E0B) and `Approve` (#3B82F6) now stamp click time as
     `In Review - DD/MM/YYYY HH:mm` / `Approve - DD/MM/YYYY HH:mm`.
   - Added `Request Change` (#DC2626) and `Comment` (#8B5CF6).
   - Removed standalone `Date Time` and the non-dated `Approved`/`In Review`.
   - `escapeBadgeText()` now escapes `-` → `--` (shields.io field separator)
     so dated labels render. Diff is the commit; do not restate it here.
2. **Release v0.1.0** — published at
   https://github.com/PawaOx4th/badge-github/releases/tag/v0.1.0
   Assets: `badge-github-chrome-v0.1.0.zip`, `badge-github-firefox-v0.1.0.zip`
   (prod/minified builds; zip root = extension root). Tag synced locally.

Verification performed: `node build-manifests.js prod` succeeds; badge
functions exercised in Node against a fixed date; generated shields.io URLs
return HTTP 200 and the dated title renders correctly.

## Gotchas / conventions

- `build/` and `node_modules/` are gitignored. Release artifacts are zipped
  build output attached to a GitHub Release — never committed. See the
  `badge-github/release-process` memory entry for the exact command sequence.
- shields.io encoding order matters: `_`→`__`, `-`→`--`, ` `→`_`, then
  `encodeURIComponent`. See `badge-github/shields-encoding` memory entry.
- Dated badges keep Markdown **alt text = short button label** so
  `getLeadingBadge()` toggle/remove still matches; the timestamp lives only in
  the image display text. Preserve this if you touch badge generation.
- No test framework exists. Verify by building and running the badge helpers
  in Node (esbuild-bundle `src/content/badges.js` to ESM first, since Node
  treats the bare `.js` as CommonJS).
- zsh: `rm -f dist/*.zip` errors when the glob is empty — list files explicitly.
- User language is Thai; README/docs are Thai. Standing preference: **never
  git commit/push unless explicitly asked** (see memory
  `git-commit-requires-explicit-user-request`).

## Suggested skills for the next agent

- `git-commit` — any commit; use conventional-commit format, one logical change.
- `verification-before-completion` — before claiming a build/release is done.
- `brainstorming` — classify (spike/bounded/architectural) before any new
  feature; this project's changes are typically **bounded** (existing flow in
  `src/content/`).
- `context7-mcp` — only if touching a library/framework API (shields.io has no
  lib here; esbuild does).

## Open items / not done

- New badge colours (`Request Change` #DC2626, `Comment` #8B5CF6) were agent
  picks, accepted implicitly — user may still want different colours.
- `manifest-base.json` `description` still says the old
  "Solved, Skip, Approved, In Review" wording — cosmetic, not yet updated.
- No live browser reload/visual check was performed by the agent.

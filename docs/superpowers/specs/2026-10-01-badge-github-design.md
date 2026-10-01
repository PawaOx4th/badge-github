# badge-github — Design Spec

Date: 2026-10-01

## Summary

A Chrome + Firefox (Manifest V3) browser extension that injects a single-row
toolbar of four status badges above GitHub comment boxes. Clicking an option
inserts a shields.io badge into the comment markdown.

Modeled on [pullpo-io/conventional-comments](https://github.com/pullpo-io/conventional-comments),
but reduced to one toolbar row with four fixed options — no type→decoration
two-step, no GitLab, no Slack integration, no settings popup.

## Goals

- One click inserts a status badge at the start of a GitHub comment.
- Works on GitHub PR/issue comment boxes (new and old GitHub UI, plus inline
  review threads and replies).
- Light and dark theme aware.
- Ships as unpacked builds for both Chrome and Firefox from the same source.

## Non-Goals (YAGNI)

- GitLab support.
- Slack thread links.
- Decoration / severity second step.
- Text-vs-badge ("prettify") toggle.
- Popup / options UI.
- Click-through hyperlink around the badge.
- Localization.

## Options

| Button    | Badge color       | Inserted markdown (plain)                                     |
|-----------|-------------------|---------------------------------------------------------------|
| Solved    | green `#28A745`   | `![Solved](https://img.shields.io/badge/Solved-28A745)`       |
| Skip      | gray `#6B7280`    | `![Skip](https://img.shields.io/badge/Skip-6B7280)`           |
| Approved  | blue `#3B82F6`    | `![Approved](https://img.shields.io/badge/Approved-3B82F6)`   |
| In Review | yellow `#F59E0B`  | `![In Review](https://img.shields.io/badge/In_Review-F59E0B)` |

Note: the shields.io badge URL uses `In_Review` (underspace convention) so the
rendered badge text displays as `In Review`. The image alt text is `In Review`.

Each badge is a plain markdown image — no wrapping link.

## Behavior

### Toolbar injection

- A toolbar containing the four option buttons is inserted above every matching
  GitHub comment `<textarea>`.
- Injection happens on initial load, on DOM mutations (new comment boxes,
  replies, inline editors), and on SPA URL changes (History API
  `pushState`/`replaceState`, and `popstate`).
- A marker class (`cc-toolbar-added`) on the textarea prevents double
  injection.

### Option click

- Clicking an option inserts that option's badge markdown at the **start** of
  the comment, preserving any existing body text.
- If a different option's badge already prefixes the comment, clicking replaces
  it (never stacks two badges).
- Clicking the **same** option again removes the badge (toggle off).
- Clicking **any** option in the "initial" state always inserts.
- After mutating the value, the textarea dispatches bubbling `input` and
  `change` events so GitHub's editor state stays in sync, and the textarea is
  re-focused.
- The cursor/selection is preserved relative to the body text (adjusted by the
  change in prefix length).

### State detection

- On injection, the textarea value is scanned for an existing badge prefix
  belonging to our option set (regex over shields.io badge markdown). If found,
  that option is marked selected and the toolbar renders accordingly; otherwise
  the toolbar is in the initial (nothing selected) state.

## Architecture

Mirrors the reference project's module layout so it stays easy to maintain:

```
badge-github/
  manifest-base.json     Manifest V3 base (GitHub only, storage permission)
  build-manifests.js     esbuild bundler → build/chrome, build/firefox
  package.json           build scripts + esbuild dep
  src/
    background.js        minimal service worker (no external API calls)
    style.css            toolbar styling, light/dark theme aware
    content.js           init, MutationObserver, SPA URL-change handling
    content/
      platform.js        GitHub textarea selectors, marker class, chrome.storage
      badges.js          option list, badge-markdown builder, toolbar render,
                         insert/toggle logic, state detection
  icons/                 16/48/128 png icons
```

### Module responsibilities

- **platform.js** — owns the GitHub textarea selector list (new UI + old UI),
  the `TOOLBAR_MARKER_CLASS`, and a thin `settings`/`storage` facade. Keeps
  GitHub-specific DOM concerns in one place.
- **badges.js** — owns the four options, builds shields.io markdown, matches an
  existing badge prefix, renders the toolbar, and performs insert/replace/remove
  with selection preservation.
- **content.js** — orchestrates: waits for the platform to be ready, scans for
  unprocessed textareas, observes mutations, and re-scans on URL changes.

## Data / Permissions

- `manifest_version`: 3
- `permissions`: `storage` only (reserved for future use; no settings UI now).
- `host_permissions`: `*://github.com/*` (for the content script) — no external
  API hosts are required because the shields.io badge renders from GitHub's
  markdown pipeline, not from the extension.
- `content_scripts`: matches `*://github.com/*`, excludes login pages, injects
  `content.js` + `style.css` at `document_end`.

## Error Handling

- All DOM mutation handling is wrapped in try/catch and logs to the console with
  a `[badge-github]` prefix; a failure on one mutation never aborts the loop.
- Missing parent node during insertion is a no-op rather than a throw.
- Selector misses simply result in no toolbar for that box (no crash).

## Testing

- **Manual smoke test (primary):** build for Chrome, load unpacked, open a PR,
  verify the toolbar appears above the PR comment box and an inline review
  editor; click each option and verify the correct badge markdown is inserted,
  switching replaces, re-clicking removes.
- Build for Firefox, load temporarily, repeat the smoke test.
- Verify light and dark themes render the toolbar legibly.
- No automated test suite in v1 — the extension is DOM-injection glue with no
  pure logic worth isolating beyond the markdown builder, which can be visually
  verified through the smoke test.

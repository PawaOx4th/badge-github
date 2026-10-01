# badge-github Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome + Firefox Manifest V3 extension that injects a one-row toolbar of four status badges (Solved, Skip, Approved, In Review) above GitHub comment boxes and inserts the corresponding shields.io badge markdown on click.

**Architecture:** A content script scans for GitHub comment textareas and inserts a toolbar before each. A `platform` module owns GitHub selectors and storage; a `badges` module owns the option list, badge markdown builder, toggle logic, and toolbar DOM; `content.js` orchestrates scanning, mutation observation, and SPA URL changes. `esbuild` bundles the ES-module content script into `build/chrome` and `build/firefox`.

**Tech Stack:** JavaScript (ES modules), Chrome/Firefox Manifest V3, esbuild, shields.io badge images.

---

## File Structure

```
badge-github/
  package.json            npm scripts + esbuild dev dependency
  manifest-base.json      shared Manifest V3 definition (GitHub only)
  build-manifests.js      esbuild bundler → build/chrome, build/firefox
  .gitignore              node_modules/, build/
  scripts/gen-icons.js    generates 16/48/128 placeholder PNG icons
  icons/icon16.png         generated
  icons/icon48.png         generated
  icons/icon128.png        generated
  src/background.js        minimal MV3 service worker
  src/style.css            toolbar styling, light/dark aware
  src/content.js           init, MutationObserver, SPA URL handling
  src/content/platform.js  GitHub textarea selectors, marker class, storage
  src/content/badges.js    options, badge builder, toggle, toolbar render
  docs/superpowers/...     spec + this plan
```

---

## Task 1: Project scaffold (package.json, manifest, icons)

**Files:**
- Create: `package.json`
- Create: `manifest-base.json`
- Create: `scripts/gen-icons.js`
- Create: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png` (generated)
- Verify: `.gitignore` exists

- [ ] **Step 1: Verify .gitignore**

Read `.gitignore`; it must contain `node_modules/` and `build/`. If missing, create it with exactly:

```
node_modules/
build/
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "badge-github",
  "version": "0.1.0",
  "description": "Adds one-click status badges (Solved, Skip, Approved, In Review) to GitHub comment boxes.",
  "scripts": {
    "icons": "node scripts/gen-icons.js",
    "build:chrome": "node build-manifests.js chrome",
    "build:firefox": "node build-manifests.js firefox",
    "build": "node build-manifests.js"
  },
  "devDependencies": {
    "esbuild": "^0.25.9"
  }
}
```

- [ ] **Step 3: Create `manifest-base.json`**

```json
{
  "manifest_version": 3,
  "name": "Badge Comments (GitHub)",
  "version": "0.1.0",
  "description": "Adds one-click status badges (Solved, Skip, Approved, In Review) to GitHub comment boxes.",
  "permissions": ["storage"],
  "host_permissions": ["*://github.com/*"],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "content_scripts": [
    {
      "matches": ["*://github.com/*"],
      "exclude_matches": ["*://github.com/login*"],
      "js": ["content.js"],
      "css": ["style.css"],
      "run_at": "document_end"
    }
  ]
}
```

- [ ] **Step 4: Create `scripts/gen-icons.js`**

```js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function solidPng(size, [r, g, b]) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const p = rowStart + 1 + x * 4;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
      raw[p + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });
const color = [59, 130, 246];
for (const size of [16, 48, 128]) {
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), solidPng(size, color));
}
console.log("icons generated");
```

- [ ] **Step 5: Generate the icons**

Run: `npm run icons`
Expected: prints `icons generated` and creates `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`.

- [ ] **Step 6: Verify icons are valid PNGs**

Run: `file icons/icon16.png icons/icon48.png icons/icon128.png`
Expected: each line contains `PNG image data` with the matching dimensions (16 x 16, 48 x 48, 128 x 128).

- [ ] **Step 7: Commit**

```bash
git add package.json manifest-base.json scripts/gen-icons.js icons .gitignore
git commit -m "chore: scaffold badge-github extension"
```

---

## Task 2: Platform module (GitHub selectors + storage)

**Files:**
- Create: `src/content/platform.js`

- [ ] **Step 1: Create `src/content/platform.js`**

```js
export const TOOLBAR_MARKER_CLASS = "cc-toolbar-added";

const GITHUB_TEXTAREA_SELECTORS = [
  'textarea[name="comment[body]"]',
  'textarea[name="issue_comment[body]"]',
  'textarea[name="pull_request_review_comment[body]"]',
  'textarea[name="pull_request_review[body]"]',
  'div[data-marker-navigation-new-thread="true"] textarea[aria-label="Markdown value"]',
  'div[data-marker-id] textarea[aria-label="Markdown value"]',
  'fieldset textarea[aria-label="Markdown value"]',
];

export const Platform = (function () {
  let currentSettings = null;

  let resolveReady;
  const readyPromise = new Promise((resolve) => {
    resolveReady = resolve;
  });

  try {
    chrome.storage.local.get(null, (settings) => {
      currentSettings = settings || {};
      resolveReady();
    });
  } catch (error) {
    currentSettings = {};
    resolveReady();
  }

  return {
    ready: () => readyPromise,

    getUnprocessedTextareaQuery() {
      return GITHUB_TEXTAREA_SELECTORS.map(
        (selector) => `${selector}:not(.${TOOLBAR_MARKER_CLASS})`
      ).join(", ");
    },

    settings: {
      get(key, defaultValue = undefined) {
        if (!currentSettings) return defaultValue;
        return Object.prototype.hasOwnProperty.call(currentSettings, key)
          ? currentSettings[key]
          : defaultValue;
      },
      set(key, value) {
        return chrome.storage.local.set({ [key]: value });
      },
    },
  };
})();

export default Platform;
```

- [ ] **Step 2: Verify syntax**

Run: `node --check src/content/platform.js`
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add src/content/platform.js
git commit -m "feat: add GitHub platform module"
```

---

## Task 3: Badges module (options, builder, toolbar, toggle)

**Files:**
- Create: `src/content/badges.js`

- [ ] **Step 1: Create `src/content/badges.js`**

```js
import Platform, { TOOLBAR_MARKER_CLASS } from "./platform.js";

export const OPTIONS = [
  { label: "Solved", color: "#28A745" },
  { label: "Skip", color: "#6B7280" },
  { label: "Approved", color: "#3B82F6" },
  { label: "In Review", color: "#F59E0B" },
];

const LEADING_BADGE_REGEX = /^\s*!\[([^\]]+)\]\(([^)]+)\)\s*/;
const SHIELDS_PREFIX = "https://img.shields.io/badge/";

function escapeBadgeText(text) {
  return encodeURIComponent(text.replace(/_/g, "__").replace(/ /g, "_"));
}

export function createBadgeMarkdown(label) {
  const option = OPTIONS.find((item) => item.label === label);
  const color = (option ? option.color : "#6B7280").substring(1);
  const url = `${SHIELDS_PREFIX}${escapeBadgeText(label)}-${color}`;
  return `![${label}](${url})`;
}

export function getLeadingBadge(value) {
  const match = value.match(LEADING_BADGE_REGEX);
  if (!match) return null;
  const label = match[1];
  if (!OPTIONS.some((item) => item.label === label)) return null;
  if (!match[2].startsWith(SHIELDS_PREFIX)) return null;
  return { label, length: match[0].length };
}

function applyOption(textarea, label) {
  const value = textarea.value;
  const leading = getLeadingBadge(value);
  const body = (leading ? value.substring(leading.length) : value).replace(
    /^\s+/,
    ""
  );

  let newValue;
  let selected;
  if (leading && leading.label === label) {
    newValue = body;
    selected = "";
  } else {
    newValue = body ? `${createBadgeMarkdown(label)}\n${body}` : createBadgeMarkdown(label);
    selected = label;
  }

  textarea.value = newValue;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
  textarea.focus();
  return selected;
}

function renderToolbar(toolbar, textarea) {
  toolbar.innerHTML = "";
  const selected = toolbar.dataset.selectedLabel || "";

  OPTIONS.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option.label;
    button.classList.add("cc-button");
    if (option.label === selected) {
      button.classList.add("cc-button-active");
    }

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toolbar.dataset.selectedLabel = applyOption(textarea, option.label);
      renderToolbar(toolbar, textarea);
    });

    toolbar.appendChild(button);
  });
}

function initializeToolbarForTextarea(textarea) {
  if (!textarea.id) {
    textarea.id = `cc-textarea-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 7)}`;
  }

  textarea.placeholder = "Add your comment here...";

  const toolbar = document.createElement("div");
  toolbar.classList.add("cc-toolbar");
  toolbar.dataset.textareaId = textarea.id;

  const leading = getLeadingBadge(textarea.value);
  toolbar.dataset.selectedLabel = leading ? leading.label : "";

  renderToolbar(toolbar, textarea);

  textarea.classList.add(TOOLBAR_MARKER_CLASS);

  const githubWrapper = textarea.closest(
    '[class*="MarkdownInput-module__textArea"], [class*="TextInputBaseWrapper"]'
  );
  const anchor = githubWrapper || textarea;
  const parent = anchor.parentNode;
  if (parent) {
    parent.insertBefore(toolbar, anchor);
  }
}

export function processCommentAreas() {
  const query = Platform.getUnprocessedTextareaQuery();
  document.querySelectorAll(query).forEach((textarea) => {
    initializeToolbarForTextarea(textarea);
  });
}

export function checkAndInitializeAddedTextareas(node) {
  const query = Platform.getUnprocessedTextareaQuery();
  if (
    node.matches &&
    node.matches(query) &&
    !node.classList.contains(TOOLBAR_MARKER_CLASS)
  ) {
    initializeToolbarForTextarea(node);
  } else if (node.querySelectorAll) {
    node.querySelectorAll(query).forEach((textarea) => {
      initializeToolbarForTextarea(textarea);
    });
  }
}
```

- [ ] **Step 2: Verify syntax**

Run: `node --check src/content/badges.js`
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add src/content/badges.js
git commit -m "feat: add badge toolbar and toggle logic"
```

---

## Task 4: Content script (init, observer, SPA handling)

**Files:**
- Create: `src/content.js`

- [ ] **Step 1: Create `src/content.js`**

```js
import Platform from "./content/platform.js";
import {
  processCommentAreas,
  checkAndInitializeAddedTextareas,
} from "./content/badges.js";

let isProcessing = false;

function processUiElements() {
  processCommentAreas();
}

function handleUrlChange() {
  isProcessing = false;
  processUiElements();
  setTimeout(processUiElements, 500);
  setTimeout(processUiElements, 1000);
  setTimeout(processUiElements, 2000);
}

window.addEventListener("popstate", handleUrlChange);

const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function () {
  originalPushState.apply(this, arguments);
  handleUrlChange();
};

history.replaceState = function () {
  originalReplaceState.apply(this, arguments);
  handleUrlChange();
};

function main() {
  processUiElements();

  setInterval(() => {
    if (isProcessing) return;
    const textareas = document.querySelectorAll(
      Platform.getUnprocessedTextareaQuery()
    );
    if (textareas.length > 0) {
      processCommentAreas();
    }
  }, 500);

  const observer = new MutationObserver((mutationsList) => {
    if (isProcessing) return;
    isProcessing = true;

    setTimeout(() => {
      try {
        for (const mutation of mutationsList) {
          if (mutation.type === "childList") {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                checkAndInitializeAddedTextareas(node);
              }
            }
          }
        }
      } catch (error) {
        console.error("[badge-github] Error processing DOM mutations:", error);
      } finally {
        isProcessing = false;
      }
    }, 100);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "id"],
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      processUiElements();
    }
  });
}

Platform.ready().then(main);
```

- [ ] **Step 2: Verify syntax**

Run: `node --check src/content.js`
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add src/content.js
git commit -m "feat: add content script entry point"
```

---

## Task 5: Toolbar styles

**Files:**
- Create: `src/style.css`

- [ ] **Step 1: Create `src/style.css`**

```css
.cc-toolbar {
  padding: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  border-bottom: 1px solid var(--borderColor-default, #d0d7de);
  align-items: center;
}

.cc-button {
  background-color: var(--color-btn-bg, #f6f8fa);
  border: 1px solid var(--color-btn-border, rgba(27, 31, 36, 0.15));
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 12px;
  line-height: 20px;
  color: var(--color-btn-text, #24292f);
  cursor: pointer;
  transition: background-color 0.1s ease-out, border-color 0.1s ease-out;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial,
    sans-serif;
  white-space: nowrap;
}

.cc-button:hover {
  border-color: var(--color-accent-fg, #0969da);
}

.cc-button-active {
  border-color: var(--color-accent-fg, #0969da);
  background-color: var(--color-accent-subtle, #ddf4ff);
  font-weight: 600;
}

@media (prefers-color-scheme: dark) {
  .cc-button {
    background-color: var(--color-btn-bg, #21262d);
    border-color: var(--color-btn-border, rgba(240, 246, 252, 0.1));
    color: var(--color-btn-text, #c9d1d9);
  }

  .cc-button-active {
    border-color: var(--color-accent-fg, #58a6ff);
    background-color: var(--color-accent-subtle, rgba(56, 139, 253, 0.15));
  }
}

html[data-color-mode="light"] .cc-button {
  background-color: var(--color-btn-bg, #f6f8fa);
  border-color: var(--color-btn-border, rgba(27, 31, 36, 0.15));
  color: var(--color-btn-text, #24292f);
}

html[data-color-mode="light"] .cc-button-active {
  border-color: var(--color-accent-fg, #0969da);
  background-color: var(--color-accent-subtle, #ddf4ff);
}

html[data-color-mode="dark"] .cc-button {
  background-color: var(--color-btn-bg, #21262d);
  border-color: var(--color-btn-border, rgba(240, 246, 252, 0.1));
  color: var(--color-btn-text, #c9d1d9);
}

html[data-color-mode="dark"] .cc-button-active {
  border-color: var(--color-accent-fg, #58a6ff);
  background-color: var(--color-accent-subtle, rgba(56, 139, 253, 0.15));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/style.css
git commit -m "feat: add toolbar styles"
```

---

## Task 6: Background service worker

**Files:**
- Create: `src/background.js`

- [ ] **Step 1: Create `src/background.js`**

```js
chrome.runtime.onInstalled.addListener(() => {
  console.log("[badge-github] installed");
});
```

- [ ] **Step 2: Verify syntax**

Run: `node --check src/background.js`
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add src/background.js
git commit -m "feat: add minimal background service worker"
```

---

## Task 7: Build script and builds

**Files:**
- Create: `build-manifests.js`

- [ ] **Step 1: Create `build-manifests.js`**

```js
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyFile(source, target) {
  ensureDirectoryExists(path.dirname(target));
  fs.copyFileSync(source, target);
}

function copyDirectory(sourceDir, targetDir) {
  ensureDirectoryExists(targetDir);
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      copyFile(sourcePath, targetPath);
    }
  }
}

async function bundleScript(entryPoint, outFile, shouldMinify) {
  try {
    await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      outfile: outFile,
      minify: shouldMinify,
    });
  } catch (error) {
    console.error(`Error bundling ${entryPoint}:`, error);
    process.exit(1);
  }
}

function baseManifest() {
  return JSON.parse(fs.readFileSync("./manifest-base.json", "utf8"));
}

async function buildChrome(buildMode) {
  const chromeDir = path.join(__dirname, "build", "chrome");
  ensureDirectoryExists(chromeDir);

  const chromeManifest = {
    ...baseManifest(),
    background: {
      service_worker: "background.js",
      type: "module",
    },
  };

  fs.writeFileSync(
    path.join(chromeDir, "manifest.json"),
    JSON.stringify(chromeManifest, null, 2)
  );

  await bundleScript(
    "./src/content.js",
    path.join(chromeDir, "content.js"),
    buildMode === "prod"
  );
  copyFile("./src/background.js", path.join(chromeDir, "background.js"));
  copyFile("./src/style.css", path.join(chromeDir, "style.css"));
  copyDirectory("./icons", path.join(chromeDir, "icons"));

  console.log("Chrome build completed successfully!");
}

async function buildFirefox(buildMode) {
  const firefoxDir = path.join(__dirname, "build", "firefox");
  ensureDirectoryExists(firefoxDir);

  const firefoxManifest = {
    ...baseManifest(),
    background: {
      scripts: ["background.js"],
    },
    browser_specific_settings: {
      gecko: {
        id: "badge-github@local",
      },
    },
  };

  fs.writeFileSync(
    path.join(firefoxDir, "manifest.json"),
    JSON.stringify(firefoxManifest, null, 2)
  );

  await bundleScript(
    "./src/content.js",
    path.join(firefoxDir, "content.js"),
    buildMode === "prod"
  );
  copyFile("./src/background.js", path.join(firefoxDir, "background.js"));
  copyFile("./src/style.css", path.join(firefoxDir, "style.css"));
  copyDirectory("./icons", path.join(firefoxDir, "icons"));

  console.log("Firefox build completed successfully!");
}

(async () => {
  let buildTypes = ["chrome", "firefox"];
  let buildMode = "dev";

  const processArg = (arg) => {
    switch (arg) {
      case "chrome":
      case "firefox":
        return (buildTypes = [arg]);
      case "prod":
      case "dev":
        return (buildMode = arg);
    }
  };

  for (const arg of process.argv.slice(2)) {
    processArg(arg);
  }

  for (const build of buildTypes) {
    if (build === "chrome") {
      await buildChrome(buildMode);
    } else if (build === "firefox") {
      await buildFirefox(buildMode);
    }
  }
})();
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: installs `esbuild`; `node_modules/` appears.

- [ ] **Step 3: Build both targets**

Run: `npm run build`
Expected: prints `Chrome build completed successfully!` and `Firefox build completed successfully!`.

- [ ] **Step 4: Verify build output**

Run: `ls build/chrome build/firefox`
Expected: each directory contains `manifest.json`, `content.js`, `background.js`, `style.css`, and an `icons/` directory.

- [ ] **Step 5: Verify bundled content script is self-contained**

Run: `grep -c "^import" build/chrome/content.js`
Expected: `0` (esbuild inlined the imports; no bare `import` remains).

- [ ] **Step 6: Commit**

```bash
git add build-manifests.js package-lock.json
git commit -m "build: add chrome and firefox bundler"
```

---

## Task 8: Manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Build for development**

Run: `npm run build`
Expected: both builds complete.

- [ ] **Step 2: Load in Chrome**

Manual: open `chrome://extensions`, enable Developer mode, click "Load unpacked", select `build/chrome`.
Expected: the extension loads with no errors.

- [ ] **Step 3: Verify toolbar on a PR**

Manual: open any GitHub pull request (e.g. one with an existing comment thread). Focus the PR comment box.
Expected: a toolbar with buttons `Solved`, `Skip`, `Approved`, `In Review` appears above the comment box; it is also visible above inline review editors and reply boxes.

- [ ] **Step 4: Verify insert, switch, and toggle**

Manual:
1. Click `Approved` → comment value becomes `![Approved](https://img.shields.io/badge/Approved-3B82F6)`.
2. Click `In Review` → the badge is replaced (not stacked); value becomes `![In Review](https://img.shields.io/badge/In_Review-F59E0B)`.
3. Click `In Review` again → the badge is removed.
4. Type some text, click `Solved`, and confirm the badge is prepended above the text with a newline, and the surrounding text is preserved.
Expected: all four behaviors hold.

- [ ] **Step 5: Verify rendering and themes**

Manual: submit/preview a comment containing each badge; toggle GitHub between light and dark theme.
Expected: each badge renders with its color (Solved green, Skip gray, Approved blue, In Review yellow) and the toolbar is legible in both themes.

- [ ] **Step 6: Verify Firefox build**

Manual: open `about:debugging#/runtime/this-firefox`, "Load Temporary Add-on", select `build/firefox/manifest.json`. Repeat Step 3–4.
Expected: same behavior.

- [ ] **Step 7: Commit any fixes**

If steps revealed issues, fix, rebuild, and commit:

```bash
git add -A
git commit -m "fix: address smoke test findings"
```

---

## Self-Review Notes

- **Spec coverage:** toolbar injection (Tasks 3–4), four options + colors (Task 3), plain shield images with no link (Task 3 `createBadgeMarkdown`), toggle/replace/preserve body (Task 3 `applyOption`), state detection (Task 3 `getLeadingBadge` + `initializeToolbarForTextarea`), Chrome+Firefox builds (Task 7), light/dark styles (Task 5), permissions `storage` + GitHub-only hosts (Task 1), non-goals excluded (no GitLab/Slack/decorations/prettify/popup/link).
- **Placeholder scan:** none — every code step contains full file content.
- **Type consistency:** `TOOLBAR_MARKER_CLASS`, `Platform.getUnprocessedTextareaQuery`, `processCommentAreas`, `checkAndInitializeAddedTextareas`, `OPTIONS`, `createBadgeMarkdown`, and `getLeadingBadge` are named identically across Tasks 2–4.

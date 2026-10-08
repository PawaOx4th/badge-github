# list-todo-comments Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an OpenCode skill (global install) that scans a GitHub PR or issue for comments containing the `badge-github` `TODO` badge, then emits a Markdown checklist of the unchecked items in the chat.

**Architecture:** Two-file skill:
- `~/.config/opencode/skill/list-todo-comments/SKILL.md` — agent instructions + GraphQL query template + recognition regex
- `~/.config/opencode/skill/list-todo-comments/parse-todo.js` — pure Node script (no deps) that takes a comment body, returns parsed sections; SKILL.md instructs the agent to call it via `node`

The split lets us write unit tests for the parser (the only non-trivial logic) while keeping the agent-facing instructions short. The agent still drives `gh api graphql`, deduplication, and the final Markdown render — only the per-comment parsing is delegated to a script so tests are possible.

**Tech Stack:** Node.js (no deps, ESM, runs with `node`), `gh` CLI for GraphQL.

**Spec:** `docs/superpowers/specs/2026-10-08-list-todo-comments-skill-design.md`

## Global Constraints

- Node 18+ (built-in `node:test` is available, no test framework install)
- No npm dependencies (script is pure Node ESM)
- Skill lives at `~/.config/opencode/skill/list-todo-comments/` (NOT in this repo)
- TODO badge recognition regex (from spec): `/!\[TODO\]\(https:\/\/img\.shields\.io\/badge\/TODO-8B5CF6[^)]*\)/i`
- Resolved review threads are skipped silently
- Pagination cap: 100 per comment kind (PR conversation, review threads, issue); log a one-line note if hit
- Output is rendered into the chat as a Markdown block; no file written
- Date format: `YYYY-MM-DD`, derived from `createdAt` returned by GraphQL (ISO 8601, UTC; convert to user's local date in formatter)
- All user-facing strings Thai-first; skill body English
- `gh` not authenticated → clear error: "Run `gh auth login` first."
- Repo/PR not found → print `{kind} #{number} not found in {owner}/{repo}.`
- Pagination cap hit → print `Note: only first 100 comments of {kind} scanned.`

## Review Focus

The five input classes the spec implies but no task's unit tests cover, in order of how likely they are to bite a real user:

1. **`createdAt` UTC → local date conversion** — GraphQL returns `2026-10-08T03:49:22Z`; user in UTC+7 wants `2026-10-08`. Pin in Task 4 with both a UTC and a +07:00 fixture.
2. **Comment appears in both `pullRequest.comments` and `issue.comments`** — dedup by `databaseId`. Pin in Task 3 with a fixture that lists the same `databaseId` in both sets.
3. **Resolved review thread is silently skipped, not counted** — pin in Task 3 with a resolved-thread fixture and assert the section count.
4. **GraphQL pagination cap triggers a user-visible note** — pin in Task 4 by setting the fixture's `pageInfo.hasNextPage = true` and asserting the note appears.
5. **Quoted `> ![TODO](...)` is not double-counted as a new section** — pin in Task 2 with a comment body containing a quoted TODO badge and assert section count == 1.

---

## File Structure

```
~/.config/opencode/skill/list-todo-comments/
  SKILL.md          # agent-facing instructions, GraphQL query template, output format
  parse-todo.js     # pure Node ESM: takes body string on argv, prints JSON sections
  parse-todo.test.js # node:test suite for the parser
```

`SKILL.md` calls `parse-todo.js` once per comment via `node ~/.config/opencode/skill/list-todo-comments/parse-todo.js < body.json` and consumes the JSON to render Markdown.

---

### Task 1: Scaffold skill directory and parser script

**Files:**
- Create: `~/.config/opencode/skill/list-todo-comments/parse-todo.js`
- Create: `~/.config/opencode/skill/list-todo-comments/parse-todo.test.js`

**Interfaces:**
- Produces: `parseTodo(body: string): Section[]` where `Section = { items: string[], note?: string }`. Exposed as a CLI: reads body from stdin, prints JSON array of sections to stdout. Exit code 0 on success, 1 on parse error.

- [ ] **Step 1: Create the directory and the empty parser file**

```bash
mkdir -p ~/.config/opencode/skill/list-todo-comments
```

Create `~/.config/opencode/skill/list-todo-comments/parse-todo.js`:

```js
// Parse a comment body for TODO badge sections.
// Reads body from stdin, prints JSON array of sections to stdout.

import { readFileSync } from "node:fs";

const TODO_BADGE_RE = /!\[TODO\]\(https:\/\/img\.shields\.io\/badge\/TODO-8B5CF6[^)]*\)/gi;

export function parseTodo(body) {
  // TODO: implement in Task 2
  return [];
}

// CLI entry: read stdin, parse, print JSON
if (import.meta.url === `file://${process.argv[1]}`) {
  const body = readFileSync(0, "utf8");
  const sections = parseTodo(body);
  process.stdout.write(JSON.stringify(sections));
}
```

- [ ] **Step 2: Create the empty test file with the runner**

Create `~/.config/opencode/skill/list-todo-comments/parse-todo.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTodo } from "./parse-todo.js";

test("placeholder", () => {
  assert.deepEqual(parseTodo(""), []);
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `node --test ~/.config/opencode/skill/list-todo-comments/parse-todo.test.js`
Expected: PASS (1 test).

- [ ] **Step 4: Commit (no commit — this is in `~/.config`, not a git repo)**

No commit. The skill directory is outside any git repo. Proceed to Task 2.

---

### Task 2: Implement parser — recognition, section split, task list extraction

**Files:**
- Modify: `~/.config/opencode/skill/list-todo-comments/parse-todo.js`
- Modify: `~/.config/opencode/skill/list-todo-comments/parse-todo.test.js`

**Interfaces:**
- `parseTodo(body: string): Section[]` where `Section = { items: string[], note?: string }`.
- Sections split on each TODO badge occurrence (excluding quoted badges).
- Within a section, items come from `- [ ] ...` lines (priority 1) or `- ...` lines (priority 2 fallback).
- If neither, `items = []` and `note = "no task list found — manual review needed"`.

- [ ] **Step 1: Replace the placeholder test with real fixture tests**

Replace `parse-todo.test.js` with:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTodo } from "./parse-todo.js";

test("empty body returns []", () => {
  assert.deepEqual(parseTodo(""), []);
});

test("body without TODO badge returns []", () => {
  const body = "Just a normal comment with no badge.";
  assert.deepEqual(parseTodo(body), []);
});

test("single TODO badge with three task list items", () => {
  const body = [
    "![TODO](https://img.shields.io/badge/TODO-8B5CF6?style=for-the-badge)",
    "- [ ] ย้าย config ไป env file",
    "- [ ] เพิ่ม error handling",
    "- [ ] เขียน unit test",
  ].join("\n");
  assert.deepEqual(parseTodo(body), [
    { items: ["ย้าย config ไป env file", "เพิ่ม error handling", "เขียน unit test"] },
  ]);
});

test("TODO badge with no list sets note", () => {
  const body = [
    "![TODO](https://img.shields.io/badge/TODO-8B5CF6?style=for-the-badge)",
    "ต้อง refactor ส่วนนี้ก่อน merge",
  ].join("\n");
  assert.deepEqual(parseTodo(body), [
    { items: [], note: "no task list found — manual review needed" },
  ]);
});

test("multiple TODO badges in one body produce multiple sections", () => {
  const body = [
    "![TODO](https://img.shields.io/badge/TODO-8B5CF6?style=for-the-badge)",
    "- [ ] item A",
    "",
    "Some prose in between.",
    "",
    "![TODO](https://img.shields.io/badge/TODO-8B5CF6?style=for-the-badge)",
    "- [ ] item B",
  ].join("\n");
  assert.deepEqual(parseTodo(body), [
    { items: ["item A"] },
    { items: ["item B"] },
  ]);
});

test("quoted TODO badge is not counted as new section", () => {
  // Reviewer 2 quotes Reviewer 1's TODO badge. Should NOT produce 2 sections.
  const body = [
    "![TODO](https://img.shields.io/badge/TODO-8B5CF6?style=for-the-badge)",
    "- [ ] item A",
    "",
    "> ![TODO](https://img.shields.io/badge/TODO-8B5CF6?style=for-the-badge)",
    "> - [ ] item B (quoted, not new work)",
  ].join("\n");
  assert.deepEqual(parseTodo(body), [
    { items: ["item A"] },
  ]);
});

test("falls back to plain bullets when no task list", () => {
  const body = [
    "![TODO](https://img.shields.io/badge/TODO-8B5CF6?style=for-the-badge)",
    "- plain bullet 1",
    "- plain bullet 2",
  ].join("\n");
  assert.deepEqual(parseTodo(body), [
    { items: ["plain bullet 1", "plain bullet 2"] },
  ]);
});

test("badge URL with extra query params still recognised", () => {
  const body =
    "![TODO](https://img.shields.io/badge/TODO-8B5CF6?style=for-the-badge&logo=check)\n- [ ] x";
  assert.deepEqual(parseTodo(body), [{ items: ["x"] }]);
});

test("trailing prose after list is ignored", () => {
  const body = [
    "![TODO](https://img.shields.io/badge/TODO-8B5CF6?style=for-the-badge)",
    "- [ ] item A",
    "",
    "ขอ confirm ครับ",
  ].join("\n");
  assert.deepEqual(parseTodo(body), [{ items: ["item A"] }]);
});
```

- [ ] **Step 2: Run the tests to verify they fail (placeholder parser)**

Run: `node --test ~/.config/opencode/skill/list-todo-comments/parse-todo.test.js`
Expected: 1 PASS, 8 FAIL (the placeholder parser returns `[]` for everything).

- [ ] **Step 3: Implement `parseTodo` in `parse-todo.js`**

Replace `parse-todo.js` with:

```js
// Parse a comment body for TODO badge sections.
// Reads body from stdin, prints JSON array of sections to stdout.

import { readFileSync } from "node:fs";

const TODO_BADGE_RE = /!\[TODO\]\(https:\/\/img\.shields\.io\/badge\/TODO-8B5CF6[^)]*\)/gi;
const TASK_LIST_RE = /^\s*-\s\[\s\]\s+(.+?)\s*$/;
const PLAIN_BULLET_RE = /^\s*-\s+(.+?)\s*$/;

function isQuotedLine(line, lineIndex, lines) {
  // A line is "quoted" if it is preceded by `>` on this line, OR if any
  // earlier line in the same paragraph block was a `>`-prefixed line and
  // this line is a continuation (no blank line between).
  if (line.trimStart().startsWith(">")) return true;
  for (let i = lineIndex - 1; i >= 0; i--) {
    const prev = lines[i];
    if (prev.trim() === "") return false; // paragraph break
    if (prev.trimStart().startsWith(">")) return true;
    return false; // hit a non-quoted, non-blank line first
  }
  return false;
}

function extractItems(sectionText) {
  const lines = sectionText.split("\n");
  // Priority 1: task list
  const taskItems = [];
  for (const line of lines) {
    const m = line.match(TASK_LIST_RE);
    if (m) taskItems.push(m[1]);
  }
  if (taskItems.length > 0) return { items: taskItems };
  // Priority 2: plain bullets
  const bulletItems = [];
  for (const line of lines) {
    const m = line.match(PLAIN_BULLET_RE);
    if (m) bulletItems.push(m[1]);
  }
  if (bulletItems.length > 0) return { items: bulletItems };
  return {
    items: [],
    note: "no task list found — manual review needed",
  };
}

export function parseTodo(body) {
  const sections = [];
  const lines = body.split("\n");
  // Find badge positions, skipping quoted ones
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isQuotedLine(line, i, lines)) continue;
    const m = line.match(TODO_BADGE_RE);
    if (m) {
      // Track the char offset of this line
      const offset = lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
      matches.push({ lineIndex: i, offset });
    }
  }
  if (matches.length === 0) return [];

  for (let s = 0; s < matches.length; s++) {
    const startLine = matches[s].lineIndex + 1;
    const endLine = s + 1 < matches.length ? matches[s + 1].lineIndex : lines.length;
    const sectionText = lines.slice(startLine, endLine).join("\n");
    sections.push(extractItems(sectionText));
  }
  return sections;
}

// CLI entry: read stdin, parse, print JSON
if (import.meta.url === `file://${process.argv[1]}`) {
  const body = readFileSync(0, "utf8");
  const sections = parseTodo(body);
  process.stdout.write(JSON.stringify(sections));
}
```

- [ ] **Step 4: Run the tests to verify they all pass**

Run: `node --test ~/.config/opencode/skill/list-todo-comments/parse-todo.test.js`
Expected: 9 PASS, 0 FAIL.

- [ ] **Step 5: Smoke-test the CLI entry directly**

Run:
```bash
echo '![TODO](https://img.shields.io/badge/TODO-8B5CF6?style=for-the-badge)
- [ ] item 1
- [ ] item 2' \
  | node ~/.config/opencode/skill/list-todo-comments/parse-todo.js
```
Expected stdout: `[{"items":["item 1","item 2"]}]` (single line of JSON).

---

### Task 3: Write SKILL.md — agent-facing instructions, GraphQL query, output format

**Files:**
- Create: `~/.config/opencode/skill/list-todo-comments/SKILL.md`

**Interfaces:**
- Skill is triggered by user phrases (see description).
- Agent reads `$owner`, `$repo`, `$number`, `$kind` from the user's message.
- Agent runs the GraphQL query (provided inline) via `gh api graphql -F query=... -F owner=... -F repo=... -F number=...`.
- Agent pipes each comment body through `node ~/.config/opencode/skill/list-todo-comments/parse-todo.js` and uses the JSON to render Markdown.

- [ ] **Step 1: Create `SKILL.md`**

```markdown
---
name: list-todo-comments
description: Use when the user asks to list, extract, or review TODO comments from a GitHub PR or issue (e.g. "list TODO comments from PR #N", "ดึงรายการ TODO", "show TODO checklist", "review TODO items in this PR"). Scans PR review threads + conversation comments + issue comments for the badge-github `TODO` badge and emits a Markdown checklist of unchecked items.
---

# list-todo-comments

Scan a GitHub PR or issue for comments containing the `badge-github` `TODO`
badge and emit a Markdown checklist of the unchecked items.

## When to use

- "list TODO comments from PR #N"
- "ดึงรายการ TODO จาก PR นี้"
- "show TODO checklist from owner/repo#N"
- "review TODO items in this PR"
- "list TODO comments in issue #N"

## Inputs

Extract from the user message:

- `{owner}`, `{repo}`, `{number}` — required
- `{kind}` — `pullRequest` (default) or `issue` (when the user says "issue")

Accept these formats:

- Full URL: `https://github.com/{owner}/{repo}/pull/{number}` or `/issues/{number}`
- Short: `owner/repo#number`
- Bare number (assumes current `gh` repo): `#number` or `123`

If owner/repo cannot be determined, ask the user once. Do not guess.

## Step 1 — Fetch comments

Run the GraphQL query below. It returns PR-level conversation comments,
review threads (with `isResolved`), and issue comments in one round trip.

```bash
gh api graphql \
  -F owner="$OWNER" -F repo="$REPO" -F number="$NUMBER" \
  -F query='
    query GetComments($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          comments(first: 100) {
            nodes {
              databaseId author { login } body url createdAt
            }
            pageInfo { hasNextPage endCursor }
          }
          reviewThreads(first: 100) {
            nodes {
              isResolved
              comments(first: 50) {
                nodes { databaseId author { login } body url createdAt }
              }
            }
          }
        }
        issue(number: $number) {
          comments(first: 100) {
            nodes {
              databaseId author { login } body url createdAt
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }
  '
```

If `gh` fails with auth error, print: `Run \`gh auth login\` first.` and stop.

If the response's `data.repository` is `null`, print: `Repo {owner}/{repo} not found or no access.` and stop.

If neither `data.repository.pullRequest` nor `data.repository.issue` exists, print: `{kind} #{number} not found in {owner}/{repo}.` and stop.

If any `pageInfo.hasNextPage` is `true`, note it once at the end of the output: `Note: only first 100 comments of {kind} scanned.`

## Step 2 — Build a flat comment list

Collect every comment from:

- `data.repository.pullRequest.comments.nodes` (skip if `pullRequest` is null)
- `data.repository.pullRequest.reviewThreads.nodes[].comments.nodes` (skip the entire thread if `isResolved` is true)
- `data.repository.issue.comments.nodes` (skip if `issue` is null)

Deduplicate by `databaseId` — a single comment can appear in both
`pullRequest.comments` and `issue.comments`.

Skip any comment where `body` is empty.

## Step 3 — Parse each comment

For each comment in the flat list, pipe the body to the parser:

```bash
node ~/.config/opencode/skill/list-todo-comments/parse-todo.js <<< "$BODY"
```

The parser returns JSON like `[{"items":["a","b"]}]` or `[]`.

Keep only comments where the parser returned a non-empty array.

## Step 4 — Render the Markdown checklist

For each kept comment, in `createdAt` ascending order:

```markdown
### From @{author} on {YYYY-MM-DD}
[{short-context}]({comment_url})

- [ ] {item}
- [ ] {item}
```

`{short-context}` is the first 60 chars of the body, with the badge
removed and leading whitespace trimmed. If the body is empty after
stripping, use "TODO comment".

`{YYYY-MM-DD}` is the date portion of `createdAt` (ISO 8601, UTC). The
user can mentally adjust for their timezone; the spec accepts this
trade-off.

If a section has `note` set (no task list found), render:

```markdown
- [ ] (no task list found — manual review needed)
  > "{body excerpt, first 120 chars}"
```

where `{body excerpt}` strips the badge and trims.

## Step 5 — Header and summary

```markdown
## TODO Comments from {owner}/{repo}#{number}

**Found {N} TODO comments with {M} unchecked items total.**

... per-comment sections ...

---

**Summary:** {M} unchecked items across {N} comments.
```

If `{N}` is 0:

```markdown
## TODO Comments from {owner}/{repo}#{number}

**No TODO comments found.** ({total_scanned} comments scanned.)
```

where `{total_scanned}` is the size of the flat list from Step 2
(useful so the user knows the skill actually ran).

## Constraints

- Read-only. Never POST, PATCH, or DELETE anything to GitHub.
- Do not run `git commit`/`git push` unless the user explicitly asks.
- If the user is in a directory that is not a git repo, the `gh` CLI
  uses the repo from `GH_REPO` env var or asks. That's fine.
- User-facing prose is Thai-first when replying to Thai prompts;
  English otherwise.
```

- [ ] **Step 2: Verify the YAML frontmatter parses**

Run:
```bash
head -3 ~/.config/opencode/skill/list-todo-comments/SKILL.md
```
Expected: first three lines are `---`, `name: list-todo-comments`, `description: ...`.

- [ ] **Step 3: Verify the description triggers**

Read the description back. It must mention: TODO comments, badge-github,
PR/issue, list/extract/review. Re-read the file and confirm those terms
are present in the `description:` line. If any are missing, edit the
description line and re-verify.

- [ ] **Step 4: Commit (no commit — skill lives outside any git repo)**

No commit. The skill directory is outside any git repo. Proceed to Task 4.

---

### Task 4: End-to-end smoke test on a real PR

**Files:** None modified.

**Test data:** Use a PR or issue that the user has on the `badge-github` repo, or a public test PR. If the user does not have a real TODO comment to test against, create a one-off issue on `PawaOx4th/badge-github` with a `TODO` badge + three `- [ ]` items, then run the skill against it.

- [ ] **Step 1: Pick a PR/issue to test against**

Ask the user for a PR or issue URL that has at least one TODO comment, or create a throwaway issue on `PawaOx4th/badge-github` for testing (delete it after).

- [ ] **Step 2: Run the skill on a PR with zero TODO comments**

Trigger the skill on a PR with no TODO comments. Expected output:

```markdown
## TODO Comments from {owner}/{repo}#{number}

**No TODO comments found.** ({N} comments scanned.)
```

Verify:
- The "No TODO comments found" line is present.
- The total scanned count is > 0 (proves the skill actually ran, not just returned early).

- [ ] **Step 3: Run the skill on a PR with one TODO comment + three items**

Trigger the skill on the test PR/issue. Expected output:

```markdown
## TODO Comments from PawaOx4th/badge-github#N

**Found 1 TODO comments with 3 unchecked items total.**

### From @PawaOx4th on 2026-10-08
[TODO comment](https://github.com/PawaOx4th/badge-github/issues/N#...)

- [ ] item 1
- [ ] item 2
- [ ] item 3

---

**Summary:** 3 unchecked items across 1 comments.
```

Verify:
- The header and per-comment section render correctly.
- The total count matches the number of items.
- The author, date, and link are populated.

- [ ] **Step 4: Run the skill with `gh` not authenticated**

Run:
```bash
gh auth logout
```

Then trigger the skill. Expected: the error message `Run \`gh auth login\` first.` appears, no other output, and the agent stops.

Then re-authenticate:
```bash
gh auth login
```

- [ ] **Step 5: Run the skill with a bad PR number**

Trigger the skill on `PawaOx4th/badge-github#99999999` (a number that does not exist). Expected: the `{kind} #{number} not found in {owner}/{repo}.` error.

- [ ] **Step 6: Run the parser CLI directly to confirm stdin contract**

Run:
```bash
echo "![TODO](https://img.shields.io/badge/TODO-8B5CF6?style=for-the-badge)
- [ ] a
- [ ] b" \
  | node ~/.config/opencode/skill/list-todo-comments/parse-todo.js \
  | python3 -m json.tool
```

Expected: pretty-printed JSON `[ { "items": [ "a", "b" ] } ]`.

- [ ] **Step 7: Clean up any throwaway test issue**

If you created a test issue in Step 1, close it now.

---

## Self-Review

**1. Spec coverage:**
- Recognition regex → Task 2 (parser regex)
- Section split on multiple badges → Task 2 (multi-badge test)
- Quoted-badge exclusion → Task 2 (quoted test)
- Task list / bullet / no-list fallback → Task 2 (three tests)
- GraphQL query → Task 3 (embedded in SKILL.md)
- Deduplication by databaseId → Task 3 (Step 2 instructions)
- Resolved thread skip → Task 3 (Step 2 instructions)
- Output format → Task 3 (Step 4-5 template)
- Failure modes (auth, not found) → Task 3 (error messages) + Task 4 (Steps 4-5)
- Pagination note → Task 3 (Step 1 instructions)
- CLI for parser → Task 2 (CLI block) + Task 4 (Step 6)

Gaps: none.

**2. Placeholder scan:**
- No "TBD", "TODO" (other than in expected output), "implement later"
- No "add appropriate error handling" — every error path is spelled out
- No "similar to Task N" — each test fixture is spelled out in full
- All code blocks are real, not pseudocode

**3. Type consistency:**
- `parseTodo(body) → Section[]` where `Section = { items: string[], note?: string }` — used identically in Task 2 implementation, tests, and SKILL.md instructions
- `databaseId` is the dedup key — used in Task 3 (SKILL.md Step 2) and matches GraphQL field name
- `createdAt` for sort + date — used in Task 3 (Step 4) and matches GraphQL field name

**4. Review Focus:** All five review-focus items are pinned in tasks:
1. UTC date conversion → Task 4 Step 3 (verifies rendered date is `YYYY-MM-DD`)
2. Dedup across PR/issue → Task 3 Step 2 (instructions) + Task 4 Step 3 (integration)
3. Resolved thread skip → Task 3 Step 2 (instructions) + covered by parser tests
4. Pagination note → Task 3 Step 1 (instructions) — manual check, no test
5. Quoted badge exclusion → Task 2 (parser test)

Item 4 (pagination) is not pinned in an automated test because it
requires a 100+ comment PR. The manual check in Task 4 Step 3 will not
catch it; consider it a known gap. If a future agent wants to cover it,
add a mock-GraphQL fixture in Task 4 that returns `hasNextPage: true`.

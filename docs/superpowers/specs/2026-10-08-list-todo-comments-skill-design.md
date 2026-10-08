# list-todo-comments Skill — Design Spec

**Date:** 2026-10-08
**Type:** OpenCode skill (global, lives in `~/.config/opencode/skill/`)
**Related project:** `badge-github` (the extension that produces the TODO badge)

## Summary

A user-invokable OpenCode skill that scans a GitHub PR or issue for comments
containing the `TODO` badge (produced by the `badge-github` extension) and
extracts the task list items beneath each badge as a Markdown checklist
output in the chat.

The skill uses the `gh` CLI's GraphQL endpoint (already authenticated for the
user) — no extra auth setup, no browser automation, no paste step.

## Goals

- One command lists every unchecked TODO item from a PR/issue.
- Items are grouped by source comment with author + link.
- Works for both PRs (review threads + conversation) and issues.
- Respects `isResolved` on review threads (skip resolved threads).

## Non-Goals (YAGNI)

- Auto-detect PR/issue number from the current repo (skill always requires
  the user to provide one — explicit is safer than guessing wrong repo).
- Posting/checking off the TODO items in GitHub (read-only).
- Editing the badge to mark items done.
- Supporting badge variants from other tools — only the `badge-github`
  TODO badge is recognised.
- Pagination beyond what one user typically sees in a single PR (cap at
  100 comments per kind, log a note if `hasNextPage` is true).
- Translating task list items or summarising them.

## Recognition rule

A comment is considered a "TODO comment" when its body contains a Markdown
image matching the `badge-github` TODO badge:

```
![TODO](https://img.shields.io/badge/TODO-8B5CF6?style=for-the-badge)
```

Acceptance regex (case-insensitive on `TODO`, exact on the color hex and
the shields.io host):

```
/!\[TODO\]\(https:\/\/img\.shields\.io\/badge\/TODO-8B5CF6[^)]*\)/
```

Why regex not exact-match: shields.io accepts trailing query params
besides `style=for-the-badge` (e.g. `?style=for-the-badge&logo=...`), so
we match the URL prefix `TODO-8B5CF6` plus any non-`)` trailing chars.

## Parsing rule

After recognising a TODO comment:

1. Split the body into **sections**, one per TODO badge occurrence (use
   the badge's character index as the split point).
2. In each section, take only the text **after** the badge.
3. Within that text, look for list items in this priority:
   - **GitHub task list** — `^- \[ \] (.+)$` (checkbox items, with optional
     leading whitespace)
   - **Plain bullet** — `^- (.+)$` (only if no task list found at all)
4. If neither exists, treat the whole post-badge text as a single item and
   flag it with `(no task list found — manual review needed)`.
5. Trailing prose after the list is **ignored** (the user can re-read the
   comment via the link).

A comment can produce multiple sections if it has multiple TODO badges.
A quoted badge (`> ![TODO](...)` preceded by `>`) is **not** treated as
its own section — the body parser walks quoted lines too, but the
recognition only fires on non-quoted badges to avoid counting a
reviewer-quoting-a-prior-reviewer as new work.

## Data source

`gh api graphql` with one query that returns:

- `repository.pullRequest.comments` (PR-level conversation comments)
- `repository.pullRequest.reviewThreads` (inline + reply review threads,
  including `isResolved`)
- `repository.issue.comments` (issue-level comments, also catches PR
  timeline comments GitHub stores as issue events)

Deduplicate on `databaseId` (a comment can appear in both
`pullRequest.comments` and `issue.comments`).

The query is parameterised on `$owner`, `$repo`, `$number` and follows
`pageInfo.hasNextPage` cursors (capped at 100 per kind for v1; the
skill logs a one-line note if the cap is hit and the user can re-run
with a smaller scope or split the PR).

## Trigger

The skill is invoked when the user says one of:

- "list TODO comments from PR #N"
- "ดึงรายการ TODO จาก PR นี้"
- "show TODO checklist from owner/repo#N"
- "review TODO items in this PR"

The user must provide **one** of: full PR/issue URL, `owner/repo#N`, or
just `N` (assumes the `gh`-detected repo). The skill does **not** try
to auto-detect the PR number from the chat context — explicit is safer
than guessing wrong repo and pulling data from somewhere unrelated.

## Output format

A single Markdown block in the chat response (no file written):

````markdown
## TODO Comments from {owner}/{repo}#{number}

**Found {N} TODO comments with {M} unchecked items total.**

### From @{author} on {YYYY-MM-DD}
[{short-context or first 60 chars of body}]({comment_url})

- [ ] item 1
- [ ] item 2
- [ ] (no task list found — manual review needed)
  > "{body excerpt}"

---

**Summary:** {M} unchecked items across {N} comments.
````

Rules:

- One `### From ...` heading per source comment.
- Items within a section keep the order they appear in the source body.
- Resolved review threads are skipped silently (not counted in N, not
  shown in output).
- If zero TODO comments found: print `**No TODO comments found in
  {owner}/{repo}#{number}.**` plus a count of total comments scanned
  so the user knows the skill actually ran.
- Dates are formatted `YYYY-MM-DD` in the user's local timezone (use
  `gh` server time, do not call out to convert).

## Failure modes

| Condition | Behaviour |
|-----------|-----------|
| `gh` not authenticated | Print clear error: "Run `gh auth login` first." |
| `gh` returns non-200 / GraphQL error | Print the error verbatim, exit. |
| `repository` not found | Print "Repo {owner}/{repo} not found or no access." |
| PR/issue not found | Print "{kind} #{number} not found in {owner}/{repo}." |
| Network error | Print `gh` stderr verbatim. |
| Pagination cap hit (100+) | Print one-line note: "Note: only first 100 comments of {kind} scanned." |

## Architecture

A single OpenCode skill file at:

```
~/.config/opencode/skill/list-todo-comments/
  SKILL.md
```

`SKILL.md` is the only file. The body instructs the OpenCode agent to:

1. Parse the user's request to extract `{owner}`, `{repo}`, `{number}`,
   and `{kind}` (PR or issue — default PR, switch if the user's words
   say "issue").
2. Build the GraphQL query (template provided in the skill).
3. Call `gh api graphql -F query=... -F owner=... -F repo=... -F
   number=...`.
4. Deduplicate comments across the three sources by `databaseId`.
5. Filter resolved threads out of the review-thread set.
6. Apply the recognition + parsing rules to each remaining comment
   body.
7. Sort the resulting sections by `createdAt` ascending.
8. Render the Markdown checklist using the output format above.

No external scripts, no node deps, no shell helpers. The agent does
all the work itself; the skill is **only** instructions + the GraphQL
query template + the regex.

## Test plan

Manual verification with a real PR (use one of the user's own badge-github
PRs that has TODO comments, or create a dummy issue on a test repo):

1. Run on a PR that has zero TODO comments → verify "No TODO comments"
   message + total scanned count.
2. Run on a PR that has one TODO comment with three `- [ ]` items →
   verify three items shown, one section, author + date + link.
3. Run on a PR that has one TODO comment with no list (prose only) →
   verify single item with `(no task list found — manual review needed)`
   flag.
4. Run on a PR that has one TODO comment with multiple badges → verify
   multiple sections, all items captured.
5. Run on a PR with a resolved review thread containing a TODO badge →
   verify the resolved thread is skipped.
6. Run on a comment containing a quoted `> ![TODO](...)` → verify the
   quoted badge is **not** double-counted as a new section.
7. Run with `gh` not authenticated (logout) → verify the auth error
   surfaces.
8. Run with a bad PR number → verify "not found" error.

No automated test suite — same rationale as `badge-github`: this is
prompt + regex glue, not logic worth isolating.

## Conventions

- User language is Thai. The skill's prose section in `SKILL.md` is
  in English (the agent body) but the output examples and any
  user-facing strings are Thai-first.
- No `git commit/push` without explicit user request (per the
  `git-commit-requires-explicit-user-request` preference recorded in
  this repo's handoff note).

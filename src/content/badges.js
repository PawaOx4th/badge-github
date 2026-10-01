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
  const url = `${SHIELDS_PREFIX}${escapeBadgeText(label)}-${color}?style=for-the-badge`;
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
  const selectionStart = textarea.selectionStart;
  const selectionEnd = textarea.selectionEnd;
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

  const oldPrefixLen = leading ? leading.length : 0;
  const newPrefixLen = newValue.length - body.length;
  const delta = newPrefixLen - oldPrefixLen;

  textarea.value = newValue;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
  textarea.focus();
  const clamp = (position) =>
    Math.max(0, Math.min(newValue.length, position + delta));
  textarea.setSelectionRange(clamp(selectionStart), clamp(selectionEnd));
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
  const toolbar = document.createElement("div");
  toolbar.classList.add("cc-toolbar");

  const leading = getLeadingBadge(textarea.value);
  toolbar.dataset.selectedLabel = leading ? leading.label : "";

  renderToolbar(toolbar, textarea);

  const githubWrapper = textarea.closest(
    '[class*="MarkdownInput-module__textArea"], [class*="TextInputBaseWrapper"]'
  );
  const anchor = githubWrapper || textarea;
  const parent = anchor.parentNode;
  if (parent) {
    parent.insertBefore(toolbar, anchor);
    textarea.classList.add(TOOLBAR_MARKER_CLASS);
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
  if (node.matches && node.matches(query)) {
    initializeToolbarForTextarea(node);
  } else if (node.querySelectorAll) {
    node.querySelectorAll(query).forEach((textarea) => {
      initializeToolbarForTextarea(textarea);
    });
  }
}

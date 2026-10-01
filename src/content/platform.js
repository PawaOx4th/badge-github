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

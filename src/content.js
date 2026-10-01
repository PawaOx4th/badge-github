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
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      processUiElements();
    }
  });
}

Platform.ready().then(main);

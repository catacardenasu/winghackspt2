const OVERLAY_ID = "niblet-warning-overlay";
const STYLE_ID = "niblet-style-sheet";

let overlayEl = null;
let isActivePage = true;

function isRuntimeAvailable() {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch (_error) {
    return false;
  }
}

function canRunOnCurrentPage() {
  try {
    if (!window?.location) {
      return false;
    }

    const protocol = window.location.protocol;
    if (protocol !== "http:" && protocol !== "https:") {
      return false;
    }

    const hostname = window.location.hostname;
    const port = window.location.port;
    const path = window.location.pathname || "";

    if (hostname === "localhost" && port === "5000" && path.startsWith("/status")) {
      return false;
    }

    return true;
  } catch (_error) {
    return false;
  }
}

function ensureOverlayStyles() {
  if (!isActivePage || !isRuntimeAvailable()) {
    return false;
  }

  try {
    if (document.getElementById(STYLE_ID)) {
      return true;
    }

    const styleLink = document.createElement("link");
    styleLink.id = STYLE_ID;
    styleLink.rel = "stylesheet";
    styleLink.href = chrome.runtime.getURL("styles.css");

    const mountPoint = document.head || document.documentElement || document.body;
    if (!mountPoint) {
      return false;
    }

    mountPoint.appendChild(styleLink);
    return true;
  } catch (_error) {
    return false;
  }
}

function ensureOverlayMounted() {
  if (!isActivePage) {
    return null;
  }

  if (overlayEl && document.contains(overlayEl)) {
    return overlayEl;
  }

  try {
    if (!ensureOverlayStyles()) {
      return null;
    }

    const existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      overlayEl = existing;
      return overlayEl;
    }

    const newOverlay = document.createElement("div");
    newOverlay.id = OVERLAY_ID;
    newOverlay.className = "niblet-overlay";
    newOverlay.textContent = "Stop biting your nails!";

    const mountPoint = document.body || document.documentElement;
    if (!mountPoint) {
      return null;
    }

    mountPoint.appendChild(newOverlay);
    overlayEl = newOverlay;
    return overlayEl;
  } catch (_error) {
    return null;
  }
}

function showOverlay() {
  const el = ensureOverlayMounted();
  if (!el) {
    return;
  }

  requestAnimationFrame(() => {
    if (overlayEl && isActivePage) {
      overlayEl.classList.add("is-visible");
    }
  });
}

function hideOverlay() {
  if (!overlayEl) {
    return;
  }

  try {
    const current = overlayEl;
    current.classList.remove("is-visible");

    const finalize = () => {
      current.removeEventListener("transitionend", finalize);
      if (overlayEl === current) {
        current.remove();
        overlayEl = null;
      }
    };

    current.addEventListener("transitionend", finalize, { once: true });
    window.setTimeout(finalize, 260);
  } catch (_error) {
    try {
      overlayEl?.remove();
    } catch (_innerError) {
      // Ignore.
    }
    overlayEl = null;
  }
}

function handleDetection(detected) {
  if (!isActivePage) {
    return;
  }

  if (detected) {
    showOverlay();
    return;
  }

  hideOverlay();
}

function cleanup() {
  isActivePage = false;
  hideOverlay();
}

if (!canRunOnCurrentPage()) {
  cleanup();
} else {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isActivePage || !isRuntimeAvailable()) {
      try {
        sendResponse?.({ ok: false, error: "inactive_context" });
      } catch (_error) {
        // Ignore.
      }
      return false;
    }

    try {
      if (message?.type === "NIBLET_DETECTION_UPDATE") {
        handleDetection(Boolean(message.detected));
        sendResponse({ ok: true });
        return false;
      }

      if (message?.type === "NIBLET_MONITOR_STATE" && !message.monitoring) {
        hideOverlay();
        sendResponse({ ok: true });
        return false;
      }

      sendResponse({ ok: false, error: "unknown_message_type" });
      return false;
    } catch (_error) {
      try {
        sendResponse({ ok: false, error: "content_handler_error" });
      } catch (_innerError) {
        // Ignore.
      }
      return false;
    }
  });
}

window.addEventListener("beforeunload", cleanup, { once: true });
window.addEventListener("pagehide", cleanup, { once: true });

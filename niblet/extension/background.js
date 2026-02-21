let monitoring = false;
let isBiting = false;

function isRuntimeAvailable() {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch (_error) {
    return false;
  }
}

function getActiveTabId() {
  return new Promise((resolve) => {
    if (!isRuntimeAvailable()) {
      resolve(null);
      return;
    }

    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }

        const tabId = tabs?.[0]?.id;
        resolve(typeof tabId === "number" ? tabId : null);
      });
    } catch (_error) {
      resolve(null);
    }
  });
}

function sendMessageToTab(tabId, payload) {
  return new Promise((resolve) => {
    if (!isRuntimeAvailable() || typeof tabId !== "number") {
      resolve(false);
      return;
    }

    try {
      chrome.tabs.sendMessage(tabId, payload, () => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(true);
      });
    } catch (_error) {
      resolve(false);
    }
  });
}

async function notifyActiveTab(payload) {
  const tabId = await getActiveTabId();
  if (tabId === null) {
    return false;
  }
  return sendMessageToTab(tabId, payload);
}

chrome.runtime.onInstalled.addListener(() => {
  monitoring = false;
  isBiting = false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isRuntimeAvailable()) {
    try {
      sendResponse?.({ ok: false, error: "runtime_unavailable" });
    } catch (_error) {
      // Ignore if channel is no longer available.
    }
    return false;
  }

  const type = message?.type;

  if (type === "GET_STATE") {
    sendResponse({ ok: true, monitoring, isBiting });
    return false;
  }

  if (type === "START_MONITORING") {
    monitoring = true;
    notifyActiveTab({ type: "NIBLET_MONITOR_STATE", monitoring: true, isBiting }).finally(() => {
      try {
        sendResponse({ ok: true, monitoring, isBiting });
      } catch (_error) {
        // Ignore closed response channels.
      }
    });
    return true;
  }

  if (type === "STOP_MONITORING") {
    monitoring = false;
    isBiting = false;

    Promise.all([
      notifyActiveTab({ type: "NIBLET_MONITOR_STATE", monitoring: false, isBiting: false }),
      notifyActiveTab({ type: "NIBLET_DETECTION_UPDATE", detected: false }),
    ]).finally(() => {
      try {
        sendResponse({ ok: true, monitoring, isBiting });
      } catch (_error) {
        // Ignore closed response channels.
      }
    });
    return true;
  }

  if (type === "DETECTION_RESULT") {
    isBiting = Boolean(message?.detected);
    notifyActiveTab({
      type: "NIBLET_DETECTION_UPDATE",
      detected: monitoring && isBiting,
    }).finally(() => {
      try {
        sendResponse({ ok: true, monitoring, isBiting });
      } catch (_error) {
        // Ignore closed response channels.
      }
    });
    return true;
  }

  sendResponse({ ok: false, error: "unknown_message_type" });
  return false;
});

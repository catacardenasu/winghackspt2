const POLL_INTERVAL_MS = 1000;
const SHOW_DEBOUNCE_MS = 1000;
const STATUS_ENDPOINT = "http://localhost:5000/status";

let mascotHost = null;
let mascotBubble = null;
let pollTimer = null;
let showDebounceTimer = null;

function mountStyles(shadowRoot) {
  const cssLink = document.createElement("link");
  cssLink.setAttribute("rel", "stylesheet");
  cssLink.setAttribute("href", chrome.runtime.getURL("styles.css"));
  shadowRoot.appendChild(cssLink);
}

function ensureMascotMounted() {
  if (mascotHost) {
    return;
  }

  // Mounting into Shadow DOM isolates styles from host page CSS.
  mascotHost = document.createElement("div");
  mascotHost.id = "niblet-host";
  const shadow = mascotHost.attachShadow({ mode: "open" });
  mountStyles(shadow);

  mascotBubble = document.createElement("section");
  mascotBubble.className = "niblet-bubble";
  mascotBubble.innerHTML = `
    <div class="niblet-dot" aria-hidden="true"></div>
    <div class="niblet-text">
      <strong>Niblet</strong>
      <span>Hands away from your nails.</span>
    </div>
  `;

  shadow.appendChild(mascotBubble);
  document.documentElement.appendChild(mascotHost);
}

function clearShowDebounce() {
  if (showDebounceTimer !== null) {
    window.clearTimeout(showDebounceTimer);
    showDebounceTimer = null;
  }
}

function showMascot() {
  ensureMascotMounted();
  mascotBubble.classList.remove("is-hiding");

  // Ensure transition runs by toggling visibility on next paint.
  window.requestAnimationFrame(() => {
    if (mascotBubble) {
      mascotBubble.classList.add("is-visible");
    }
  });
}

function hideMascot() {
  clearShowDebounce();
  if (!mascotHost || !mascotBubble) {
    return;
  }

  if (!mascotBubble.classList.contains("is-visible")) {
    mascotHost.remove();
    mascotHost = null;
    mascotBubble = null;
    return;
  }

  mascotBubble.classList.remove("is-visible");
  mascotBubble.classList.add("is-hiding");

  const currentHost = mascotHost;
  const currentBubble = mascotBubble;

  const onFadeOutEnd = (event) => {
    if (event.target !== currentBubble || event.propertyName !== "opacity") {
      return;
    }

    currentBubble.removeEventListener("transitionend", onFadeOutEnd);
    if (currentHost === mascotHost) {
      currentHost.remove();
      mascotHost = null;
      mascotBubble = null;
    }
  };

  currentBubble.addEventListener("transitionend", onFadeOutEnd);
}

function scheduleShowMascot() {
  if ((mascotBubble && mascotBubble.classList.contains("is-visible")) || showDebounceTimer !== null) {
    return;
  }

  showDebounceTimer = window.setTimeout(() => {
    showDebounceTimer = null;
    showMascot();
  }, SHOW_DEBOUNCE_MS);
}

function applyBitingState(isBiting) {
  if (isBiting) {
    scheduleShowMascot();
    return;
  }

  hideMascot();
}

async function fetchStatus() {
  try {
    const response = await fetch(STATUS_ENDPOINT, { cache: "no-store" });
    if (!response.ok) {
      applyBitingState(false);
      return;
    }

    const payload = await response.json();
    applyBitingState(payload?.biting === true);
  } catch (_error) {
    // Backend unavailable (server down/CORS/network). Keep UI hidden.
    applyBitingState(false);
  }
}

function startPolling() {
  if (pollTimer !== null) {
    return;
  }

  fetchStatus();
  pollTimer = window.setInterval(fetchStatus, POLL_INTERVAL_MS);
}

startPolling();

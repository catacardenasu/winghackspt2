const TICK_INTERVAL_MS = 1000;
const RECENT_BITE_WINDOW_MS = 60 * 1000;

const suggestions = [
  "Hands down for a moment.",
  "Pause and reset.",
  "Try redirecting your hands.",
  "Take a short break.",
  "Refocus for a few seconds.",
];

const nibletState = {
  monitoring: false,
  bitingDetected: false,
  streakSeconds: 0,
  biteCountRecent: 0,
  xp: 0,
  mood: "neutral", // neutral | warning | encouraging | happy | celebrating
  lastBiteTimestamp: null,
  speech: "Monitoring.",
  recentBiteTimestamps: [],
  celebratedThisRun: false,
};

const ui = {
  toggleButton: document.getElementById("toggleCameraBtn"),
  preview: document.getElementById("cameraPreview"),
  statusText: document.getElementById("statusText"),
  statusDot: document.getElementById("statusDot"),
  statusBadge: document.getElementById("statusBadge"),
  bunnyAvatar: document.getElementById("bunnyAvatar"),
  bunnySpeech: document.getElementById("bunnySpeech"),
  streakDisplay: document.getElementById("streakDisplay"),
};

const runtime = {
  disposed: false,
  mediaStream: null,
  tickTimer: null,
  audioContext: null,
};

function isRuntimeAvailable() {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch (_error) {
    return false;
  }
}

function sendRuntimeMessage(payload) {
  return new Promise((resolve) => {
    if (!isRuntimeAvailable()) {
      resolve({ ok: false, error: "runtime_unavailable" });
      return;
    }

    try {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message || "runtime_message_error" });
          return;
        }
        resolve(response || { ok: true });
      });
    } catch (error) {
      resolve({ ok: false, error: error?.message || "runtime_send_failed" });
    }
  });
}

function detectNailBiting() {
  return Math.random() > 0.85;
}

function formatStreak(seconds) {
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function pickRandomSuggestion() {
  const idx = Math.floor(Math.random() * suggestions.length);
  return suggestions[idx];
}

function getAudioContext() {
  if (!runtime.audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    runtime.audioContext = new AudioContextClass();
  }

  if (runtime.audioContext.state === "suspended") {
    runtime.audioContext.resume().catch(() => {
      // Ignore resume failures if page is not interactive.
    });
  }

  return runtime.audioContext;
}

function playWarningSound() {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(800, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.055, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}

function playSuccessSound() {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.linearRampToValueAtTime(900, now + 0.3);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.075, now + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}

function pruneRecentBites(now) {
  nibletState.recentBiteTimestamps = nibletState.recentBiteTimestamps.filter(
    (timestamp) => now - timestamp <= RECENT_BITE_WINDOW_MS
  );
  nibletState.biteCountRecent = nibletState.recentBiteTimestamps.length;
}

function updateMood() {
  if (nibletState.bitingDetected) {
    nibletState.mood = "warning";
    return;
  }

  if (nibletState.streakSeconds >= 30) {
    nibletState.mood = "celebrating";
    return;
  }

  if (nibletState.streakSeconds >= 10) {
    nibletState.mood = "happy";
    return;
  }

  if (nibletState.biteCountRecent >= 3) {
    nibletState.mood = "encouraging";
    return;
  }

  nibletState.mood = "neutral";
}

function applyMoodSpeechAndEffects(previousMood) {
  if (nibletState.mood === previousMood) {
    return;
  }

  if (nibletState.mood === "warning") {
    nibletState.speech = pickRandomSuggestion();
    playWarningSound();
    return;
  }

  if (nibletState.mood === "happy") {
    nibletState.speech = "Good progress.";
    return;
  }

  if (nibletState.mood === "celebrating") {
    nibletState.speech = "Goal reached.";
    if (!nibletState.celebratedThisRun) {
      nibletState.celebratedThisRun = true;
      playSuccessSound();
    }
    return;
  }

  if (nibletState.mood === "encouraging") {
    nibletState.speech = "Back on track.";
    return;
  }

  nibletState.speech = "Monitoring.";
}

function updateUIFromState() {
  ui.statusText.textContent = nibletState.monitoring ? "Monitoring..." : "Not Monitoring";
  ui.statusDot.classList.toggle("is-monitoring", nibletState.monitoring);
  ui.statusBadge.classList.toggle("is-monitoring", nibletState.monitoring);
  ui.toggleButton.textContent = nibletState.monitoring ? "Disable Camera" : "Enable Camera";

  ui.bunnyAvatar.className = `bunny-avatar ${nibletState.mood}`;
  ui.bunnySpeech.textContent = nibletState.speech;
  ui.streakDisplay.textContent = `Focus streak: ${formatStreak(nibletState.streakSeconds)}`;
}

function resetStateForMonitoringStop() {
  nibletState.monitoring = false;
  nibletState.bitingDetected = false;
  nibletState.streakSeconds = 0;
  nibletState.biteCountRecent = 0;
  nibletState.mood = "neutral";
  nibletState.lastBiteTimestamp = null;
  nibletState.speech = "Monitoring.";
  nibletState.recentBiteTimestamps = [];
  nibletState.celebratedThisRun = false;
}

async function tick() {
  if (runtime.disposed || !nibletState.monitoring) {
    return;
  }

  const now = Date.now();
  nibletState.bitingDetected = detectNailBiting();

  if (nibletState.bitingDetected) {
    nibletState.streakSeconds = 0;
    nibletState.recentBiteTimestamps.push(now);
    nibletState.lastBiteTimestamp = now;
  } else {
    nibletState.streakSeconds += 1;
    nibletState.xp += 1;
  }

  pruneRecentBites(now);

  const previousMood = nibletState.mood;
  updateMood();
  applyMoodSpeechAndEffects(previousMood);
  updateUIFromState();

  await sendRuntimeMessage({
    type: "DETECTION_RESULT",
    detected: nibletState.bitingDetected,
  });
}

function startTickLoop() {
  stopTickLoop();
  runtime.tickTimer = window.setInterval(() => {
    tick();
  }, TICK_INTERVAL_MS);
}

function stopTickLoop() {
  if (runtime.tickTimer !== null) {
    window.clearInterval(runtime.tickTimer);
    runtime.tickTimer = null;
  }
}

function stopCameraTracks() {
  if (!runtime.mediaStream) {
    return;
  }

  try {
    runtime.mediaStream.getTracks().forEach((track) => track.stop());
  } catch (_error) {
    // Ignore track cleanup errors.
  }

  runtime.mediaStream = null;
  ui.preview.srcObject = null;
}

async function initializeMonitoring() {
  if (runtime.disposed) {
    return;
  }

  try {
    runtime.mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch (_error) {
    resetStateForMonitoringStop();
    updateUIFromState();
    stopCameraTracks();
    return;
  }

  if (runtime.disposed) {
    stopCameraTracks();
    return;
  }

  ui.preview.srcObject = runtime.mediaStream;

  nibletState.monitoring = true;
  nibletState.bitingDetected = false;
  nibletState.streakSeconds = 0;
  nibletState.biteCountRecent = 0;
  nibletState.mood = "neutral";
  nibletState.lastBiteTimestamp = null;
  nibletState.speech = "Monitoring.";
  nibletState.recentBiteTimestamps = [];
  nibletState.celebratedThisRun = false;

  updateUIFromState();
  startTickLoop();
  await sendRuntimeMessage({ type: "START_MONITORING" });
}

async function stopMonitoring() {
  stopTickLoop();
  stopCameraTracks();
  resetStateForMonitoringStop();
  updateUIFromState();
  await sendRuntimeMessage({ type: "STOP_MONITORING" });
}

async function toggleMonitoring() {
  if (nibletState.monitoring) {
    await stopMonitoring();
    return;
  }

  await initializeMonitoring();
}

async function initializePopup() {
  updateUIFromState();

  const response = await sendRuntimeMessage({ type: "GET_STATE" });
  if (!response?.ok) {
    return;
  }

  // Popup stream cannot survive popup close/reopen; always start from local neutral state.
  resetStateForMonitoringStop();
  updateUIFromState();
}

async function disposePopup() {
  if (runtime.disposed) {
    return;
  }
  runtime.disposed = true;
  await stopMonitoring();
}

ui.toggleButton.addEventListener("click", () => {
  toggleMonitoring();
});

window.addEventListener("beforeunload", () => {
  disposePopup();
});

initializePopup();


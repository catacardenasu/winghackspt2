import time

from flask import Flask, jsonify

# Flask app for development mode where model inference is mocked.
app = Flask(__name__)

# Timing constants for deterministic status toggling.
SERVER_START_TS = time.monotonic()
TOGGLE_WINDOW_SECONDS = 5
CYCLE_SECONDS = TOGGLE_WINDOW_SECONDS * 2


def is_biting_now() -> bool:
    """Return True for 5 seconds, then False for 5 seconds, repeating forever."""
    elapsed = time.monotonic() - SERVER_START_TS
    position_in_cycle = elapsed % CYCLE_SECONDS
    return position_in_cycle < TOGGLE_WINDOW_SECONDS


@app.get("/status")
def status() -> tuple:
    # Stable API contract consumed by the extension poller.
    return jsonify({"biting": is_biting_now()}), 200


@app.get("/health")
def health() -> tuple:
    return jsonify({"ok": True}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, threaded=True)

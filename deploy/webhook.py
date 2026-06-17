"""
Gitea / GitHub webhook server — auto-deploy on push to main.

Environment variables (set in the systemd unit or .env):
  WEBHOOK_SECRET   Shared secret configured in the Gitea webhook settings.
                   Used to verify the X-Gitea-Signature-256 / X-Hub-Signature-256 header.
  DEPLOY_BRANCH    Branch that triggers a deploy (default: main).
  REPO_DIR         Absolute path to the cloned repo on this machine.
  COMPOSE_CMD      Full docker compose command to run (default: docker compose up -d --build).
  WEBHOOK_PORT     Port this server listens on (default: 9000).
  LOG_FILE         Path to the deploy log file (default: /var/log/headtilts-deploy.log).

Run:
  pip install flask
  python deploy/webhook.py

Configure Gitea:
  Settings → Webhooks → Add Webhook → Gitea
    Target URL : http://<pi-ip>:9000/webhook
    Secret     : <same as WEBHOOK_SECRET>
    Trigger    : Push events
"""

import hashlib
import hmac
import logging
import os
import subprocess
import sys
from datetime import datetime
from flask import Flask, abort, request

# ── Config ────────────────────────────────────────────────────────────────────
WEBHOOK_SECRET = os.environ["WEBHOOK_SECRET"]          # required — no default
DEPLOY_BRANCH  = os.environ.get("DEPLOY_BRANCH", "main")
REPO_DIR       = os.environ["REPO_DIR"]                # required — e.g. /home/flypi/headtilts
COMPOSE_CMD    = os.environ.get("COMPOSE_CMD", "docker compose up -d --build").split()
WEBHOOK_PORT   = int(os.environ.get("WEBHOOK_PORT", "9000"))
LOG_FILE       = os.environ.get("LOG_FILE", "/var/log/headtilts-deploy.log")

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_FILE),
    ],
)
log = logging.getLogger(__name__)

app = Flask(__name__)


def _verify_signature(payload: bytes, header: str | None) -> bool:
    """Return True if the HMAC-SHA256 signature in the header matches the payload."""
    if not header:
        return False
    # Gitea sends X-Gitea-Signature-256: sha256=<hex>
    # GitHub sends X-Hub-Signature-256: sha256=<hex>
    try:
        algo, received = header.split("=", 1)
    except ValueError:
        return False
    if algo != "sha256":
        return False
    expected = hmac.new(WEBHOOK_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received)


def _run_deploy() -> None:
    """Pull the latest code and rebuild the stack."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log.info("=== Deploy started %s ===", timestamp)

    try:
        # 1. Pull latest commits
        log.info("git pull")
        subprocess.run(
            ["git", "pull"],
            cwd=REPO_DIR,
            check=True,
            capture_output=True,
            text=True,
        )

        # 2. Rebuild and restart containers
        log.info("Running: %s", " ".join(COMPOSE_CMD))
        result = subprocess.run(
            COMPOSE_CMD,
            cwd=REPO_DIR,
            check=True,
            capture_output=True,
            text=True,
        )
        log.info(result.stdout)
        if result.stderr:
            log.warning(result.stderr)

        log.info("=== Deploy finished successfully ===")

    except subprocess.CalledProcessError as exc:
        log.error("Deploy FAILED (exit %d)", exc.returncode)
        log.error("stdout: %s", exc.stdout)
        log.error("stderr: %s", exc.stderr)


@app.post("/webhook")
def webhook():
    payload = request.get_data()

    # Prefer the Gitea header, fall back to GitHub's
    sig_header = (
        request.headers.get("X-Gitea-Signature-256")
        or request.headers.get("X-Hub-Signature-256")
    )
    if not _verify_signature(payload, sig_header):
        log.warning("Rejected webhook — bad signature from %s", request.remote_addr)
        abort(403)

    data = request.get_json(silent=True) or {}
    ref  = data.get("ref", "")          # e.g. "refs/heads/main"

    if ref != f"refs/heads/{DEPLOY_BRANCH}":
        log.info("Ignored push to %s (not %s)", ref, DEPLOY_BRANCH)
        return {"status": "ignored", "ref": ref}, 200

    log.info("Push to %s — triggering deploy", DEPLOY_BRANCH)
    # Run in the background so we can return 200 immediately.
    # The webhook host (Gitea) won't wait for the full docker build.
    import threading
    threading.Thread(target=_run_deploy, daemon=True).start()

    return {"status": "deploying"}, 200


@app.get("/health")
def health():
    return {"status": "ok"}, 200


if __name__ == "__main__":
    log.info("Webhook server starting on port %d", WEBHOOK_PORT)
    log.info("Repo     : %s", REPO_DIR)
    log.info("Branch   : %s", DEPLOY_BRANCH)
    log.info("Compose  : %s", " ".join(COMPOSE_CMD))
    app.run(host="0.0.0.0", port=WEBHOOK_PORT)

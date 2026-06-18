# Headtilts

The Headtilts Webzine CMS — a WordPress-style content platform built as a TypeScript pnpm monorepo.

## Architecture

| App | Description | Port |
| --- | --- | --- |
| `apps/api` | Express + Prisma REST API (MySQL 8) | 3000 |
| `apps/admin` | React admin dashboard (CMS UI) | 5174 (dev; accessed via `localhost:5173/admin/`) |
| `apps/web` | Public website (the webzine itself) | 5173 (dev entry point) |
| `packages/shared` | Shared types, constants, validators | — |

In production all three apps sit behind a single **Nginx** reverse proxy:

- `/` → `apps/web` (public site)
- `/admin/` → `apps/admin` (CMS dashboard)
- `/api/` → `apps/api`
- `/uploads/` → `apps/api` (uploaded media)

This is the recommended deployment path and is what `docker-compose.yml` sets up.

---

## 1. Prerequisites

On the server, install:

- [Docker Engine](https://docs.docker.com/engine/install/) and the Docker Compose plugin (`docker compose version`)
- `git`

You do **not** need Node.js, pnpm, or MySQL on the host — everything runs in containers.

---

## 2. Get the code

```bash
git clone <your-repo-url> headtilts
cd headtilts
```

---

## 3. Configure environment variables

Copy the template env file and edit it:

```bash
cp .env.docker .env
```

All configuration lives in `.env`. `docker-compose.yml` reads everything from there via `${VARIABLE}` substitution — you never need to edit `docker-compose.yml` directly.

| Variable | Purpose | Production guidance |
| --- | --- | --- |
| `HTTP_PORT` | Port nginx binds to on the host | Default `80`; use `8080` or any free port if you can't bind 80 |
| `JWT_SECRET` | Signs access tokens | `openssl rand -hex 32` — must be unique and secret |
| `JWT_REFRESH_SECRET` | Signs refresh tokens | `openssl rand -hex 32` — use a different value from JWT_SECRET |
| `MYSQL_ROOT_PASSWORD` | MySQL root password | Strong unique password; only used during DB init |
| `MYSQL_PASSWORD` | App DB user password | Strong unique password; used by the API at runtime |

### Domain-specific settings

Set these in `.env` to match your production domain:

- `SITE_URL` — public base URL, e.g. `https://example.com`. Used in CORS, sitemap, and robots.txt.
- `WEB_URL` — URL of the public site (usually the same as `SITE_URL`).
- `ADMIN_URL` — URL of the admin panel, e.g. `https://example.com/admin`.
- `VITE_API_URL` — path the browser uses to reach the API. The default `/api` is a relative path that works for any domain because nginx proxies it. Only change this if the API lives on a completely different domain.

### Database credentials

The `.env.docker` template ships with example passwords. **Change `MYSQL_ROOT_PASSWORD` and `MYSQL_PASSWORD` before going live.**

---

## 4. Build and start the stack

```bash
docker compose up -d --build
```

This starts MySQL, the API, the admin dashboard, the public site, and Nginx (listening on `HTTP_PORT`, default 80).

Check everything is healthy:

```bash
docker compose ps
docker compose logs -f api
```

---

## 5. Run the database seed

Migrations run automatically every time the API container starts (via `prisma migrate deploy` in the container's startup command). You only need to run the seed manually — once on first deploy:

```bash
docker compose exec api sh -c "cd apps/api && node_modules/.bin/tsx prisma/seed.ts"
```

The seed script creates default roles, permissions, widget zones, and baseline settings. It is safe to re-run — it only upserts records that don't already exist.

---

## 6. Create your first administrator account

Visit `http://your-domain/admin/` in a browser. While the instance has no
users at all, it automatically shows a **setup page** instead of the login
form — fill in your name, username, email, and password to create the first
account, which is granted the `super-admin` role and signs you straight in.

Once that first account exists, the setup page is permanently disabled
(`POST /api/auth/setup` returns `403 Forbidden`) — all further accounts are
created from the admin's Users page or via `/api/auth/register` (which gets
the low-privilege `subscriber` role).

---

## 7. HTTPS

`docker/nginx.conf` serves plain HTTP on port 80 only. For production, put a TLS-terminating proxy in front of it — the simplest options are:

- Run [Caddy](https://caddyserver.com/) or [Traefik](https://traefik.io/) in front of the `nginx` container and let it handle Let's Encrypt certificates, or
- Add a `certbot`-managed `server { listen 443 ssl; ... }` block to `docker/nginx.conf` and mount your certificates into the `nginx` container.

Don't expose the app over plain HTTP in production — login credentials and JWTs would be sent unencrypted.

---

## 8. Persistent data & backups

Two named volumes hold all persistent state:

- `mysql_data` — the database
- `uploads_data` — uploaded media (`apps/api/uploads`)

Back both up regularly, e.g.:

```bash
# Database dump
docker compose exec mysql mysqldump -u headtilts -p headtilts > backup.sql

# Uploaded media
docker run --rm -v headtilts_uploads_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads-backup.tar.gz -C /data .
```

---

## 9. Updating to a new version

```bash
git pull
docker compose up -d --build
```

Migrations run automatically on startup. If the update also added new seed data, re-run the seed (it is idempotent):

```bash
docker compose exec api sh -c "cd apps/api && node_modules/.bin/tsx prisma/seed.ts"
```

---

## 10. Useful commands

```bash
docker compose logs -f            # tail logs for all services
docker compose restart api        # restart just the API
docker compose down                # stop the stack (volumes are preserved)
```

---

## 11. Auto-deploy webhook (optional)

The `deploy/` directory contains a lightweight webhook server that triggers an automatic redeploy whenever you push to the configured branch on Gitea or GitHub.

**Files:**

- `deploy/webhook.py` — Flask server that verifies HMAC-SHA256 signatures and runs `git pull` + `docker compose up -d --build`
- `deploy/headtilts-webhook.service` — systemd unit to keep the webhook server running

**Setup (on the server):**

```bash
pip install flask

# Edit the unit file and fill in WEBHOOK_SECRET and REPO_DIR
sudo cp deploy/headtilts-webhook.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now headtilts-webhook
```

**Configure Gitea/GitHub:**

Add a webhook pointing to `http://<server-ip>:9000/webhook` with the same secret as `WEBHOOK_SECRET`. Set the trigger to **Push events** on your deploy branch (default: `main`).

The server also exposes `GET /health` for monitoring. Logs go to `LOG_FILE` (default `/var/log/headtilts-deploy.log`).

---

## Local development

For local development without Docker, see the per-app READMEs and use:

```bash
pnpm install
pnpm dev          # runs api, admin, and web together
```

This requires Node.js 18+, pnpm, and a local MySQL 8 instance matching `DATABASE_URL` in `.env`.

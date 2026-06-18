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

After creating your account, a **site configuration wizard** guides you through
the initial site settings (title, tagline, admin email, timezone, and logo).
Every step is optional and skippable — all values can be changed later in
**Settings → General**.

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

---

## Content features

### Logo sizing

Logo dimensions are controlled per-context under **Admin → Settings → General**, below the logo pickers.

| Field | Where it applies | Default |
| --- | --- | --- |
| **Public Logo Height** | Public site header (`<img>` height, px) | 32 px |
| **Admin Logo Height** | Admin sidebar logo (`<img>` max-height, px) | 32 px |

Leave either field blank to use the built-in CSS default (32 px). Width adjusts automatically (`width: auto`) to preserve the aspect ratio. Accepts any integer from 16 to 200.

---

### Polls

Create and manage polls from **Admin → Polls**. Each poll supports single-choice or multi-choice voting, configurable result visibility, optional vote-change, and scheduled open/close dates.

**Public URLs**

| URL | Description |
| --- | --- |
| `/polls` | Listing page — all open polls as a card grid |
| `/polls/:slug` | Dedicated poll page — full interactive widget |

**Embedding polls in post/page content**

Drop a shortcode anywhere in the Quill editor body:

```
[poll slug="your-poll-slug"]
```

The frontend detects and replaces it with a live, interactive poll widget. The shortcode works inside any `<p>` wrapper the editor adds automatically.

**Poll widget in the sidebar**

In **Admin → Widgets**, create a widget with type **Poll**:

| Config field | Description |
| --- | --- |
| Number of polls to show | `1` shows a single poll; `2–10` enables a carousel |
| Specific poll (optional) | Pin a particular poll by slug; leave blank to auto-pull the latest open polls |

When count > 1, the sidebar renders a carousel with ‹ › navigation arrows and dot indicators.

**CSV export** — each poll has a download button on the Polls list page that exports all votes as CSV.

---

### Widgets

All widget zones are managed at **Admin → Widgets**. Drag widgets into zones to arrange them; the sidebar zone is called `sidebar`.

| Widget type | Description |
| --- | --- |
| Text / HTML | Free-form HTML content |
| Menu / Links | A list of links (internal pages or external URLs) |
| Recent Posts | Latest published posts |
| Featured Posts (Grid) | Featured-post card grid |
| Latest Posts (Small Thumbnails) | Compact numbered post list with thumbnails |
| Category Posts (Grid + View All) | Posts from a chosen category with a "View all" link |
| Categories | Category list with optional post counts |
| Tags | Flat tag list |
| **Tag Cloud** | Tag cloud sized by post count; optional count superscripts; hides tags with zero posts |
| Calendar | Monthly calendar with post-day links |
| Search Form | Site search input |
| **Poll** | Interactive poll widget with optional carousel (see [Polls](#polls)) |

**Tag Cloud config**

| Field | Description |
| --- | --- |
| Maximum tags | Cap on how many tags appear (default 40, max 100) |
| Show post count | Toggle a superscript count next to each tag name |

---

### Shortcodes

Shortcodes can be used inside post and page content in the Quill editor. They are resolved at render time on the public site.

| Shortcode | Output |
| --- | --- |
| `[site_name]` | Site title |
| `[site_tagline]` | Site tagline |
| `[site_description]` | Site description |
| `[site_url]` | Public site URL |
| `[year]` | Current four-digit year |
| `[current_date]` | Today's date (respects `date_format` setting; override with `format="…"`) |
| `[post_title]` | Title of the current post or page |
| `[post_author]` | Author name(s) |
| `[post_date]` | Publish date (respects `date_format`; override with `format="…"`) |
| `[post_excerpt]` | Post excerpt |
| `[poll slug="…"]` | Embeds a live interactive poll widget |

---

## REST API & API keys

Headtilts exposes its full data API at `/api/*`. All write endpoints and most read endpoints require authentication. There are two authentication methods:

| Method | Use case |
| --- | --- |
| **JWT** (Bearer token) | Admin UI and browser-based apps that log in interactively |
| **API key** (`X-API-Key` header) | Scripts, CI pipelines, external integrations, headless clients |

### Creating an API key

1. Go to **Admin → Settings → API Keys**.
2. Click **New Key**, give it a name, choose an expiry (optional), and tick the scopes it needs.
3. Click **Create Key** — the full key is shown **once** in a reveal banner. Copy it immediately.
4. The key list shows only the prefix (`htk_xxxxxxxx…`) from that point on.

Keys are owned by the user who created them. A key can never grant more access than its owner's RBAC permissions.

### Using a key

Pass the key in the `X-API-Key` request header. No `Authorization: Bearer` header is needed when using a key.

```bash
# List published posts
curl https://your-site.com/api/posts \
  -H "X-API-Key: htk_your_key_here"

# Create a post (requires posts:write scope)
curl -X POST https://your-site.com/api/posts \
  -H "X-API-Key: htk_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"title": "Hello world", "content": "<p>…</p>", "status": "draft"}'

# Upload media (requires media:write scope)
curl -X POST https://your-site.com/api/media \
  -H "X-API-Key: htk_your_key_here" \
  -F "file=@photo.jpg"
```

If the key lacks a required scope the API returns:

```json
{ "success": false, "error": { "code": "FORBIDDEN", "message": "API key missing required scope: posts:write" } }
```

### Available scopes

| Scope | Grants |
| --- | --- |
| `posts:read` | `GET /api/posts`, `GET /api/posts/:id` |
| `posts:write` | `POST /api/posts`, `PUT /api/posts/:id`, `PATCH /api/posts/:id` |
| `posts:delete` | `DELETE /api/posts/:id` |
| `pages:read` | Read pages (same endpoints as posts, filtered by type) |
| `pages:write` | Create / update pages |
| `pages:delete` | Delete pages |
| `media:read` | `GET /api/media` |
| `media:write` | Upload, rename, move media |
| `media:delete` | Delete media |
| `polls:read` | `GET /api/polls`, `GET /api/polls/:id` |
| `polls:write` | Create / update polls |
| `polls:delete` | Delete polls |
| `categories:read` | `GET /api/categories` |
| `categories:write` | Create / update categories |
| `tags:read` | `GET /api/tags` |
| `tags:write` | Create / update tags |
| `comments:read` | `GET /api/comments` |
| `comments:write` | Moderate / update comments |
| `comments:delete` | Delete comments |
| `settings:read` | `GET /api/settings` |
| `users:read` | `GET /api/users` |

Scope enforcement is inferred from the HTTP method and URL path:
- `GET` → `:read`
- `POST` / `PUT` / `PATCH` → `:write`
- `DELETE` → `:delete`

Public endpoints under `/api/public/*` do not require any authentication or scope.

### Key management endpoints

All endpoints below require a valid JWT (admin session) or an API key belonging to the same user.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/api-keys` | List your keys (prefix + metadata, never the raw key) |
| `GET` | `/api/api-keys/scopes` | List all valid scope strings |
| `POST` | `/api/api-keys` | Create a new key — returns the raw key once |
| `PATCH` | `/api/api-keys/:id` | Update name, scopes, or expiry |
| `DELETE` | `/api/api-keys/:id` | Revoke (permanently delete) a key |

**Create request body:**

```json
{
  "name": "My integration",
  "scopes": ["posts:read", "media:read"],
  "expiresAt": "2027-01-01"
}
```

`expiresAt` is optional. Keys with no expiry remain valid until explicitly revoked.

**Create response (key shown once):**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "My integration",
    "prefix": "htk_a1b2c3d4",
    "scopes": ["posts:read", "media:read"],
    "expiresAt": "2027-01-01T00:00:00.000Z",
    "lastUsedAt": null,
    "createdAt": "2026-06-18T12:00:00.000Z",
    "rawKey": "htk_a1b2c3d4e5f6…"
  }
}
```

---

## Local development

For local development without Docker, see the per-app READMEs and use:

```bash
pnpm install
pnpm dev          # runs api, admin, and web together
```

This requires Node.js 18+, pnpm, and a local MySQL 8 instance matching `DATABASE_URL` in `.env`.

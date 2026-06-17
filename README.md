# Headtilts

The Headtilts Webzine CMS — a WordPress-style content platform built as a TypeScript pnpm monorepo.

## Architecture

| App | Description | Port |
| --- | --- | --- |
| `apps/api` | Express + Prisma REST API (MySQL 8) | 3000 |
| `apps/admin` | React admin dashboard (CMS UI) | 5173 |
| `apps/web` | Public website (the webzine itself) | 4173 |
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

Copy the example env file and edit it:

```bash
cp .env.example .env
```

| Variable | Purpose | Production guidance |
| --- | --- | --- |
| `JWT_SECRET` | Signs access tokens | Generate a long random value, e.g. `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | Signs refresh tokens | Different long random value |

These two are read by `docker-compose.yml` and **must** be changed from their defaults — anyone who knows the default secret can forge valid login tokens.

### Domain-specific settings

`docker-compose.yml` also hardcodes a few URLs that assume `http://localhost`. Before building, edit `docker-compose.yml` and replace `http://localhost` with your real domain (e.g. `https://example.com`) in:

- `api.environment.ADMIN_URL`, `api.environment.WEB_URL`, `api.environment.SITE_URL` — used for CORS allow-listing
- `admin.build.args.VITE_API_URL` and `web.build.args.VITE_API_URL` — **baked into the static build at image-build time**, so these must point at the public URL clients will actually use (e.g. `https://example.com/api`)
- `web.build.args.VITE_SITE_NAME` — display name for the public site

### Other settings to review

- `api.environment.NODE_ENV` is set to `development` in the shipped `docker-compose.yml`. Change it to `production`.
- `api` and `mysql` ports (`3000` and `3306`) are published directly to the host. Unless you need direct access for debugging, remove these `ports:` mappings so only Nginx (port 80) is reachable from outside.

### Database credentials

The `mysql` service in `docker-compose.yml` ships with default credentials (`headtilts` / `headtilts`, root password `root`). For production, change `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, and the matching `DATABASE_URL` in the `api` service to a strong, unique password.

---

## 4. Build and start the stack

```bash
docker compose up -d --build
```

This starts MySQL, the API, the admin dashboard, the public site, and Nginx (listening on port 80).

Check everything is healthy:

```bash
docker compose ps
docker compose logs -f api
```

---

## 5. Run database migrations and seed data

The first time you deploy (and after every update that includes new migrations):

```bash
docker compose exec api npx prisma migrate deploy
docker compose exec api node --loader ts-node/esm prisma/seed.ts
```

The seed script creates default roles/permissions, widget zones, and baseline settings. It is safe to re-run — it only upserts records that don't already exist.

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
docker compose exec api npx prisma migrate deploy
```

---

## 10. Useful commands

```bash
docker compose logs -f            # tail logs for all services
docker compose restart api        # restart just the API
docker compose down                # stop the stack (volumes are preserved)
```

---

## Local development

For local development without Docker, see the per-app READMEs and use:

```bash
pnpm install
pnpm dev          # runs api, admin, and web together
```

This requires Node.js 18+, pnpm, and a local MySQL 8 instance matching `DATABASE_URL` in `.env`.

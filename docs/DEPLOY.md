# Deploying leumaplanner.com

Production runs `compose.prod.yaml` on one small server: Postgres, the API, and Caddy (serves the
web app, proxies `/api` and `/auth`, and gets HTTPS certificates automatically).

Current host: a DigitalOcean Basic droplet (Ubuntu 24.04, 1 GB RAM, $6/month). The same setup
runs anywhere Docker does (for example the DGX Spark behind a Cloudflare Tunnel later).

## One-time setup

1. **Droplet.** Ubuntu 24.04 LTS, Basic, 1 GB / 1 vCPU, nearest US region. Add the deploy SSH
   public key. Note the droplet's public IPv4.
2. **DNS (Squarespace).** Replace the parking records: `A @ → <droplet IP>` and
   `A www → <droplet IP>` (or `CNAME www → leumaplanner.com`). Remove Squarespace's default
   A/CNAME records for `@` and `www`.
3. **Discord.** In the Discord developer portal → OAuth2 → Redirects, add
   `https://leumaplanner.com/auth/discord/callback`.
4. **Server.** As root over SSH:
   - 2 GB swap (lets a 1 GB droplet build the images), Docker Engine + Compose plugin, `ufw`
     allowing 22, 80, 443.
   - `git clone https://github.com/baraon/lmu-race-planner.git /opt/leuma`
   - `/opt/leuma/.env` (mode 600) with: `POSTGRES_USER`, `POSTGRES_PASSWORD` (random),
     `POSTGRES_DB`, `SESSION_SECRET` (random, 32+ chars), `APP_URL=https://leumaplanner.com`,
     `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`,
     `DISCORD_REDIRECT_URI=https://leumaplanner.com/auth/discord/callback`,
     `SITE_ADDRESS="leumaplanner.com, www.leumaplanner.com"`.
     Secrets are generated on the server; never commit or paste them anywhere.
5. **Start.** `cd /opt/leuma && docker compose -f compose.prod.yaml up -d --build`.
   Caddy fetches certificates once DNS points at the droplet.

## Updating

```bash
ssh root@<droplet> 'cd /opt/leuma && git pull && docker compose -f compose.prod.yaml up -d --build'
```

Migrations run automatically when the API starts.

## Checks

- `https://leumaplanner.com/api/health` → `{"status":"ok","db":"ok",...}`
- `https://www.leumaplanner.com/` redirects to `https://leumaplanner.com/`
- Sign in with Discord works end to end.

## Backups

Not set up yet (next step): nightly `pg_dump` to off-site storage, plus a tested restore.

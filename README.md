# Garage

A self-hosted logbook for project and daily cars: service history, fill-ups, reminders, a build board, parts and paperwork, shared with whoever works on the cars with you.

**Status:** being built screen by screen from the Claude Design handoff. Done so far: sign-in (profiles and PINs), the Garage home, every car tab except Photos and Manual, the dialogs, the Shelf and Shopping list, file uploads (car photos and documents), Settings, and Admin settings for sign-in, people, AI help, email (SMTP) and the activity log. Two-factor sign-in works with authenticator apps. Tasks have an Ask AI button once an admin turns AI help on (Anthropic, any OpenAI-compatible API, or a local Ollama). Email can be set up and tested; reminder digests and alerts aren't sent yet. The Cloudflare tunnel is set up from Admin settings: Garage creates the tunnel, its route, the DNS record and a Cloudflare Access policy through the Cloudflare API, and runs the bundled `cloudflared`. The `.env` export, passkeys, OAuth2 and the LubeLogger import are still to come. Their buttons are already in place and say so when clicked.

## Run it

```bash
docker run -d --name garage -p 3000:3000 -v garage-data:/data ghcr.io/trentnbauer/garage:latest
```

Then open http://localhost:3000. On first run Garage starts with a sample garage, and the admin profile **You** asks you to create a PIN.

Everything lives in `/data`: `garage.db` (SQLite) and `files/` (photos and documents). Back up that volume. The AI API key, SMTP password and Cloudflare tokens are kept in `garage.db` and are never sent to the browser.

| Variable | Default | |
|---|---|---|
| `PORT` | `3000` | |
| `DATA_DIR` | `/data` | Where `garage.db` is kept |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | | Set up and run the Cloudflare tunnel on every start |
| `APP_HOSTNAME` | | The address the tunnel serves, e.g. `garage.example.com` |
| `ACCESS_EMAILS` | | Comma-separated emails or `@domains` Cloudflare Access lets in. Blank means public |
| `TUNNEL_TOKEN` | | Run a tunnel you made in the Cloudflare dashboard instead (routes and DNS are up to you) |

## Develop

Needs Node 22.13 or later (the server uses the built-in `node:sqlite`).

```bash
cd web && npm ci && npm run build   # build the app the server serves
cd ../server && npm ci && npm start          # http://localhost:3000, data in ./data
```

For live reload, run `npm run dev` in `web/` as well. Vite proxies `/api` to the server on port 3000.

Tests: `npm test` in `web/` checks the logic against the design's figures, and `npm test` in `server/` checks sign-in, saving, the SMTP client and the AI providers (against fakes, so no keys are needed). The server needs `npm ci` in `server/` first.

The public demo (`npx vite build --config vite.demo.config.ts`) runs the same app with the sample data in memory and saves nothing.

## Versions and releases

Every pull request needs exactly one label: `release: fix`, `release: minor`, `release: major` or `release: none`. When it merges into `main`, that label sets the next version (see `.github/scripts/next-version.sh`). A tag and GitHub release are created, and the Docker image is published to `ghcr.io/trentnbauer/garage`. `release: none` publishes nothing.

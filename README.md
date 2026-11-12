# Smartdorm · IPES Residence

A mobile-first shared-utility dashboard with an Express API and persistent SQLite database. The frontend stays on Netlify; the API runs at **https://api-ipes.chimaobi.xyz**.

## Run locally

Requires Node.js 22 or later.

```sh
npm ci
cp .env.example .env
# Set DEMO_RESET_PIN in .env before enabling presentation reset.
node --env-file=.env server/index.js
```

Open http://127.0.0.1:3015. `npm start` also works when variables are already in the environment. The backend serves `dist/` for development. Netlify serves the same files in production and proxies `/api/*` to the API (see `netlify.toml`).

## Using the application

- The shared presentation opens without signing up. All visitors act as the same mock resident, Emeka. Changes are visible to everyone trying the presentation; admin/resident view is session-specific.
- Presentation controls simulate wash completion, storage time and unusual weight readings. One small Demo Mode indicator identifies the presentation. All appliance data is simulated, including for registered accounts.
- The reset control is centered at the bottom of Overview. It requires the server-configured confirmation PIN. Reset restores only the shared presentation; account records are preserved.
- The initial presentation basket is **B-04**, PIN **4829**. Other basket PINs are chosen when reserving or assigning a basket. PINs are never returned by the API or logged.
- Account creation needs only a pseudonymous username and password (10–128 characters). Use made-up usernames and a disposable password. Accounts share a separate residence dataset; ownership is enforced by the API.
- Washer reservations specify a real date/time and a 30, 45 or 60 minute cycle. Future bookings do not start automatically. Overlaps are rejected inside a database transaction. Start a cycle at its booked time; completed loads remain occupied until collection.
- Weight changes and access events are recorded. Unusual changes are observations to review, **never proof of theft**. Storage age is only a reminder and does not establish food safety.
- Notifications appear in-app while it is open. Status refreshes every four seconds; displayed countdowns update every second. Timed transitions are reconciled on the next API request, even after a browser closes.

## Backend deployment

This server uses the existing Docker `proxy` network and Nginx Proxy Manager. The API exposes no public Docker host port. Its SQLite data persists in the `smart-dorm-campus_smartdorm-data` volume.

```sh
# Create .env with DEMO_RESET_PIN and ALLOWED_ORIGINS first.
docker compose up -d --build
```

Proxy host: `api-ipes.chimaobi.xyz` → `http://smartdorm-api:3015`, with HTTPS enabled. Its certificate is managed and renewed by Nginx Proxy Manager. Netlify's publish directory is `dist` and build command is `npm run build`.

To grant an existing registered account administrator permissions:

```sh
docker compose exec smartdorm-api node server/admin.js chosen_username
```

There is no public administrator registration. Server passwords and basket PINs use salted scrypt hashes, session tokens are random and stored hashed, and authentication/PIN/reset attempts are rate limited. Sessions expire after seven days. The frontend keeps its bearer token in session storage, which survives reloads but ends when the tab session ends. This is a presentation MVP: account recovery/email verification, browser push, device credentials, device command acknowledgement and a hardware gateway are future integrations.

## API

All paths below begin with `/api`. Authenticated calls use `Authorization: Bearer <token>`. JSON mutations return the updated authorized `state`. Errors use `{ "error": "message" }` with an appropriate HTTP status. Do not send untrusted hardware readings directly into the presentation controls: add a separately authenticated gateway for actual devices.

| Method | Endpoint                | Body / purpose                                                      |
| ------ | ----------------------- | ------------------------------------------------------------------- |
| GET    | `/health`               | Public health check                                                 |
| POST   | `/auth/demo`            | Open the shared presentation                                        |
| POST   | `/auth/register`        | `{username,password}`; returns token                                |
| POST   | `/auth/login`           | `{username,password}`; returns token                                |
| POST   | `/auth/logout`          | Revoke current session                                              |
| GET    | `/state`                | Current authorized appliances, baskets, bookings, events and alerts |
| POST   | `/bookings`             | `{applianceId,start,duration}`; start is Unix milliseconds          |
| PATCH  | `/bookings/:id`         | `{action:"start"                                                    | "cancel"                          | "collect"}`                    |
| POST   | `/microwaves/:id`       | `{action:"start",minutes:1                                          | 3                                 | 5}`or`{action:"stop"}`         |
| POST   | `/baskets/:id/reserve`  | `{pin}`                                                             |
| POST   | `/baskets/:id/unlock`   | `{pin}`                                                             |
| POST   | `/baskets/:id/weight`   | `{delta:0.25}` or `{delta:-0.25}` while unlocked                    |
| POST   | `/baskets/:id/lock`     | `{}`                                                                |
| POST   | `/baskets/:id/release`  | `{}`; basket must be empty                                          |
| GET    | `/admin/users`          | Admin-only assignment list                                          |
| PATCH  | `/admin/appliances/:id` | `{status:"available"                                                | "offline"}`; idle appliances only |
| PATCH  | `/admin/baskets/:id`    | `{ownerId,pin}`; empty baskets only; null owner releases            |
| PATCH  | `/alerts/:id`           | `{}`; admin marks reviewed                                          |
| POST   | `/demo`                 | `{action:"complete"                                                 | "age"                             | "anomaly"}`; presentation only |
| POST   | `/demo`                 | `{action:"role",role:"student"                                      | "admin"}`; presentation only      |
| POST   | `/demo`                 | `{action:"reset",pin}`; validates server secret                     |

For example, after signing in and setting a token in your shell:

```sh
curl https://api-ipes.chimaobi.xyz/api/state \
  -H "Authorization: Bearer $SMARTDORM_TOKEN"
```

## Validation and backup

```sh
npm test            # API integration tests, including concurrent conflict handling
npm run build       # JavaScript syntax checks
npx playwright install chromium
npm start           # in another terminal; set a test reset PIN in the environment
npm run test:browser
```

Browser tests mutate the shared presentation and create a test account. Run against a local disposable database, not an active presentation. `TEST_URL`, `TEST_RESET_PIN` and optional `BROWSER_EXECUTABLE` configure them. Screenshots go to ignored `test-results/`.

Back up SQLite through its backup API while running (do not copy only the main file while WAL is active):

```sh
docker compose exec smartdorm-api node --input-type=module -e \
  "import Database from 'better-sqlite3';const db=new Database('/data/smartdorm.sqlite');await db.backup('/data/backup.sqlite');db.close()"
docker cp smartdorm-api:/data/backup.sqlite ./smartdorm-backup.sqlite
```

Keep backups and `.env` private. Do not remove the Docker data volume during updates.

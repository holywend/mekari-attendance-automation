# Talenta Attendance

Automated Talenta clock-in / clock-out with self-healing auth.

## ⚠️ Use at your own risk

Read this before you clone, install, or run anything in this repo.

- **This is not an official Talenta or Mekari project.** It impersonates the official iOS app by replaying its mobile API. The endpoints, headers, selectors, and login flow can change at any time and break this tool without notice.
- **Automating attendance may violate your employer's policy and/or Talenta's Terms of Service.** Submitting clock-ins you didn't physically perform can be treated as time-theft or fraud in many jurisdictions and most employment contracts. Make sure you have a legitimate reason and, if there's any doubt, get it in writing from your manager or HR before turning this on.
- **Your credentials live on the machine that runs this.** Email, password, session cookie, and bearer token sit in `.env` and `storage/credentials.json` in plaintext. Anyone with access to that machine (or its backups) can clock in and out as you, read your attendance, and potentially access other Mekari data. Run this only on a personal device you control. Don't run it on shared infrastructure.
- **The cold-path login uses headless Playwright against the real Mekari login form.** If Mekari's anti-fraud or rate-limiting flags repeated automated logins, your *real* account can get locked out, captcha-walled, or escalated to a human reviewer. The plan is to leave login as a once-per-week-or-rarer fallback; if you start hitting it daily, something is wrong, stop and investigate.
- **Personal data leaves your laptop.** Every clock action sends a real selfie, GPS coordinates, and a device fingerprint to Talenta. Make sure the GPS coordinates and selfie you configure are ones you're comfortable submitting unattended, every working day, possibly while you're not even looking.
- **No warranty, no support.** The author offers this code as a personal-automation example. If it breaks, mis-clocks, double-clocks, fails silently, or causes any consequences with your employer or with Talenta, that's on you. Read the source before you trust it.

By cloning, installing, or running this tool, you acknowledge that you've read the above and accept the risk.

## How it works

1. The app reads non-secret config (device model, OS version, photo paths) from `config/talenta.json`, and reads everything sensitive (company id, location, device id, schedule id, bootstrap creds, login credentials) from `.env`.
2. Before each clock action it asks the auth manager for valid credentials. If the on-disk creds in `storage/credentials.json` are <6 days old, it uses them as-is.
3. If creds are stale, it pings Talenta's session-refresh endpoint with the current cookie. On success, the rotated session is written to disk.
4. If the refresh returns anything other than a valid rotated session, it logs in headless via Playwright using `TALENTA_EMAIL` / `TALENTA_PASSWORD` from `.env`, then writes the fresh session to disk.

The week-old "go copy `document.cookie` from devtools" ritual is gone — the scheduler keeps itself authenticated.

## Setup

1. Install:
   ```bash
   make install
   bunx playwright install chromium
   ```

2. Copy the example files and fill in your values:
   ```bash
   cp .env.example .env
   chmod 600 .env
   cp config/talenta.example.json config/talenta.json
   ```

3. Edit `.env` — at minimum:
   - `TALENTA_EMAIL`, `TALENTA_PASSWORD` — your Mekari login (used for the cold-path Playwright login).
   - `TALENTA_COMPANY_ID` — your tenant id.
   - `TALENTA_LATITUDE`, `TALENTA_LONGITUDE` — the GPS coordinates the clock action submits.
   - `TALENTA_DEVICE_ID` — the device id Talenta's mobile API uses to fingerprint your device.
   - `TALENTA_OFFICE_HOUR_ID` — your shift / office-hour record id.

   Optional one-time bootstrap (only used until first refresh writes `storage/credentials.json`):
   - `TALENTA_BOOTSTRAP_COOKIE`, `TALENTA_BOOTSTRAP_AUTH_TOKEN`.

4. Edit `config/talenta.json` to point `photos` at one or more selfies you've placed in `storage/photos/`.

### Finding your `company_id`, `device_id`, and `office_hour_id`

These come from the Talenta mobile API. The easiest way to capture them is to look at a `POST /attendance_clocks` request from the official iOS app via a network proxy (Proxyman, Charles, mitmproxy):

- The URL contains your `company_id`: `…/organisations/<company_id>/attendance_clocks`.
- The form body contains `attendance_office_hour_id`.
- The `X-Device-ID` header is your `device_id`.

For the cookie + auth_token bootstrap (optional), the README's snippet still works:

```js
// In Chrome devtools on https://hr.talenta.co/employee/dashboard:
document.cookie  // → TALENTA_BOOTSTRAP_COOKIE
decodeURI(document.cookie.split('; _session_token=').pop().split(';').shift()).split('"')[3]
// → TALENTA_BOOTSTRAP_AUTH_TOKEN
```

### Photos
Put selfies in `storage/photos/` (gitignored) and list their paths in `config/talenta.json`. The clock action picks one at random per request.

## Commands

Run `make` to list targets.

### Daily scheduler (recommended)

Runs in the background, clocks in/out at the configured times every day, survives idle sleep via `caffeinate`:

```bash
make schedule-bg CLOCKIN_TIME=09:00 CLOCKOUT_TIME=18:00
```

Then:

```bash
make status   # is it running?
make logs     # tail what it's doing (Ctrl-C to stop tailing)
make stop     # kill the scheduler
```

The scheduler refreshes its session lazily — if creds are older than 6 days it pings the refresh endpoint, and if that fails it logs in headless via Playwright using `.env`. You don't need to touch anything weekly.

**Lid-close caveat:** `caffeinate` blocks idle sleep but not lid-close on battery. Plug into power if you want it to survive a closed lid. For "survives reboot / sleep / wake" you'd want a launchd LaunchAgent — not currently shipped.

### One-shot

```bash
make cycle              # clock-in, wait 10s, clock-out
make cycle DELAY=30     # longer gap (Talenta has a ~4s minimum)
```

### Foreground scheduler (for debugging)

```bash
make schedule CLOCKIN_TIME=09:00 CLOCKOUT_TIME=18:00
```

## Auth lifecycle

- All auth events are logged to `storage/attendance.log`.
- `storage/credentials.json` holds the current rotating session. Delete it to force a fresh login on next run.
- The 6-day refresh threshold and the URLs/selectors live in `src/auth/`.

# Gym sessions — with a persistent log

A single Node server. Serves the session page and appends every completed
session to `log.jsonl` on a mounted disk. No npm dependencies.

```
server.js          the whole backend (~150 lines)
package.json       tells Railway to run `node server.js`
public/index.html  the session page
```

## What you need first

1. **Node installed** — nodejs.org, macOS LTS installer. This is what was
   missing when `npx` failed earlier.
2. **A GitHub account.**

## Deploy

### 1. Put this folder on GitHub

On github.com: **New repository** → name it `gym-sessions` → Private → Create.
On the empty repo page, click **uploading an existing file**, then drag in
`server.js`, `package.json`, and the `public` folder. Commit.

### 2. Create the Railway service

On railway.app: **New Project** → **Deploy from GitHub repo** → pick
`gym-sessions`. It detects Node and deploys. First build takes about a minute.

### 3. Attach the volume — do not skip this

Without a volume the log is wiped on every redeploy, which is the whole
problem you're solving.

Service → **Settings** → **Volumes** → **New Volume**
Mount path: `/data`

The service restarts with the disk attached.

### 4. Make it reachable

Service → **Settings** → **Networking** → **Generate Domain**.
You get something like `gym-sessions-production.up.railway.app`.

Open it on your phone, Share → **Add to Home Screen**.

### 5. Lock it down (recommended)

Anyone with the URL can read and write the log. To stop that:

Service → **Variables** → New Variable → `GYM_KEY` = any passphrase.

The page will then say the log needs a key. Tap that line, enter the
passphrase once, and it's remembered on that phone.

## How the syncing behaves

The page writes to your phone first, then pushes to the server. If the
gym wifi is bad the session is still saved locally and pushed next time
the page opens. Nothing is lost by being offline.

The **Sync** line at the bottom tells you the current state, and **Sync now**
forces it.

## Checking it's healthy

Visit `/api/health` on your deployed URL:

```json
{"ok":true,"writable":true,"entries":12,"keyRequired":true}
```

`writable: false` means the volume isn't mounted at `/data` — go back to step 3.

## Getting your data out

`GET /api/log` returns everything as JSON. The raw file is newline-delimited
JSON, one session per line, so it drops straight into a spreadsheet.

## Cost

Railway bills for uptime. A service this small sits at the bottom of their
usage-based pricing — expect a few dollars a month. Check current rates at
railway.com/pricing, and delete the service if you stop using it.

## Updating the sessions later

Replace `public/index.html` in the GitHub repo. Railway redeploys
automatically. The volume is untouched, so your history survives.

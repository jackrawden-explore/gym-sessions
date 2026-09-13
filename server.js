/* Gym session log server — no dependencies, Node 18+ */
const http = require("http");
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || "/data";
const LOG_FILE = path.join(DATA_DIR, "log.jsonl");
const KEY = process.env.GYM_KEY || "";
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");

/* make sure the volume directory exists and is writable */
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, "");
  console.log("log file ready at", LOG_FILE);
} catch (e) {
  console.error("CANNOT WRITE TO", DATA_DIR, "-", e.message);
  console.error("On Railway, attach a volume mounted at this path.");
}

function readEntries() {
  let raw;
  try { raw = fs.readFileSync(LOG_FILE, "utf8"); }
  catch (e) { return []; }
  const out = [];
  for (const line of raw.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      const o = JSON.parse(s);
      if (o && o.session && o.date) out.push(o);
    } catch (e) { /* skip a corrupt line rather than lose the file */ }
  }
  return out;
}

/* one entry per session+date+rpe; appending the same thing twice is a no-op */
const keyOf = (e) => `${e.session}|${e.date}|${e.rpe}`;

function appendEntries(incoming) {
  const existing = new Set(readEntries().map(keyOf));
  const fresh = [];
  for (const raw of incoming) {
    if (!raw || typeof raw !== "object") continue;
    const e = {
      session: String(raw.session || "").slice(0, 60),
      date: String(raw.date || "").slice(0, 10),
      rpe: Number(raw.rpe) || null,
      at: new Date().toISOString()
    };
    if (!e.session || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    if (e.rpe !== null && (e.rpe < 1 || e.rpe > 5)) e.rpe = null;
    const k = keyOf(e);
    if (existing.has(k)) continue;
    existing.add(k);
    fresh.push(e);
  }
  if (fresh.length) {
    fs.appendFileSync(LOG_FILE, fresh.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }
  return fresh.length;
}

function send(res, code, body, type) {
  res.writeHead(code, {
    "Content-Type": type || "application/json",
    "Cache-Control": type === "text/html" ? "no-cache" : "no-store"
  });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function authed(req) {
  if (!KEY) return true;
  const h = req.headers["x-gym-key"];
  return typeof h === "string" && h === KEY;
}

function readBody(req, cb) {
  let b = "";
  let tooBig = false;
  req.on("data", (c) => {
    b += c;
    if (b.length > 200000) { tooBig = true; req.destroy(); }
  });
  req.on("end", () => cb(tooBig ? null : b));
  req.on("error", () => cb(null));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;

  if (req.method === "OPTIONS") return send(res, 204, "");

  /* ---- API ---- */
  if (p === "/api/log") {
    if (!authed(req)) return send(res, 401, { error: "bad key" });

    if (req.method === "GET") {
      return send(res, 200, { entries: readEntries() });
    }

    if (req.method === "POST") {
      return readBody(req, (body) => {
        if (body === null) return send(res, 413, { error: "too large" });
        let parsed;
        try { parsed = JSON.parse(body); }
        catch (e) { return send(res, 400, { error: "bad json" }); }
        const list = Array.isArray(parsed) ? parsed : [parsed];
        try {
          const n = appendEntries(list);
          return send(res, 200, { added: n, entries: readEntries() });
        } catch (e) {
          console.error("write failed:", e.message);
          return send(res, 500, { error: "write failed" });
        }
      });
    }

    if (req.method === "DELETE") {
      try { fs.writeFileSync(LOG_FILE, ""); return send(res, 200, { cleared: true }); }
      catch (e) { return send(res, 500, { error: "clear failed" }); }
    }

    return send(res, 405, { error: "method not allowed" });
  }

  if (p === "/api/health") {
    let writable = false;
    try { fs.accessSync(DATA_DIR, fs.constants.W_OK); writable = true; } catch (e) {}
    return send(res, 200, { ok: true, writable, entries: readEntries().length, keyRequired: !!KEY });
  }

  /* ---- static ---- */
  const file = p === "/" ? "index.html" : p.replace(/^\/+/, "");
  const safe = path.normalize(file).replace(/^(\.\.[/\\])+/, "");
  const full = path.join(PUBLIC, safe);
  if (!full.startsWith(PUBLIC)) return send(res, 403, "forbidden", "text/plain");

  fs.readFile(full, (err, buf) => {
    if (err) return send(res, 404, "not found", "text/plain");
    const ext = path.extname(full).toLowerCase();
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
    send(res, 200, buf, types[ext] || "application/octet-stream");
  });
});

server.listen(PORT, () => console.log("listening on", PORT, "| key required:", !!KEY));

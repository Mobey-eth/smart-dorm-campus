import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import Database from "better-sqlite3";
import { randomBytes, createHash, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  id,
  hash,
  verify,
  fail,
  event,
  initial,
  settle,
  complete,
  publicState,
} from "./domain.js";
const scrypt = promisify(scryptCb);
async function passwordHash(password, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${Buffer.from(await scrypt(password, salt, 32)).toString("hex")}`;
}
const digest = (t) => createHash("sha256").update(t).digest("hex");
export function createApp({ dbPath = ":memory:", limits = true } = {}) {
  if (dbPath !== ":memory:")
    mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student');
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,workspace TEXT NOT NULL,role TEXT,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,state TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS pin_attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,until INTEGER NOT NULL);`);
  db.prepare("INSERT OR IGNORE INTO workspaces VALUES (?,?)").run(
    "shared",
    JSON.stringify(initial()),
  );
  db.prepare("INSERT OR IGNORE INTO workspaces VALUES (?,?)").run(
    "demo",
    JSON.stringify(initial(true)),
  );
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", Number(process.env.TRUST_PROXY || 0));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "style-src": ["'self'", "'unsafe-inline'"],
          "script-src": ["'self'"],
          "upgrade-insecure-requests":
            process.env.NODE_ENV === "production" ? [] : null,
        },
      },
    }),
  );
  app.use(express.json({ limit: "16kb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const origin = req.get("origin");
    const allowed = (process.env.ALLOWED_ORIGINS || "").split(",");
    if (origin && allowed.includes(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
      res.vary("Origin");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PATCH, DELETE, OPTIONS",
      );
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  if (limits)
    app.use(
      "/api",
      rateLimit({
        windowMs: 60000,
        limit: 240,
        standardHeaders: "draft-8",
        legacyHeaders: false,
      }),
    );
  const authLimit = limits
    ? rateLimit({
        windowMs: 15 * 60000,
        limit: 25,
        standardHeaders: "draft-8",
        legacyHeaders: false,
      })
    : (req, res, next) => next();
  app.get("/api/health", (_, res) =>
    res.json({ status: "ok", service: "smartdorm", simulated: true }),
  );
  function issue(user, workspace, role) {
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES (?,?,?,?,?)").run(
      digest(token),
      user?.id || null,
      workspace,
      role || null,
      Date.now() + 7 * 86400000,
    );
    return { token };
  }
  app.post("/api/auth/demo", authLimit, (req, res) => {
    res.status(201).json(issue(null, "demo", "student"));
  });
  app.post("/api/auth/register", authLimit, async (req, res) => {
    const { username, password } = req.body;
    if (typeof username !== "string" || !/^[a-zA-Z0-9_-]{3,24}$/.test(username))
      fail(
        "Choose a username with 3–24 letters, numbers, underscores or hyphens.",
      );
    if (
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 128
    )
      fail("Use a password between 10 and 128 characters.");
    const user = { id: id(), username: username.toLowerCase() };
    const encoded = await passwordHash(password);
    try {
      db.prepare("INSERT INTO users(id,username,password) VALUES (?,?,?)").run(
        user.id,
        user.username,
        encoded,
      );
    } catch (e) {
      if (e.code === "SQLITE_CONSTRAINT_UNIQUE")
        fail("That username is already taken.", 409);
      throw e;
    }
    res.status(201).json(issue(user, "shared"));
  });
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const { username, password } = req.body;
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      password.length > 128
    )
      fail("Invalid username or password.", 401);
    const user = db
      .prepare("SELECT * FROM users WHERE username=?")
      .get(username.toLowerCase());
    const encoded = user?.password || "00000000000000000000000000000000:dummy";
    const result = await passwordHash(password, encoded.split(":")[0]);
    if (!user || result !== encoded) fail("Invalid username or password.", 401);
    res.json(issue(user, "shared"));
  });
  app.use("/api", (req, res, next) => {
    const token = req.get("authorization")?.replace(/^Bearer /, "");
    if (!token) fail("Please sign in again.", 401);
    const session = db
      .prepare("SELECT * FROM sessions WHERE token=? AND expires>?")
      .get(digest(token), Date.now());
    if (!session) fail("Your session expired. Please sign in again.", 401);
    req.session = session;
    req.user =
      session.workspace === "shared"
        ? db
            .prepare("SELECT id,username,role FROM users WHERE id=?")
            .get(session.user_id)
        : {
            id: "demo-student",
            username: "Emeka",
            role: session.role,
            demo: true,
          };
    if (!req.user) fail("Account not found.", 401);
    next();
  });
  const admin = (req) => {
    if (req.user.role !== "admin") fail("Administrator access required.", 403);
  };
  function transaction(req, action) {
    return db
      .transaction(() => {
        const s = JSON.parse(
          db
            .prepare("SELECT state FROM workspaces WHERE id=?")
            .get(req.session.workspace).state,
        );
        s.wallets ||= {};
        s.wallets[req.user.id] ??= 4500;
        settle(s);
        const result = action(s);
        db.prepare("UPDATE workspaces SET state=? WHERE id=?").run(
          JSON.stringify(s),
          req.session.workspace,
        );
        return { state: publicState(s, req.user), ...result };
      })
      .immediate();
  }
  const route = (method, path, fn) =>
    app[method](`/api${path}`, (req, res) => {
      const result = transaction(req, (s) => fn(req, s));
      res.status(result.errorStatus || 200).json(result);
    });
  app.post("/api/auth/logout", (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token=?").run(req.session.token);
    res.json({ ok: true });
  });
  route("get", "/state", () => ({}));
  // Virtual hostel credits only. Amounts and charges are set by the server.
  function charge(s, userId, amount) {
    if (s.wallets[userId] < amount)
      fail("Insufficient wallet balance. Top up on the Home screen.", 409);
    s.wallets[userId] -= amount;
  }
  route("post", "/wallet/topup", (req, s) => {
    s.wallets[req.user.id] = Math.min(1000000, s.wallets[req.user.id] + 1000);
    event(
      s,
      "Wallet topped up",
      "₦1,000 in virtual credits added.",
      req.user.id,
      "success",
    );
    return {};
  });
  route("post", "/bookings", (req, s) => {
    const { applianceId, duration } = req.body;
    const start = Number(req.body.start);
    const a = s.appliances.find(
      (a) => a.id === applianceId && a.kind === "washer",
    );
    if (!a) fail("Washer not found.", 404);
    if (a.status === "offline") fail("This washer is offline.", 409);
    if (
      ![30, 45, 60].includes(duration) ||
      !Number.isFinite(start) ||
      start < Date.now() - 60000 ||
      start > Date.now() + 7 * 86400000
    )
      fail(
        "Choose a valid time within the next seven days and a supported cycle.",
      );
    const end = start + duration * 60000;
    if (
      s.bookings.some(
        (b) =>
          b.applianceId === applianceId &&
          ["reserved", "running", "awaiting_collection"].includes(b.status) &&
          ((start < b.end && end > b.start) ||
            (b.status === "awaiting_collection" &&
              start <= Date.now() + 60000)),
      )
    )
      fail(
        "This slot overlaps an existing reservation or uncollected load. Choose another time.",
        409,
      );
    if (
      s.bookings.filter(
        (b) =>
          b.userId === req.user.id &&
          ["reserved", "running"].includes(b.status),
      ).length >= 10
    )
      fail("You can hold up to 10 active reservations.");
    const booking = {
      id: id(),
      applianceId,
      userId: req.user.id,
      start,
      end,
      duration,
      status: "reserved",
    };
    booking.charge = { 30: 500, 45: 700, 60: 900 }[duration];
    charge(s, req.user.id, booking.charge);
    s.bookings.push(booking);
    event(
      s,
      "Laundry reserved",
      `${applianceId} · ${duration} minute cycle`,
      req.user.id,
      "success",
    );
    return { booking };
  });
  route("patch", "/bookings/:id", (req, s) => {
    const b = s.bookings.find((b) => b.id === req.params.id);
    if (!b) fail("Booking not found.", 404);
    if (b.userId !== req.user.id && req.user.role !== "admin")
      fail("This booking belongs to another resident.", 403);
    const a = s.appliances.find((a) => a.id === b.applianceId);
    switch (req.body.action) {
      case "start":
        if (b.status !== "reserved" || a.status !== "available")
          fail("The washer must be available and the booking reserved.", 409);
        if (Date.now() < b.start - 60000 || Date.now() >= b.end)
          fail("Start your cycle during its reserved time.", 409);
        if (
          s.bookings.some(
            (other) =>
              other.id !== b.id &&
              other.applianceId === b.applianceId &&
              other.status === "reserved" &&
              other.start < Date.now() + b.duration * 60000 &&
              other.end > Date.now(),
          )
        )
          fail("Starting now would overlap the next reservation.", 409);
        b.status = "running";
        b.end = Date.now() + b.duration * 60000;
        a.status = "running";
        event(s, "Wash started", `${a.name} · ${b.duration} minutes`, b.userId);
        break;
      case "cancel":
        if (b.status !== "reserved")
          fail(
            "Only a reservation that has not started can be cancelled.",
            409,
          );
        s.wallets[b.userId] = (s.wallets[b.userId] ?? 4500) + (b.charge || 0);
        b.status = "cancelled";
        event(s, "Booking cancelled", a.name, b.userId);
        break;
      case "collect":
        if (b.status !== "awaiting_collection")
          fail("The cycle must finish before collection.", 409);
        b.status = "collected";
        a.status = "available";
        event(
          s,
          "Clothes collected",
          `${a.name} is available again.`,
          b.userId,
          "success",
        );
        break;
      default:
        fail("Unknown booking action.");
    }
    return {};
  });
  route("post", "/microwaves/:id", (req, s) => {
    const a = s.appliances.find(
      (a) => a.id === req.params.id && a.kind === "microwave",
    );
    if (!a) fail("Microwave not found.", 404);
    if (req.body.action === "start") {
      if (a.status !== "available") fail("Microwave is not available.", 409);
      if (![1, 3, 5].includes(req.body.minutes))
        fail("Choose 1, 3 or 5 minutes.");
      charge(s, req.user.id, 100);
      a.status = "in_use";
      a.endsAt = Date.now() + req.body.minutes * 60000;
      a.userId = req.user.id;
      event(
        s,
        "Microwave started",
        `${a.name} · simulated heating`,
        req.user.id,
      );
    } else if (req.body.action === "stop") {
      if (a.userId !== req.user.id && req.user.role !== "admin")
        fail("This session belongs to another resident.", 403);
      a.status = "available";
      a.endsAt = null;
      a.userId = null;
    } else fail("Unknown microwave action.");
    return {};
  });
  route("post", "/baskets/:id/:action", (req, s) => {
    const b = s.baskets.find((b) => b.id === req.params.id);
    if (!b) fail("Basket not found.", 404);
    const action = req.params.action;
    if (action === "reserve") {
      if (b.ownerId) fail("This basket is already assigned.", 409);
      if (s.baskets.filter((b) => b.ownerId === req.user.id).length >= 2)
        fail("Each resident can reserve up to two baskets.");
      if (!/^\d{4,6}$/.test(req.body.pin || ""))
        fail("Choose a PIN with 4–6 digits.");
      const plan = req.body.plan || "week";
      if (!["week", "three_days"].includes(plan))
        fail("Choose a valid storage plan.");
      charge(s, req.user.id, plan === "week" ? 1500 : 800);
      b.plan = plan;
      b.ownerId = req.user.id;
      b.pinHash = hash(req.body.pin);
      b.storedAt = null;
      b.locked = true;
      event(
        s,
        "Basket reserved",
        `${b.id} · Your PIN is set.`,
        req.user.id,
        "success",
      );
      return {};
    }
    if (b.ownerId !== req.user.id)
      fail("Only the assigned resident can access this basket.", 403);
    if (action === "unlock") {
      const key = `${req.session.workspace}:${b.id}`;
      const attempts = db
        .prepare("SELECT * FROM pin_attempts WHERE key=?")
        .get(key);
      if (attempts && attempts.until > Date.now() && attempts.count >= 5)
        fail("Too many PIN attempts. Try again in 15 minutes.", 429);
      if (!verify(req.body.pin, b.pinHash)) {
        // Store attempts outside the state transaction via a returned error, so the audit survives.
        const count =
          attempts && attempts.until > Date.now() ? attempts.count + 1 : 1;
        db.prepare("INSERT OR REPLACE INTO pin_attempts VALUES (?,?,?)").run(
          key,
          count,
          Date.now() + 15 * 60000,
        );
        event(
          s,
          "Basket access denied",
          `${b.id} · Incorrect PIN`,
          req.user.id,
          "warning",
        );
        return { error: "Incorrect PIN.", errorStatus: 403 };
      }
      db.prepare("DELETE FROM pin_attempts WHERE key=?").run(key);
      b.locked = false;
      b.unlockUntil = Date.now() + 120000;
      event(
        s,
        "Basket unlocked",
        `${b.id} · PIN verified. Auto-lock in 2 minutes.`,
        req.user.id,
        "success",
      );
    } else if (action === "lock") {
      b.locked = true;
      b.unlockUntil = null;
      event(s, "Basket locked", b.id, req.user.id);
    } else if (action === "weight") {
      if (b.locked)
        fail("Unlock your basket before adding or removing items.", 409);
      const delta = req.body.delta;
      if (typeof delta !== "number" || ![-0.25, 0.25].includes(delta))
        fail("Use a 0.25 kg weight step.");
      if (b.weight + delta < 0) fail("Basket is already empty.");
      b.weight = Number((b.weight + delta).toFixed(2));
      if (b.weight > 10) fail("Basket capacity is 10 kg.");
      if (delta > 0 && !b.storedAt) b.storedAt = Date.now();
      if (b.weight === 0) b.storedAt = null;
      event(
        s,
        "Basket weight updated",
        `${b.id} · ${delta > 0 ? "+" : ""}${delta.toFixed(2)} kg · authorized access`,
        req.user.id,
      );
    } else if (action === "meal") {
      if (b.weight <= 0)
        fail("Add food to the basket before logging a meal.", 409);
      b.storedAt = Date.now();
      event(
        s,
        "New meal logged",
        `${b.id} · Storage reminder restarted.`,
        req.user.id,
        "success",
      );
    } else if (action === "release") {
      if (b.weight > 0)
        fail("Remove your items before releasing the basket.", 409);
      b.plan = null;
      b.ownerId = null;
      b.pinHash = null;
      b.locked = true;
      b.storedAt = null;
      event(s, "Basket released", b.id, req.user.id);
    } else fail("Unknown basket action.");
    return {};
  });
  route("get", "/admin/users", (req) => {
    admin(req);
    return {
      users: req.user.demo
        ? [
            { id: "demo-student", username: "Emeka" },
            { id: "demo-neighbor", username: "Demo resident" },
          ]
        : db.prepare("SELECT id,username,role FROM users").all(),
    };
  });
  route("patch", "/admin/appliances/:id", (req, s) => {
    admin(req);
    const a = s.appliances.find((a) => a.id === req.params.id);
    if (!a) fail("Appliance not found.", 404);
    if (!["available", "offline"].includes(req.body.status))
      fail("Use available or offline.");
    if (!["available", "offline"].includes(a.status))
      fail("Finish the current session and collect any laundry first.", 409);
    a.status = req.body.status;
    event(s, `${a.name} updated`, a.status);
    return {};
  });
  route("patch", "/admin/baskets/:id", (req, s) => {
    admin(req);
    const b = s.baskets.find((b) => b.id === req.params.id);
    if (!b) fail("Basket not found.", 404);
    if (b.weight > 0) fail("Basket must be empty before reassignment.", 409);
    const ownerId = req.body.ownerId || null;
    if (ownerId) {
      const exists = req.user.demo
        ? ["demo-student", "demo-neighbor"].includes(ownerId)
        : db.prepare("SELECT id FROM users WHERE id=?").get(ownerId);
      if (!exists) fail("Resident not found.");
      if (!/^\d{4,6}$/.test(req.body.pin || "")) fail("Set a 4–6 digit PIN.");
    }
    b.ownerId = ownerId;
    b.pinHash = ownerId ? hash(req.body.pin) : null;
    b.locked = true;
    b.unlockUntil = null;
    b.storedAt = null;
    event(s, "Basket assignment updated", b.id, ownerId);
    return {};
  });
  route("patch", "/alerts/:id", (req, s) => {
    admin(req);
    const alert = s.alerts.find((a) => a.id === req.params.id);
    if (!alert) fail("Alert not found.", 404);
    alert.resolved = true;
    event(s, "Alert reviewed", alert.detail);
    return {};
  });
  app.post(
    "/api/demo",
    limits
      ? rateLimit({
          windowMs: 15 * 60000,
          limit: 5,
          skip: (req) => req.body.action !== "reset",
          standardHeaders: "draft-8",
          legacyHeaders: false,
        })
      : (req, res, next) => next(),
    (req, res, next) => {
      if (req.body.action === "reset") {
        if (!process.env.DEMO_RESET_PIN) fail("Reset is not configured.", 503);
        if (
          typeof req.body.pin !== "string" ||
          digest(req.body.pin) !== digest(process.env.DEMO_RESET_PIN)
        )
          fail("Incorrect confirmation PIN.", 403);
      }
      next();
    },
  );
  route("post", "/demo", (req, s) => {
    if (!req.user.demo)
      fail("These controls are available only in the shared demo.", 403);
    switch (req.body.action) {
      case "role":
        if (!["student", "admin"].includes(req.body.role))
          fail("Unknown role.");
        db.prepare("UPDATE sessions SET role=? WHERE token=?").run(
          req.body.role,
          req.session.token,
        );
        req.user.role = req.body.role;
        break;
      case "reset":
        Object.assign(s, initial(true));
        break;
      case "complete": {
        const b =
          s.bookings.find(
            (b) => b.status === "running" && b.userId === req.user.id,
          ) || s.bookings.find((b) => b.status === "running");
        if (!b) fail("Start a wash cycle first.");
        complete(s, b);
        break;
      }
      case "age":
        s.baskets
          .filter((b) => b.ownerId === req.user.id && b.weight > 0)
          .forEach((b) => (b.storedAt -= 86400000));
        event(
          s,
          "Storage timer advanced",
          "Added one simulated day. Storage time does not establish food safety.",
          req.user.id,
        );
        break;
      case "anomaly": {
        const b = s.baskets.find((b) => b.ownerId === req.user.id && b.locked);
        if (!b) fail("Lock one of your baskets first.");
        b.weight = Number((b.weight + 0.35).toFixed(2));
        const detail = `${b.id}: +0.35 kg observed while locked. Sensor drift, moved items or access may explain this. A weight change is not proof of theft.`;
        s.alerts.unshift({
          id: id(),
          userId: b.ownerId,
          detail,
          at: Date.now(),
          resolved: false,
        });
        event(s, "Unusual weight change", detail, b.ownerId, "warning");
        break;
      }
      default:
        fail("Unknown simulation action.");
    }
    return {};
  });
  // Domain errors returned by the PIN transaction must commit attempts before responding.
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API endpoint not found." }),
  );
  app.use(express.static(resolve("dist")));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({
      error: err.status
        ? err.message
        : "Something went wrong. Please try again.",
    });
    if (!err.status) console.error(err);
  });
  const cleanup = setInterval(() => {
    db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    db.prepare(
      "DELETE FROM workspaces WHERE id NOT IN ('shared','demo') AND id NOT IN (SELECT workspace FROM sessions)",
    ).run();
    db.prepare("DELETE FROM pin_attempts WHERE until<?").run(Date.now());
  }, 3600000);
  cleanup.unref();
  return {
    app,
    db,
    close: () => {
      clearInterval(cleanup);
      db.close();
    },
  };
}

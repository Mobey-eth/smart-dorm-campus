import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
export const id = () => randomUUID();
export function hash(value) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(value, salt, 32).toString("hex")}`;
}
export function verify(value, encoded) {
  if (!encoded || typeof value !== "string") return false;
  const [salt, digest] = encoded.split(":");
  return timingSafeEqual(
    Buffer.from(digest, "hex"),
    scryptSync(value, salt, 32),
  );
}
export function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
export function event(s, title, detail, userId = null, type = "info") {
  s.events.unshift({ id: id(), title, detail, userId, type, at: Date.now() });
  s.events = s.events.slice(0, 150);
}
export function initial(demo = false) {
  const now = Date.now();
  const s = {
    appliances: [
      {
        id: "MW-01",
        name: "Microwave 01",
        kind: "microwave",
        status: "available",
        location: "Communal kitchen",
      },
      {
        id: "MW-02",
        name: "Microwave 02",
        kind: "microwave",
        status: demo ? "in_use" : "available",
        endsAt: demo ? now + 135000 : null,
        location: "Communal kitchen",
      },
      {
        id: "MW-03",
        name: "Microwave 03",
        kind: "microwave",
        status: "offline",
        location: "Communal kitchen",
      },
      {
        id: "WM-01",
        name: "Washer 01",
        kind: "washer",
        status: "available",
        location: "Laundry room · 8 kg",
      },
      {
        id: "WM-02",
        name: "Washer 02",
        kind: "washer",
        status: demo ? "running" : "available",
        location: "Laundry room · 8 kg",
      },
      {
        id: "WM-03",
        name: "Washer 03",
        kind: "washer",
        status: demo ? "awaiting_collection" : "available",
        location: "Laundry room · 10 kg",
      },
    ],
    baskets: Array.from({ length: 12 }, (_, i) => ({
      id: `B-${String(i + 1).padStart(2, "0")}`,
      unit: i < 6 ? "A" : "B",
      ownerId:
        demo && [0, 2, 3, 7, 9].includes(i)
          ? i === 3
            ? "demo-student"
            : "demo-neighbor"
          : null,
      weight: demo && [0, 2, 3, 7, 9].includes(i) ? (i === 3 ? 2.45 : 1.2) : 0,
      locked: true,
      pinHash: demo && i === 3 ? hash("4829") : null,
      storedAt: demo ? now - 86 * 3600000 : null,
    })),
    wallets: {},
    bookings: [],
    alerts: [],
    events: [],
  };
  if (demo) {
    s.bookings.push(
      {
        id: id(),
        applianceId: "WM-02",
        userId: "demo-student",
        start: now - 12 * 60000,
        end: now + 18 * 60000,
        duration: 30,
        status: "running",
      },
      {
        id: id(),
        applianceId: "WM-03",
        userId: "demo-neighbor",
        start: now - 60 * 60000,
        end: now - 15 * 60000,
        duration: 45,
        status: "awaiting_collection",
      },
    );
    event(
      s,
      "Your basket is secure",
      "B-04 · Locked · 2.45 kg",
      "demo-student",
    );
    event(
      s,
      "Washer 03 cycle complete",
      "Clothes are awaiting collection.",
      "demo-neighbor",
      "success",
    );
  }
  return s;
}
export function settle(s) {
  const now = Date.now();
  for (const a of s.appliances) {
    if (a.kind === "microwave" && a.endsAt && a.endsAt <= now) {
      a.status = "available";
      a.endsAt = null;
      event(
        s,
        `${a.name} is available`,
        "Simulated heating cycle complete.",
        a.userId,
        "success",
      );
      a.userId = null;
    }
  }
  for (const b of s.bookings) {
    if (b.status === "running" && b.end <= now) complete(s, b);
    if (b.status === "reserved" && b.end <= now) {
      b.status = "expired";
      event(
        s,
        "Reservation expired",
        `${b.applianceId} was not started.`,
        b.userId,
      );
    }
  }
  for (const b of s.baskets)
    if (!b.locked && b.unlockUntil <= now) {
      b.locked = true;
      b.unlockUntil = null;
      event(
        s,
        `${b.id} automatically locked`,
        "Access window closed.",
        b.ownerId,
      );
    }
}
export function complete(s, b) {
  b.status = "awaiting_collection";
  b.completedAt = Date.now();
  const a = s.appliances.find((a) => a.id === b.applianceId);
  a.status = "awaiting_collection";
  event(
    s,
    `${a.name} cycle complete`,
    "Please collect your clothes. The machine remains occupied until collection.",
    b.userId,
    "success",
  );
}
export function publicState(s, user) {
  const { wallets, ...visible } = s;
  const admin = user.role === "admin";
  return {
    ...visible,
    walletBalance: wallets?.[user.id] ?? 4500,
    serverTime: Date.now(),
    user,
    simulated: true,
    baskets: s.baskets.map(({ pinHash, ...b }) => ({
      ...b,
      ownerId: b.ownerId === user.id ? user.id : b.ownerId ? "occupied" : null,
      mine: b.ownerId === user.id,
    })),
    bookings: s.bookings.map((b) => ({
      ...b,
      userId: admin
        ? b.userId
        : b.userId === user.id
          ? user.id
          : "another-resident",
      mine: b.userId === user.id,
    })),
    events: s.events.filter((e) => admin || !e.userId || e.userId === user.id),
    alerts: s.alerts.filter((a) => admin || a.userId === user.id),
    appliances: s.appliances.map((a) => ({
      ...a,
      userId:
        a.userId === user.id ? user.id : a.userId ? "another-resident" : null,
    })),
  };
}

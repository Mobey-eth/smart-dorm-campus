import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../server/app.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.DEMO_RESET_PIN = "test-reset-pin";
const setup = () => {
  const instance = createApp({ limits: false });
  const api = request(instance.app);
  return { ...instance, api };
};
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const demo = async (api) =>
  (await api.post("/api/auth/demo").send({})).body.token;
const register = async (api, username) =>
  (
    await api
      .post("/api/auth/register")
      .send({ username, password: "temporary-password-123" })
  ).body.token;
test("accounts persist, passwords and session tokens are hashed, roles cannot be self assigned", async () => {
  const dir = mkdtempSync(join(tmpdir(), "smartdorm-"));
  let i = createApp({ dbPath: join(dir, "db.sqlite"), limits: false });
  try {
    const api = request(i.app);
    const res = await api.post("/api/auth/register").send({
      username: "resident_one",
      password: "long-password-123",
      role: "admin",
    });
    assert.equal(res.status, 201);
    const user = i.db.prepare("SELECT * FROM users").get();
    assert.equal(user.role, "student");
    assert.notEqual(user.password, "long-password-123");
    assert.notEqual(
      i.db.prepare("SELECT token FROM sessions").get().token,
      res.body.token,
    );
    assert.equal(
      (await api.get("/api/admin/users").set(auth(res.body.token))).status,
      403,
    );
    i.close();
    i = createApp({ dbPath: join(dir, "db.sqlite"), limits: false });
    const login = await request(i.app)
      .post("/api/auth/login")
      .send({ username: "resident_one", password: "long-password-123" });
    assert.equal(login.status, 200);
    assert.equal(
      (await request(i.app).get("/api/state").set(auth(login.body.token))).body
        .state.user.username,
      "resident_one",
    );
    assert.equal(
      (
        await request(i.app)
          .post("/api/auth/login")
          .send({ username: "resident_one", password: "wrong-password" })
      ).status,
      401,
    );
  } finally {
    i.close();
    rmSync(dir, { recursive: true });
  }
});
test("concurrent bookings reject overlap; adjacent slots work; future reservations do not run", async () => {
  const { api, close } = setup();
  try {
    const token = await register(api, "booker");
    const start = Date.now() + 3600000;
    const payload = { applianceId: "WM-01", duration: 30, start };
    const results = await Promise.all([
      api.post("/api/bookings").set(auth(token)).send(payload),
      api.post("/api/bookings").set(auth(token)).send(payload),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const booking = results.find((r) => r.status === 200).body.booking;
    assert.equal(
      (
        await api
          .patch(`/api/bookings/${booking.id}`)
          .set(auth(token))
          .send({ action: "start" })
      ).status,
      409,
    );
    assert.equal(
      (
        await api
          .post("/api/bookings")
          .set(auth(token))
          .send({ ...payload, start: start + 1800000 })
      ).status,
      200,
    );
    const other = await register(api, "another");
    assert.equal(
      (
        await api
          .patch(`/api/bookings/${booking.id}`)
          .set(auth(other))
          .send({ action: "cancel" })
      ).status,
      403,
    );
    assert.equal(
      (
        await api
          .patch(`/api/bookings/${booking.id}`)
          .set(auth(token))
          .send({ action: "cancel" })
      ).status,
      200,
    );
  } finally {
    close();
  }
});
test("completion keeps machine occupied until collection; demo is shared but accounts separate", async () => {
  const { api, close } = setup();
  try {
    const token = await demo(api),
      visitor = await demo(api);
    let r = await api
      .post("/api/demo")
      .set(auth(token))
      .send({ action: "complete" });
    const booking = r.body.state.bookings.find((b) => b.mine);
    assert.equal(booking.status, "awaiting_collection");
    assert.equal(
      (
        await api.get("/api/state").set(auth(visitor))
      ).body.state.appliances.find((a) => a.id === "WM-02").status,
      "awaiting_collection",
    );
    assert.equal(
      (
        await api
          .patch(`/api/bookings/${booking.id}`)
          .set(auth(token))
          .send({ action: "collect" })
      ).body.state.appliances.find((a) => a.id === "WM-02").status,
      "available",
    );
    const account = await register(api, "private_account");
    assert.equal(
      (
        await api
          .post("/api/demo")
          .set(auth(account))
          .send({ action: "role", role: "admin" })
      ).status,
      403,
    );
    assert.equal(
      (await api.get("/api/state").set(auth(account))).body.state.bookings
        .length,
      0,
    );
  } finally {
    close();
  }
});
test("basket ownership, PIN throttling, lock and weight events are enforced", async () => {
  const { api, close } = setup();
  try {
    const token = await demo(api);
    assert.equal(
      (
        await api
          .post("/api/baskets/B-01/unlock")
          .set(auth(token))
          .send({ pin: "4829" })
      ).status,
      403,
    );
    assert.equal(
      (
        await api
          .post("/api/baskets/B-04/weight")
          .set(auth(token))
          .send({ delta: 0.25 })
      ).status,
      409,
    );
    let r = await api
      .post("/api/baskets/B-04/unlock")
      .set(auth(token))
      .send({ pin: "0000" });
    assert.equal(r.status, 403);
    r = await api.get("/api/state").set(auth(token));
    assert(r.body.state.events.some((e) => e.title === "Basket access denied"));
    assert(!JSON.stringify(r.body).includes("pinHash"));
    assert.equal(
      (
        await api
          .post("/api/baskets/B-04/unlock")
          .set(auth(token))
          .send({ pin: "4829" })
      ).status,
      200,
    );
    r = await api
      .post("/api/baskets/B-04/weight")
      .set(auth(token))
      .send({ delta: 0.25 });
    assert.equal(r.body.state.baskets.find((b) => b.id === "B-04").weight, 2.7);
    assert.equal(
      (await api.post("/api/baskets/B-04/release").set(auth(token)).send({}))
        .status,
      409,
    );
    await api.post("/api/baskets/B-04/lock").set(auth(token)).send({});
    for (let n = 0; n < 5; n++)
      assert.equal(
        (
          await api
            .post("/api/baskets/B-04/unlock")
            .set(auth(token))
            .send({ pin: "0000" })
        ).status,
        403,
      );
    assert.equal(
      (
        await api
          .post("/api/baskets/B-04/unlock")
          .set(auth(token))
          .send({ pin: "4829" })
      ).status,
      429,
    );
  } finally {
    close();
  }
});
test("reset PIN is verified on server; alerts never claim theft; admin updates authorized", async () => {
  const { api, close } = setup();
  try {
    const token = await demo(api);
    assert.equal(
      (await api.post("/api/demo").set(auth(token)).send({ action: "reset" }))
        .status,
      403,
    );
    assert.equal(
      (
        await api
          .post("/api/demo")
          .set(auth(token))
          .send({ action: "reset", pin: "wrong" })
      ).status,
      403,
    );
    let r = await api
      .post("/api/demo")
      .set(auth(token))
      .send({ action: "anomaly" });
    assert.match(r.body.state.alerts[0].detail, /not proof of theft/);
    assert.equal(
      (
        await api
          .patch("/api/admin/appliances/MW-03")
          .set(auth(token))
          .send({ status: "available" })
      ).status,
      403,
    );
    await api
      .post("/api/demo")
      .set(auth(token))
      .send({ action: "role", role: "admin" });
    assert.equal(
      (
        await api
          .patch("/api/admin/appliances/MW-03")
          .set(auth(token))
          .send({ status: "available" })
      ).status,
      200,
    );
    assert.equal(
      (
        await api
          .patch("/api/admin/baskets/B-02")
          .set(auth(token))
          .send({ ownerId: "demo-student", pin: "4567" })
      ).status,
      200,
    );
    r = await api
      .post("/api/demo")
      .set(auth(token))
      .send({ action: "reset", pin: "test-reset-pin" });
    assert.equal(r.status, 200);
    assert.equal(r.body.state.alerts.length, 0);
    assert.equal(
      r.body.state.baskets.find((b) => b.id === "B-02").ownerId,
      null,
    );
  } finally {
    close();
  }
});
test("timers settle on server after clients close, including auto lock", async () => {
  const { api, db, close } = setup();
  try {
    const token = await demo(api);
    const s = JSON.parse(
      db.prepare("SELECT state FROM workspaces WHERE id='demo'").get().state,
    );
    s.bookings[0].end = Date.now() - 1000;
    s.baskets[3].locked = false;
    s.baskets[3].unlockUntil = Date.now() - 1000;
    s.appliances[1].endsAt = Date.now() - 1000;
    db.prepare("UPDATE workspaces SET state=? WHERE id='demo'").run(
      JSON.stringify(s),
    );
    const r = await api.get("/api/state").set(auth(token));
    assert.equal(r.body.state.bookings[0].status, "awaiting_collection");
    assert.equal(r.body.state.baskets[3].locked, true);
    assert.equal(r.body.state.appliances[1].status, "available");
  } finally {
    close();
  }
});

test("virtual wallet persists, charges are server set, and cancellations refund only once", async () => {
  const { api, close } = setup();
  try {
    const token = await register(api, "wallet_student");
    assert.equal(
      (await api.get("/api/state").set(auth(token))).body.state.walletBalance,
      4500,
    );
    let r = await api
      .post("/api/wallet/topup")
      .set(auth(token))
      .send({ amount: 999999 });
    assert.equal(r.body.state.walletBalance, 5500);
    const payload = {
      applianceId: "WM-01",
      duration: 30,
      start: Date.now() + 3600000,
    };
    r = await api
      .post("/api/bookings")
      .set(auth(token))
      .send({ ...payload, charge: 0 });
    assert.equal(r.body.state.walletBalance, 5000);
    const id = r.body.booking.id;
    assert.equal(
      (await api.post("/api/bookings").set(auth(token)).send(payload)).status,
      409,
    );
    assert.equal(
      (await api.get("/api/state").set(auth(token))).body.state.walletBalance,
      5000,
    );
    r = await api
      .patch(`/api/bookings/${id}`)
      .set(auth(token))
      .send({ action: "cancel" });
    assert.equal(r.body.state.walletBalance, 5500);
    assert.equal(
      (
        await api
          .patch(`/api/bookings/${id}`)
          .set(auth(token))
          .send({ action: "cancel" })
      ).status,
      409,
    );
    r = await api
      .post("/api/baskets/B-02/reserve")
      .set(auth(token))
      .send({ pin: "5678", plan: "three_days", price: 0 });
    assert.equal(r.body.state.walletBalance, 4700);
    assert.equal(
      r.body.state.baskets.find((b) => b.id === "B-02").plan,
      "three_days",
    );
    assert.equal(r.body.state.wallets, undefined);
    const other = await register(api, "wallet_other");
    assert.equal(
      (await api.get("/api/state").set(auth(other))).body.state.walletBalance,
      4500,
    );
  } finally {
    close();
  }
});

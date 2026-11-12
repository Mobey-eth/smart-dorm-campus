const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icons = {
  home: "house",
  washer: "shirt",
  calendar: "calendar-days",
  arrow: "arrow-right",
  chevron: "chevron-right",
  bell: "bell",
  sliders: "sliders",
  building: "building",
  lock: "lock",
  unlock: "lock-open",
  check: "circle-check",
  clock: "clock",
  wifi: "wifi",
  shield: "shield-halved",
  close: "xmark",
  logout: "right-from-bracket",
  plus: "plus",
  minus: "minus",
  alert: "triangle-exclamation",
  reset: "rotate-left",
  user: "user",
  weight: "weight-scale",
  spark: "microchip",
  wallet: "wallet",
  utensils: "utensils",
};
const applianceIcons = {
  fridge:
    '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M5 9h14M8 5v1M8 12v4"/>',
  microwave:
    '<rect x="2" y="5" width="20" height="14" rx="2"/><rect x="5" y="8" width="10" height="8" rx="1"/><path d="M18 9h1M18 12h1M18 15h1M5 19v2M19 19v2"/>',
};
const icon = (name) =>
  applianceIcons[name]
    ? `<svg class="appliance-icon" data-appliance="${name}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${applianceIcons[name]}</svg>`
    : `<i class="fa-solid fa-${icons[name] || "microchip"}" aria-hidden="true"></i>`;
const labels = {
  available: "Available",
  in_use: "In use",
  running: "Washing",
  offline: "Offline",
  awaiting_collection: "Awaiting collection",
  reserved: "Reserved",
  collected: "Collected",
  cancelled: "Cancelled",
  expired: "Expired",
};
const badge = (status, text) =>
  `<span class="badge ${esc(status)}"><i class="dot"></i>${esc(text || labels[status] || status)}</span>`;
const btn = (label, action, id = "", style = "", ico = "") =>
  `<button class="btn ${style}" data-action="${action}" data-id="${esc(id)}">${ico ? icon(ico) : ""}${label}</button>`;
const go = (label, tab) =>
  `<button class="text-btn" data-action="nav" data-id="${tab}">${label}${icon("arrow")}</button>`;
const empty = (msg, action = "") =>
  `<div class="empty">${icon("spark")}<p>${msg}</p>${action}</div>`;
let state = null,
  page = location.hash.slice(1) || "home",
  token = sessionStorage.getItem("smartdorm-token"),
  unit = "A",
  filter = "all",
  lastFocus = null,
  pending = false,
  toastTimer,
  serverOffset = 0,
  offline = false,
  knownEvents = new Set(),
  modalKind = null,
  modalId = null;
const now = () => Date.now() + serverOffset;
const remaining = (end) => {
  const s = Math.max(0, Math.ceil((end - now()) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const dateTime = (n) =>
  new Date(n).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const timeAgo = (n) => {
  const m = Math.floor((now() - n) / 60000);
  return m < 1
    ? "Just now"
    : m < 60
      ? `${m}m ago`
      : m < 1440
        ? `${Math.floor(m / 60)}h ago`
        : `${Math.floor(m / 1440)}d ago`;
};
const timer = (end) => `<span data-timer="${end}">${remaining(end)}</span>`;
const myBaskets = () => state.baskets.filter((b) => b.mine);
const myBookings = () =>
  state.bookings.filter(
    (b) =>
      b.mine &&
      ["reserved", "running", "awaiting_collection"].includes(b.status),
  );
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 4500);
}
async function api(path, body, method = body ? "POST" : "GET") {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("The service is unavailable. Please try again.");
  }
  if (!res.ok || data.error)
    throw Object.assign(new Error(data.error || "Please try again shortly."), {
      status: res.status,
    });
  return data;
}
function accept(data, notify = false) {
  if (!data.state) return;
  const incoming = data.state;
  serverOffset = incoming.serverTime - Date.now();
  if (notify)
    for (const e of incoming.events) {
      if (
        !knownEvents.has(e.id) &&
        e.type === "success" &&
        e.title.includes("complete")
      )
        toast(e.title + " — please collect your clothes.");
    }
  knownEvents = new Set(incoming.events.map((e) => e.id));
  state = incoming;
  offline = false;
}
async function mutate(path, body, method = "POST", message) {
  const data = await api(path, body, method);
  accept(data);
  render();
  if (message) toast(message);
  return data;
}
function nav(tab) {
  page = tab;
  location.hash = tab;
  closeModal();
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function modal(title, content, kind = null, id = null) {
  lastFocus = document.activeElement;
  modalKind = kind;
  modalId = id;
  $("#modal-root").innerHTML =
    `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="modal-head"><h2 id="dialog-title">${title}</h2><button class="icon-btn" data-action="close" aria-label="Close dialog">${icon("close")}</button></div>${content}</section></div>`;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() =>
    ($(".modal input") || $(".modal button")).focus(),
  );
}
function closeModal() {
  if (!$("#modal-root").innerHTML) return;
  $("#modal-root").innerHTML = "";
  document.body.classList.remove("modal-open");
  modalKind = null;
  modalId = null;
  if (lastFocus?.isConnected) lastFocus.focus();
}
const errorBox = '<div class="form-error" role="alert"></div>';
function openBasket(id) {
  const b = state.baskets.find((b) => b.id === id);
  if (b.ownerId && !b.mine) {
    toast("This basket is assigned to another resident.");
    return;
  }
  if (!b.ownerId) {
    modal(
      `Reserve Basket #${b.id}`,
      `<p>Refrigerator ${b.unit} · Create a private PIN for your basket.</p><form id="reserve-form" data-id="${id}"><div class="space-y-2.5"><label class="choice"><div class="flex items-center gap-3"><input type="radio" name="plan" value="week" checked><div><strong>Full Week (Sun–Sat)</strong><small>7-day storage plan</small></div></div><strong>₦1,500</strong></label><label class="choice"><div class="flex items-center gap-3"><input type="radio" name="plan" value="three_days"><div><strong>3-Day Express Pass</strong><small>Short-stay storage</small></div></div><strong>₦800</strong></label></div><label for="pin">Choose a 4–6 digit PIN</label><input id="pin" class="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="new-password" required><p class="hint">Remember this PIN. You’ll need it each time you unlock your basket.</p>${errorBox}<button class="btn primary full">Reserve basket</button></form>`,
    );
    return;
  }
  if (b.locked) {
    modal(
      `Unlock basket ${b.id}`,
      `<p>Your personal storage in refrigerator ${b.unit}.</p><form id="unlock-form" data-id="${id}"><label for="pin">Basket access PIN</label><input id="pin" class="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" required autocomplete="off">${state.user.demo && b.id === "B-04" ? '<p class="hint">Presentation basket PIN: <strong>4829</strong></p>' : ""}${errorBox}<button class="btn primary full">${icon("unlock")} Unlock basket</button></form><div class="info-pair"><span>Current weight</span><strong>${b.weight.toFixed(2)} kg</strong></div>`,
    );
    return;
  }
  modal(
    `Your basket ${b.id}`,
    `<p>${icon("unlock")} Unlocked · Automatically locks after two minutes.</p><div class="metric">${b.weight.toFixed(2)} <span>kg</span></div><p style="text-align:center">Current sensor reading · 10 kg capacity</p><div class="weight-buttons">${btn("Remove 250 g", "weight-remove", id, "", "minus")}${btn("Add 250 g", "weight-add", id, "soft", "plus")}</div><div class="notice">${icon("clock")}${b.storedAt ? `${Math.max(0, Math.floor((now() - b.storedAt) / 86400000))} days since the first item was added. This timer is a reminder, not a food-safety assessment.` : "Your basket is empty. Add an item to start the storage timer."}</div>${errorBox}<div class="card-actions">${btn("Lock basket", "basket-lock", id, "primary", "lock")}${btn("Release basket", "basket-release", id, "danger")}</div>`,
    "basket",
    id,
  );
}
function openBook(id) {
  const next = new Date(Date.now() + 60000);
  next.setSeconds(0, 0);
  const local = new Date(next - next.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  modal(
    "Book a Laundry Cycle",
    `<p>Choose your washer, time and cycle. Reservations are checked automatically for conflicts.</p><form id="book-form"><label for="machine">Washing machine</label><select name="applianceId" id="machine">${state.appliances
      .filter((a) => a.kind === "washer" && a.status !== "offline")
      .map(
        (a) =>
          `<option value="${a.id}" ${a.id === id ? "selected" : ""}>${a.name} · ${labels[a.status]}</option>`,
      )
      .join(
        "",
      )}</select><label for="start">Start time</label><input type="datetime-local" id="start" name="start" value="${local}" min="${local}" required><label for="duration">Wash cycle</label><select name="duration" id="duration"><option value="30">Quick Wash · 30 min · ₦500</option><option value="45">Heavy Duty · 45 min · ₦700</option><option value="60">Full Load · 60 min · ₦900</option></select><div id="slot-list" class="hint"></div>${errorBox}<button class="btn primary full">Confirm reservation ${icon("arrow")}</button></form>`,
  );
  updateSlots();
}
function updateSlots() {
  const el = $("#slot-list");
  if (!el) return;
  const machine = $("#machine").value;
  const list = state.bookings.filter(
    (b) =>
      b.applianceId === machine &&
      ["reserved", "running", "awaiting_collection"].includes(b.status),
  );
  el.innerHTML = list.length
    ? `Already scheduled:<br>${list.map((b) => `${esc(dateTime(b.start))} · ${b.duration} min · ${labels[b.status]}`).join("<br>")}`
    : "No reservations for this washer yet.";
}
function controls() {
  modal(
    "Presentation controls",
    `<p>Try appliance events and switch between resident and administrator views.</p><button class="demo-control" data-action="role"><span class="service-icon">${icon("shield")}</span><div><strong>Switch to ${state.user.role === "admin" ? "resident" : "administrator"} view</strong><small>Explore ${state.user.role === "admin" ? "your everyday dashboard" : "appliances, assignments and alerts"}</small></div></button>${[
      [
        "complete",
        "washer",
        "Finish current wash",
        "Send a cycle-complete notification",
      ],
      [
        "anomaly",
        "weight",
        "Simulate weight change",
        "Review a reading from a locked basket",
      ],
      [
        "age",
        "clock",
        "Advance storage time",
        "Add one day to your storage reminder",
      ],
    ]
      .map(
        ([key, ico, title, sub]) =>
          `<button class="demo-control" data-action="simulate" data-id="${key}">${icon(ico)}<div><strong>${title}</strong><small>${sub}</small></div></button>`,
      )
      .join(
        "",
      )}<div class="notice">${icon("wifi")}Appliance readings are simulated. Changes are shared across the presentation.</div>`,
  );
}
function account(mode = "login") {
  if (!state.user.demo && mode === "login") {
    modal(
      "Your account",
      `<p>Signed in as <strong class="text-slate-900">${esc(state.user.username)}</strong>.</p><div class="card-actions">${btn("My bookings", "nav", "bookings", "primary", "calendar")}${btn("Sign out", "logout", "", "", "logout")}</div>`,
    );
    return;
  }
  modal(
    mode === "register" ? "Create an account" : "Sign in to SmartHub",
    `<p>${mode === "register" ? "Create an account with a made-up username. No email, full name or personal details needed." : "Sign in to manage your baskets and bookings."}</p><form id="auth-form" data-mode="${mode}"><label for="username">Username</label><input id="username" name="username" minlength="3" maxlength="24" pattern="[A-Za-z0-9_-]+" autocomplete="username" required><label for="password">Password</label><input id="password" name="password" type="password" minlength="10" maxlength="128" autocomplete="${mode === "register" ? "new-password" : "current-password"}" required><p class="hint">Use at least 10 characters. For this presentation, choose a password you don’t use elsewhere.</p>${errorBox}<button class="btn primary full">${mode === "register" ? "Create account" : "Sign in"}</button></form><div style="margin-top:17px;text-align:center"><button class="text-btn" data-action="auth-mode" data-id="${mode === "register" ? "login" : "register"}">${mode === "register" ? "Already have an account? Sign in" : "New here? Create an account"}</button></div>${!state?.user.demo ? `<div class="card-actions" style="margin-top:18px">${btn("Sign out", "logout", "", "small")}</div>` : ""}`,
  );
}
async function handleAction(action, id) {
  switch (action) {
    case "topup":
      await mutate(
        "/wallet/topup",
        {},
        "POST",
        "₦1,000 in virtual credits added to your wallet.",
      );
      break;
    case "meal":
      await mutate(
        `/baskets/${id}/meal`,
        {},
        "POST",
        "Storage reminder reset for your new meal.",
      );
      break;
    case "nav":
      nav(id);
      break;
    case "close":
      closeModal();
      break;
    case "unit":
      unit = id;
      render();
      break;
    case "filter":
      filter = id;
      render();
      break;
    case "activity":
      nav("activity");
      break;
    case "controls":
      controls();
      break;
    case "account":
      account();
      break;
    case "auth-mode":
      account(id);
      break;
    case "book":
      openBook(id);
      break;
    case "basket":
      openBasket(id);
      break;
    case "heat":
      modal(
        "Start Microwave",
        `<p>${id} · Choose a heating duration · ₦100 per session.</p><form id="heat-form" data-id="${id}"><label for="minutes">Heating time</label><select name="minutes" id="minutes"><option value="1">1 minute</option><option value="3" selected>3 minutes</option><option value="5">5 minutes</option></select>${errorBox}<button class="btn primary full">Start heating</button></form>`,
      );
      break;
    case "microwave-stop":
      await mutate(
        `/microwaves/${id}`,
        { action: "stop" },
        "POST",
        "Heating ended.",
      );
      break;
    case "booking-start":
      await mutate(
        `/bookings/${id}`,
        { action: "start" },
        "PATCH",
        "Your wash has started.",
      );
      break;
    case "booking-collect":
      await mutate(
        `/bookings/${id}`,
        { action: "collect" },
        "PATCH",
        "Clothes collected. The washer is available again.",
      );
      break;
    case "booking-cancel":
      modal(
        "Cancel this reservation?",
        `<p>Your time slot will become available to other residents.</p><div class="card-actions">${btn("Keep booking", "close")}${btn("Cancel reservation", "confirm-cancel", id, "danger")}</div>`,
      );
      break;
    case "confirm-cancel":
      await mutate(
        `/bookings/${id}`,
        { action: "cancel" },
        "PATCH",
        "Reservation cancelled.",
      );
      closeModal();
      break;
    case "weight-add":
    case "weight-remove":
      await mutate(`/baskets/${id}/weight`, {
        delta: action === "weight-add" ? 0.25 : -0.25,
      });
      openBasket(id);
      break;
    case "basket-lock":
      await mutate(`/baskets/${id}/lock`, {}, "POST", "Your basket is locked.");
      closeModal();
      break;
    case "basket-release":
      await mutate(`/baskets/${id}/release`, {}, "POST", "Basket released.");
      closeModal();
      break;
    case "role":
      await mutate("/demo", {
        action: "role",
        role: state.user.role === "admin" ? "student" : "admin",
      });
      nav(state.user.role === "admin" ? "admin" : "home");
      break;
    case "simulate":
      await mutate(
        "/demo",
        { action: id },
        "POST",
        id === "complete"
          ? "Cycle complete. Clothes are awaiting collection."
          : id === "anomaly"
            ? "Weight observation recorded. Review the notification."
            : "Storage reminder advanced by one day.",
      );
      closeModal();
      if (id === "anomaly") nav("activity");
      break;
    case "reset-confirm":
      modal(
        "Reset the presentation?",
        `<p>This restores the shared presentation’s appliances, baskets and bookings. Created accounts are kept.</p><form id="reset-form"><label for="reset-pin">Confirmation PIN</label><input id="reset-pin" name="pin" type="password" required autocomplete="off">${errorBox}<button class="btn danger full">Confirm reset</button></form>`,
      );
      break;
    case "toggle-appliance": {
      const a = state.appliances.find((a) => a.id === id);
      await mutate(
        `/admin/appliances/${id}`,
        { status: a.status === "offline" ? "available" : "offline" },
        "PATCH",
        "Appliance updated.",
      );
      break;
    }
    case "resolve":
      await mutate(
        `/alerts/${id}`,
        {},
        "PATCH",
        "Observation marked as reviewed.",
      );
      break;
    case "assign": {
      const data = await api("/admin/users");
      const b = state.baskets.find((b) => b.id === id);
      modal(
        `Manage basket ${id}`,
        `<p>Only empty baskets can be reassigned.</p><form id="assign-form" data-id="${id}"><label for="owner">Assign to resident</label><select id="owner" name="ownerId"><option value="">Unassigned</option>${data.users.map((u) => `<option value="${u.id}" ${b.mine && u.id === state.user.id ? "selected" : ""}>${esc(u.username)}</option>`).join("")}</select><label for="new-pin">New basket PIN (4–6 digits)</label><input name="pin" id="new-pin" type="password" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6">${errorBox}<button class="btn primary full">Save assignment</button></form>`,
      );
      break;
    }
    case "logout":
      await api("/auth/logout", {});
      token = null;
      sessionStorage.removeItem("smartdorm-token");
      closeModal();
      await boot();
      toast("You have signed out.");
      break;
    case "retry":
      await boot();
      break;
  }
}
document.addEventListener("click", async (e) => {
  if (e.target.classList.contains("modal-backdrop")) {
    closeModal();
    return;
  }
  const b = e.target.closest("[data-action]");
  if (!b || pending) return;
  pending = true;
  b.disabled = true;
  try {
    await handleAction(b.dataset.action, b.dataset.id);
  } catch (err) {
    const target = $(".form-error");
    if (target) target.textContent = err.message;
    else toast(err.message);
  } finally {
    pending = false;
    if (b.isConnected) b.disabled = false;
  }
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (pending) return;
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  const button = form.querySelector("button[type=submit],button:not([type])");
  pending = true;
  if (button) button.disabled = true;
  const err = form.querySelector(".form-error");
  if (err) err.textContent = "";
  try {
    switch (form.id) {
      case "auth-form": {
        const result = await api(`/auth/${form.dataset.mode}`, data);
        token = result.token;
        sessionStorage.setItem("smartdorm-token", token);
        accept(await api("/state"));
        closeModal();
        nav("home");
        toast(
          form.dataset.mode === "register"
            ? "Your account is ready."
            : "Welcome back.",
        );
        break;
      }
      case "book-form":
        await mutate(
          "/bookings",
          {
            applianceId: data.applianceId,
            start: new Date(data.start).getTime(),
            duration: Number(data.duration),
          },
          "POST",
          "Your reservation is confirmed.",
        );
        closeModal();
        nav("bookings");
        break;
      case "reserve-form":
        await mutate(
          `/baskets/${form.dataset.id}/reserve`,
          data,
          "POST",
          "Basket reserved. Keep your PIN safe.",
        );
        closeModal();
        break;
      case "unlock-form":
        await mutate(
          `/baskets/${form.dataset.id}/unlock`,
          data,
          "POST",
          "PIN verified. Your basket is unlocked.",
        );
        openBasket(form.dataset.id);
        break;
      case "heat-form":
        await mutate(
          `/microwaves/${form.dataset.id}`,
          { action: "start", minutes: Number(data.minutes) },
          "POST",
          "Heating has started.",
        );
        closeModal();
        break;
      case "assign-form":
        await mutate(
          `/admin/baskets/${form.dataset.id}`,
          data,
          "PATCH",
          "Basket assignment updated.",
        );
        closeModal();
        break;
      case "reset-form":
        await mutate(
          "/demo",
          { action: "reset", pin: data.pin },
          "POST",
          "Presentation restored.",
        );
        closeModal();
        nav("home");
        break;
    }
  } catch (error) {
    if (err) err.textContent = error.message;
    else toast(error.message);
  } finally {
    pending = false;
    if (button?.isConnected) button.disabled = false;
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "machine") updateSlots();
});
document.addEventListener("keydown", (e) => {
  if (!$(".modal")) return;
  if (e.key === "Escape") closeModal();
  if (e.key === "Tab") {
    const nodes = [
      ...$(".modal").querySelectorAll(
        "button:not(:disabled),input,select,a[href]",
      ),
    ];
    const first = nodes[0],
      last = nodes.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
window.addEventListener("hashchange", () => {
  page = location.hash.slice(1) || "home";
  render();
});
async function boot() {
  try {
    if (!token) {
      const data = await api("/auth/demo", {});
      token = data.token;
      sessionStorage.setItem("smartdorm-token", token);
    }
    accept(await api("/state"));
    render();
  } catch (e) {
    if (e.status === 401) {
      token = null;
      sessionStorage.removeItem("smartdorm-token");
      return boot();
    }
    $("#main").innerHTML =
      `<div class="loading"><i class="fa-solid fa-microchip text-3xl text-blue-600" aria-hidden="true"></i><h2>Reconnecting to SmartHub</h2><p>${esc(e.message)}</p>${btn("Try again", "retry", "", "primary")}</div>`;
  }
}
setInterval(() => {
  document
    .querySelectorAll("[data-timer]")
    .forEach((el) => (el.textContent = remaining(Number(el.dataset.timer))));
}, 1000);
setInterval(async () => {
  if (!state || !token || pending || document.hidden) return;
  try {
    const data = await api("/state");
    const before = JSON.stringify({ ...state, serverTime: 0 });
    accept(data, true);
    if (before !== JSON.stringify({ ...state, serverTime: 0 }) && !$(".modal"))
      render();
    if (
      modalKind === "basket" &&
      state.baskets.find((b) => b.id === modalId)?.locked
    ) {
      closeModal();
      render();
      toast("Your basket automatically locked.");
    }
  } catch (e) {
    if (!offline) {
      offline = true;
      render();
    }
    if (e.status === 401) {
      token = null;
      sessionStorage.removeItem("smartdorm-token");
      closeModal();
      await boot();
    }
  }
}, 4000);

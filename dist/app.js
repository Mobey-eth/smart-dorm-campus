const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  home: "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z",
  fridge: "M5 3h14v18H5z M5 10h14 M8 6v2 M8 13v4",
  washer:
    "M4 3h16v18H4z M4 7h16 M7 5h1 M17 5h0 M16 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M9 14q3-3 6 0",
  microwave: "M3 6h18v13H3z M6 9h10v7H6z M19 10h0 M19 14v2",
  calendar: "M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2 M8 17h2",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  sliders: "M4 6h16 M4 12h16 M4 18h16 M8 4v4 M16 10v4 M9 16v4",
  building: "M4 21V5h10v16 M14 10h6v11 M8 8h2 M8 12h2 M8 16h2 M2 21h20",
  lock: "M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3",
  unlock: "M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0 M12 14v3",
  check: "m5 12 4 4L19 6",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2",
  wifi: "M3 8a14 14 0 0 1 18 0 M6 12a9 9 0 0 1 12 0 M9 16a4 4 0 0 1 6 0 M12 20h0",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6",
  close: "m6 6 12 12 M6 18 18 6",
  logout: "M9 4H4v16h5 M9 12h12 M17 8l4 4-4 4",
  plus: "M12 5v14 M5 12h14",
  minus: "M5 12h14",
  alert: "m12 3 10 18H2z M12 9v5 M12 18h0",
  reset: "M3 11a9 9 0 1 1 2 7 M3 4v7h7",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-3c0-6 16-6 16 0v3",
  weight: "M4 8h16l2 13H2z M9 8V5a3 3 0 0 1 6 0v3",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z",
};
const icon = (name) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${paths[name] || paths.home}"/></svg>`;
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
function header(title, subtitle, action = "") {
  return `<div class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}
function renderChrome() {
  const user = state.user;
  const tabs = [
    ["home", "home", "Overview"],
    ["fridge", "fridge", "Refrigerator"],
    ["microwave", "microwave", "Microwaves"],
    ["laundry", "washer", "Laundry"],
    ["bookings", "calendar", "My bookings"],
  ];
  $("#sidebar").innerHTML =
    `<a class="brand" href="#home"><span class="logo">s<span>·</span></span>smartdorm<sup>IPES</sup></a><div class="residence">${icon("building")}<div>IPES Residence<small>Block A · Shared utilities</small></div></div><div class="nav-label">Your everyday</div><nav>${tabs.map(([key, ico, label]) => `<button class="nav-btn ${page === key ? "active" : ""}" data-action="nav" data-id="${key}" ${page === key ? 'aria-current="page"' : ""}>${icon(ico)}<span>${label}</span></button>`).join("")}${user.role === "admin" ? `<div class="nav-separator"></div><button class="nav-btn nav-admin ${page === "admin" ? "active" : ""}" data-action="nav" data-id="admin">${icon("shield")}<span>Administration</span></button>` : ""}</nav><div class="sidebar-bottom"><div class="connection"><span class="dot" style="color:var(--teal)"></span>${offline ? "Reconnecting to residence" : "Your residence is connected"}<small>Kitchen. Laundry. One less thing to worry about.</small></div><div class="profile"><span class="avatar">${esc(user.username.slice(0, 2).toUpperCase())}</span><div><strong>${esc(user.username)}</strong><small>${user.role === "admin" ? "Administrator" : "Resident"} · Block A</small></div><button class="icon-btn" data-action="account" aria-label="Account options">${icon("logout")}</button></div></div>`;
  $("#crumb").textContent =
    {
      home: "Overview",
      fridge: "Refrigerator",
      laundry: "Laundry",
      microwave: "Microwaves",
      bookings: "My bookings",
      admin: "Administration",
      activity: "Activity",
    }[page] || "Overview";
  $("#top-actions").innerHTML =
    `${state.user.role === "admin" ? `<button class="icon-btn" data-action="nav" data-id="admin" aria-label="Administration">${icon("shield")}</button>` : ""}${state.user.demo ? '<span class="badge demo"><i class="dot"></i>DEMO MODE</span>' : '<span class="badge available">Sensor simulation</span>'}<button class="icon-btn" data-action="activity" aria-label="Notifications">${icon("bell")}${state.alerts.filter((a) => !a.resolved).length ? `<span class="count">${state.alerts.filter((a) => !a.resolved).length}</span>` : ""}</button>${state.user.demo ? `<button class="btn small" data-action="controls" aria-label="Presentation controls">${icon("sliders")}<span>Controls</span></button>` : ""}<button class="icon-btn" data-action="account" aria-label="Your account"><span class="avatar">${esc(user.username.slice(0, 2).toUpperCase())}</span>${icon("user")}</button>`;
}
function activityRows(limit = 5) {
  return state.events.length
    ? state.events
        .slice(0, limit)
        .map(
          (e) =>
            `<div class="activity-row"><span class="event-icon">${icon(e.type === "warning" ? "alert" : e.title.includes("asket") ? "lock" : e.title.includes("ash") ? "washer" : "check")}</span><div class="activity-copy"><strong>${esc(e.title)}</strong><p>${esc(e.detail)}</p></div><time>${timeAgo(e.at)}</time></div>`,
        )
        .join("")
    : empty("Your updates will appear here.");
}
function basketSummary() {
  const b = myBaskets()[0];
  return `<section><div class="section-head"><h2>Your refrigerator space</h2>${go("View baskets", "fridge")}</div><div class="card">${b ? `<div class="row between"><h3>A little space, just for you.</h3>${badge(b.locked ? "available" : "warning", b.locked ? "Secured" : "Unlocked")}</div><div class="basket-preview"><div class="basket-drawing"></div><div><h3>Basket ${b.id}</h3><p>Refrigerator ${b.unit} · Individual PIN lock</p></div></div><div class="info-pair"><span class="muted">Current weight</span><strong>${b.weight.toFixed(2)} kg <span class="muted">/ 10 kg</span></strong></div><div class="card-actions">${btn(b.locked ? "Unlock basket" : "Manage basket", "basket", b.id, "primary", "lock")}${btn("View details", "basket", b.id)}</div>` : empty("Your own secure space for the essentials.", btn("Find a basket", "nav", "fridge", "primary"))}</div></section>`;
}
function bookingSummary() {
  const b = myBookings().find((b) => b.status === "running") || myBookings()[0];
  return `<section><div class="section-head"><h2>Your laundry</h2>${go("All bookings", "bookings")}</div><div class="card">${b ? `<div class="row between"><h3>${b.applianceId} · ${b.duration} min cycle</h3>${badge(b.status)}</div><div class="booking-summary"><span class="service-icon washer">${icon("washer")}</span><div>${b.status === "running" ? `<div class="timer">${timer(b.end)}</div><small>remaining in this cycle</small>` : `<h3>${b.status === "reserved" ? dateTime(b.start) : "Ready when you are."}</h3><p class="hint">${b.status === "reserved" ? "Your time is saved." : "Your wash is complete. Please collect your clothes."}</p>`}</div></div><div class="progress"><div style="width:${b.status === "running" ? Math.max(0, Math.min(100, 100 * (1 - (b.end - now()) / (b.duration * 60000)))) : b.status === "reserved" ? 0 : 100}%"></div></div><div class="notice">${icon("bell")} ${b.status === "running" ? "We’ll let you know here when your clothes are ready." : b.status === "reserved" ? "Start the machine when your reserved time arrives." : "The washer stays occupied until you confirm collection."}</div>${bookingActions(b)}` : empty("Make laundry fit your day.", btn("Book a wash", "book", "WM-01", "primary", "calendar"))}</div></section>`;
}
function home() {
  const free = state.baskets.filter((b) => !b.ownerId).length,
    mw = state.appliances.filter((a) => a.kind === "microwave"),
    wm = state.appliances.filter((a) => a.kind === "washer");
  return `${header(`Welcome home, ${esc(state.user.username)}.`, "A little less waiting. A little more living.", `<div class="date-label">${icon("calendar")}${new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>`)}<section class="hero"><div class="hero-copy"><div class="eyebrow">Your everyday, connected</div><h2>A smarter space.<br><em>A simpler student life.</em></h2><p>Your kitchen, laundry and food storage. All in one place, all at your fingertips.</p>${btn("Plan your next wash", "book", "WM-01", "", "arrow")}</div><div class="hero-art" aria-hidden="true"><span class="art-signal">${icon("wifi")}</span><div class="mini-fridge"></div><div class="mini-micro"></div><div class="mini-washer"></div></div></section><div class="section-head"><h2>Around your residence</h2><span class="live"><i class="dot"></i>Live availability</span></div><div class="services">${[
    [
      "fridge",
      "Refrigerator",
      "Secure, personal basket storage",
      free,
      "baskets available",
      "12 individual baskets",
      "Find your space",
    ],
    [
      "microwave",
      "Microwaves",
      "Check before you head downstairs",
      mw.filter((a) => a.status === "available").length,
      "ready to use",
      "Communal kitchen",
      "View microwaves",
    ],
    [
      "washer",
      "Laundry",
      "A wash that works with your schedule",
      wm.filter((a) => a.status === "available").length,
      "washers available",
      "Book up to 7 days ahead",
      "Book a wash",
    ],
  ]
    .map(
      ([kind, name, sub, n, metric, foot, cta]) =>
        `<article class="service"><div class="service-body"><div class="row between"><span class="service-icon ${kind}">${icon(kind)}</span>${badge(n ? "available" : "warning", n ? "Space available" : "Check status")}</div><h3>${name}</h3><p class="caption">${sub}</p><div class="metric">${n}<span>${metric}</span></div></div><div class="service-footer"><small>${foot}</small>${go(cta, kind === "washer" ? "laundry" : kind)}</div></article>`,
    )
    .join(
      "",
    )}</div><div class="two-col">${basketSummary()}${bookingSummary()}</div><section><div class="section-head"><h2>Recent activity</h2>${go("View all", "activity")}</div><div class="card activity">${activityRows(4)}</div></section>${state.user.demo ? `<div class="reset-home">${btn("Reset presentation", "reset-confirm", "", "", "reset")}</div>` : ""}`;
}
function fridge() {
  const list = state.baskets.filter((b) => b.unit === unit);
  return `${header("Your food. Your space.", "A shared refrigerator, with a secure basket just for you.", badge("available", "4.0°C · Simulated"))}<div class="notice">${icon("fridge")}The double doors open normally. Each basket inside has its own PIN lock and weight sensor.</div><div class="row between"><div class="filter">${["A", "B"].map((u) => `<button class="${u === unit ? "active" : ""}" data-action="unit" data-id="${u}">Refrigerator ${u}</button>`).join("")}</div><small>${list.filter((b) => !b.ownerId).length} of 6 available</small></div><div class="legend"><span><i class="dot" style="color:var(--teal)"></i>Your basket</span><span>Available</span><span>Occupied</span></div><div class="basket-grid">${list.map((b) => `<button class="basket-card ${b.mine ? "mine" : b.ownerId ? "occupied" : ""}" data-action="basket" data-id="${b.id}"><div class="row between">${icon(b.locked ? "lock" : "unlock")}${badge(b.mine ? "available" : b.ownerId ? "offline" : "available", b.mine ? "Your basket" : b.ownerId ? "Occupied" : "Available")}</div><div class="basket-drawing" data-id="${b.id}"></div><h3>Basket ${b.id}</h3><p>${b.mine ? `${b.weight.toFixed(2)} kg · ${b.locked ? "Locked" : "Unlocked"}` : b.ownerId ? "Assigned to another resident" : "Choose a PIN and reserve"}</p></button>`).join("")}</div><div class="notice">${icon("shield")}Weight readings help you keep track of changes. They do not establish who accessed an item or prove theft.</div>`;
}
function bookingActions(b) {
  return `<div class="card-actions">${b.status === "reserved" ? `${btn("Start wash", "booking-start", b.id, "primary", "washer")}${btn("Cancel", "booking-cancel", b.id)}` : b.status === "awaiting_collection" ? btn("I’ve collected my clothes", "booking-collect", b.id, "primary", "check") : btn("View booking", "nav", "bookings", "", "calendar")}</div>`;
}
function appliances(kind) {
  const laundry = kind === "washer";
  const list = state.appliances.filter((a) => a.kind === kind);
  return `${header(laundry ? "Laundry, on your time." : "A warm meal, without the wait.", laundry ? "Reserve a time, start your wash, and get on with your day." : "Check real-time availability before heading to the kitchen.")}<div class="appliance-grid">${list
    .map((a) => {
      const active = state.bookings.find(
        (b) =>
          b.applianceId === a.id &&
          ["running", "awaiting_collection"].includes(b.status),
      );
      return `<article class="card"><div class="row between"><div><h3>${a.name}</h3><p class="hint">${a.location}</p></div>${badge(a.status)}</div><div class="machine-visual ${a.status === "offline" ? "offline" : ""}" aria-hidden="true"><div class="${laundry ? "mini-washer" : "mini-micro"}"></div></div><div class="status-line"><span class="muted">${a.status === "offline" ? "Temporarily unavailable" : a.status === "awaiting_collection" ? "Cycle finished · clothes still inside" : a.status === "running" || a.status === "in_use" ? "Cycle in progress" : "Ready for your next load"}</span>${a.endsAt ? timer(a.endsAt) : active?.status === "running" ? timer(active.end) : ""}</div>${laundry ? `${a.status !== "offline" ? btn("Reserve a time slot", "book", a.id, "primary full", "calendar") : ""}${active?.mine ? `<div style="margin-top:10px">${bookingActions(active)}</div>` : ""}` : a.status === "available" ? btn("Start heating", "heat", a.id, "primary full", "microwave") : a.userId === state.user.id ? btn("End heating", "microwave-stop", a.id, "full") : ""}</article>`;
    })
    .join(
      "",
    )}</div><div class="notice">${icon(laundry ? "bell" : "wifi")}${laundry ? "Completion notifications appear here while the app is open. Completed cycles remain occupied until clothes are collected." : "Appliance readings refresh automatically. Heating actions currently use simulated sensors."}</div>`;
}
function bookings() {
  const list = state.bookings
    .filter((b) => b.mine && (filter === "all" || b.status === filter))
    .sort((a, b) => b.start - a.start);
  return `${header("Your bookings. All in order.", "A little planning makes shared living easier.", btn("New booking", "book", "WM-01", "primary", "plus"))}<div class="filter">${[
    ["all", "All bookings"],
    ["reserved", "Upcoming"],
    ["running", "In progress"],
  ]
    .map(
      ([key, label]) =>
        `<button class="${filter === key ? "active" : ""}" data-action="filter" data-id="${key}">${label}</button>`,
    )
    .join(
      "",
    )}</div><div class="stack">${list.length ? list.map((b) => `<article class="card booking-row"><span class="service-icon washer">${icon("washer")}</span><div class="details"><h3>${b.applianceId} · ${b.duration} minute wash</h3><p>${dateTime(b.start)} – ${new Date(b.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p><p>${badge(b.status)} ${b.status === "running" ? timer(b.end) : ""}</p></div>${["reserved", "awaiting_collection"].includes(b.status) ? bookingActions(b) : ""}</article>`).join("") : empty("No bookings here yet.", btn("Reserve a washer", "book", "WM-01", "primary"))}</div>`;
}
function activity() {
  return `${header("Everything, up to date.", "Appliance updates, basket access and important reminders.")}<div class="stack">${state.alerts.map((a) => `<div class="notice warning">${icon("alert")}<div><strong>${a.resolved ? "Reviewed" : "Weight change to review"}</strong><p>${esc(a.detail)}</p>${state.user.role === "admin" && !a.resolved ? btn("Mark reviewed", "resolve", a.id, "small") : ""}</div></div>`).join("")}</div><div class="card activity">${activityRows(100)}</div>`;
}
function adminView() {
  if (state.user.role !== "admin")
    return empty("Administrator access is required.");
  return `${header("Residence management.", "Keep shared spaces running smoothly.", badge("available", "Administrator"))}<div class="two-col"><section><div class="section-head"><h2>Appliances</h2></div><div class="card">${state.appliances.map((a) => `<div class="admin-row"><div><strong>${a.name}</strong><small>${labels[a.status]}</small></div>${["available", "offline"].includes(a.status) ? btn(a.status === "offline" ? "Bring online" : "Take offline", "toggle-appliance", a.id, "small") : badge(a.status)}</div>`).join("")}</div></section><section><div class="section-head"><h2>Basket assignments</h2></div><div class="card">${state.baskets.map((b) => `<div class="admin-row"><div><strong>${b.id} · Refrigerator ${b.unit}</strong><small>${b.ownerId ? (b.mine ? "Emeka / current resident" : "Assigned") : "Available"} · ${b.weight.toFixed(2)} kg</small></div>${btn("Manage", "assign", b.id, "small")}</div>`).join("")}</div></section></div><div class="section-head"><h2>Active reservations</h2></div><div class="stack">${
    state.bookings
      .filter((b) =>
        ["reserved", "running", "awaiting_collection"].includes(b.status),
      )
      .map(
        (b) =>
          `<div class="card booking-row"><div class="details"><h3>${b.applianceId} · ${dateTime(b.start)}</h3><p>${badge(b.status)}</p></div>${b.status === "running" ? "<small>Cycle in progress</small>" : bookingActions(b)}</div>`,
      )
      .join("") || empty("No active reservations.")
  }</div><div style="margin-top:25px">${activity()}</div>`;
}
function render() {
  if (!state) return;
  renderChrome();
  const views = {
    home,
    fridge,
    microwave: () => appliances("microwave"),
    laundry: () => appliances("washer"),
    bookings,
    activity,
    admin: adminView,
  };
  if (!views[page]) page = "home";
  $("#main").innerHTML =
    `${offline ? '<div class="network-banner">Connection interrupted. Showing the last saved status; reconnecting…</div>' : ""}${views[page]()}`;
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
      `Make ${b.id} yours.`,
      `<p>Refrigerator ${b.unit} · Create a private PIN for your basket.</p><form id="reserve-form" data-id="${id}"><label for="pin">Choose a 4–6 digit PIN</label><input id="pin" class="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="new-password" required><p class="hint">Remember this PIN. You’ll need it each time you unlock your basket.</p>${errorBox}<button class="btn primary full">Reserve basket</button></form>`,
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
    "Make time for a fresh start.",
    `<p>Choose your washer, time and cycle. Reservations are checked automatically for conflicts.</p><form id="book-form"><label for="machine">Washing machine</label><select name="applianceId" id="machine">${state.appliances
      .filter((a) => a.kind === "washer" && a.status !== "offline")
      .map(
        (a) =>
          `<option value="${a.id}" ${a.id === id ? "selected" : ""}>${a.name} · ${labels[a.status]}</option>`,
      )
      .join(
        "",
      )}</select><label for="start">Start time</label><input type="datetime-local" id="start" name="start" value="${local}" min="${local}" required><label for="duration">Wash cycle</label><select name="duration" id="duration"><option value="30">Quick wash · 30 minutes</option><option value="45">Everyday wash · 45 minutes</option><option value="60">Heavy load · 60 minutes</option></select><div id="slot-list" class="hint"></div>${errorBox}<button class="btn primary full">Confirm reservation ${icon("arrow")}</button></form>`,
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
  modal(
    mode === "register" ? "Welcome to your residence." : "Good to see you.",
    `<p>${mode === "register" ? "Create an account with a made-up username. No email, full name or personal details needed." : "Sign in to manage your baskets and bookings."}</p><form id="auth-form" data-mode="${mode}"><label for="username">Username</label><input id="username" name="username" minlength="3" maxlength="24" pattern="[A-Za-z0-9_-]+" autocomplete="username" required><label for="password">Password</label><input id="password" name="password" type="password" minlength="10" maxlength="128" autocomplete="${mode === "register" ? "new-password" : "current-password"}" required><p class="hint">Use at least 10 characters. For this presentation, choose a password you don’t use elsewhere.</p>${errorBox}<button class="btn primary full">${mode === "register" ? "Create account" : "Sign in"}</button></form><div style="margin-top:17px;text-align:center"><button class="text-btn" data-action="auth-mode" data-id="${mode === "register" ? "login" : "register"}">${mode === "register" ? "Already have an account? Sign in" : "New here? Create an account"}</button></div>${!state?.user.demo ? `<div class="card-actions" style="margin-top:18px">${btn("Sign out", "logout", "", "small")}</div>` : ""}`,
  );
}
async function handleAction(action, id) {
  switch (action) {
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
        "Warm up your day.",
        `<p>${id} · Choose a heating duration.</p><form id="heat-form" data-id="${id}"><label for="minutes">Heating time</label><select name="minutes" id="minutes"><option value="1">1 minute</option><option value="3" selected>3 minutes</option><option value="5">5 minutes</option></select>${errorBox}<button class="btn primary full">Start heating</button></form>`,
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
      `<div class="loading"><span class="logo">s<span>·</span></span><h1>Let’s reconnect.</h1><p>${esc(e.message)}</p>${btn("Try again", "retry", "", "primary")}</div>`;
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
boot();

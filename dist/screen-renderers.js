// Screen markup follows the supplied IPES SmartHub prototype; actions use the API.
const currency = (amount) => "₦" + Number(amount || 0).toLocaleString("en-NG");
const storageHours = (b) =>
  b.storedAt && b.weight > 0
    ? Math.max(0, Math.floor((now() - b.storedAt) / 3600000))
    : 0;
const storageTime = (b) => {
  const hours = storageHours(b);
  return `${Math.floor(hours / 24)} Days, ${hours % 24} Hrs`;
};
const freshness = (b) => {
  const hours = storageHours(b);
  return hours > 132
    ? {
        color: "text-rose-600",
        bar: "bg-rose-500",
        label: "Review stored food",
      }
    : hours > 84
      ? {
          color: "text-amber-600",
          bar: "bg-amber-500",
          label: "Storage reminder",
        }
      : {
          color: "text-emerald-600",
          bar: "bg-emerald-500",
          label: "Storage tracked",
        };
};
const surface = (title, subtitle, ico, action = "") =>
  `<header class="bg-slate-900 text-white px-5 pt-5 pb-6 rounded-b-[28px] shadow-md"><div class="flex items-center gap-3"><div class="w-11 h-11 rounded-2xl bg-slate-800 flex items-center justify-center text-xl text-emerald-400 shrink-0">${icon(ico)}</div><div class="min-w-0"><h2 class="text-xl font-extrabold">${title}</h2><p class="text-xs text-slate-400 mt-0.5">${subtitle}</p></div>${action ? `<div class="ml-auto">${action}</div>` : ""}</div></header>`;
const sectionTitle = (title, action = "") =>
  `<div class="flex justify-between items-center gap-3 mb-3"><h3 class="text-[11px] font-bold text-slate-400 tracking-wider uppercase">${title}</h3>${action}</div>`;
function renderChrome() {
  const user = state.user;
  const tabs = [
    ["home", "home", "Home"],
    ["fridge", "fridge", "Fridge"],
    ["microwave", "microwave", "Microwave"],
    ["laundry", "washer", "Laundry"],
  ];
  $("#sidebar").innerHTML =
    `<div class="grid grid-cols-4 md:flex md:flex-col gap-1.5">${tabs.map(([key, ico, label]) => `<button data-action="nav" data-id="${key}" id="nav-${key}" class="nav-btn ${page === key ? "active" : ""}" ${page === key ? 'aria-current="page"' : ""}>${icon(ico)}<span>${label}</span></button>`).join("")}</div><div class="hidden md:block mt-4 pt-3 border-t border-slate-100"><button class="nav-btn ${page === "bookings" ? "active" : ""}" data-action="nav" data-id="bookings">${icon("calendar")}<span>My bookings</span></button>${user.role === "admin" ? `<button class="nav-btn ${page === "admin" ? "active" : ""}" data-action="nav" data-id="admin">${icon("shield")}<span>Administration</span></button>` : ""}</div>`;
  $("#top-actions").innerHTML =
    `<span class="hidden xl:inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1.5"><span class="w-2 h-2 bg-emerald-500 rounded-full"></span>${offline ? "Reconnecting" : "IoT Hub Online"}</span>${user.demo ? '<span class="badge demo">Demo Mode</span>' : ""}<button class="icon-btn" data-action="activity" aria-label="Notifications">${icon("bell")}${state.alerts.some((a) => !a.resolved) ? '<span class="count">!</span>' : ""}</button><button class="avatar shrink-0" data-action="account" aria-label="Your account">${user.demo ? "EO" : esc(user.username.slice(0, 2).toUpperCase())}</button>`;
  $("#mobile-controls").classList.toggle("hidden", !user.demo);
  $("#hub-panel").innerHTML = hubPanel();
}
function hubPanel() {
  return `<div class="flex items-start justify-between border-b border-slate-100 pb-4"><div><h2 class="text-lg font-extrabold text-slate-900 tracking-tight">IPES SmartHub</h2><p class="text-xs text-slate-500 mt-0.5">Hub controls</p></div><div class="w-10 h-10 rounded-2xl bg-slate-900 text-emerald-400 flex items-center justify-center shadow-sm">${icon("spark")}</div></div>${
    state.user.demo
      ? `<div class="space-y-3"><p class="text-xs font-semibold text-slate-500">Sensor events</p>${[
          [
            "age",
            "clock",
            "+1 Day Food Age",
            "Advance the storage reminder",
            "bg-amber-100 text-amber-600",
          ],
          [
            "complete",
            "bell",
            "Trigger Cycle Alert",
            "Mark a running wash as complete",
            "bg-emerald-100 text-emerald-600",
          ],
          [
            "anomaly",
            "weight",
            "Weight Change",
            "Flag a reading for review",
            "bg-blue-100 text-blue-600",
          ],
        ]
          .map(
            ([key, ico, title, desc, color]) =>
              `<button data-action="simulate" data-id="${key}" class="group w-full text-left p-3.5 rounded-2xl border border-slate-200 hover:border-blue-300 bg-slate-50/70 hover:bg-blue-50/60 transition-all flex items-center justify-between gap-2"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl ${color} flex items-center justify-center shrink-0">${icon(ico)}</div><div><div class="text-sm font-bold text-slate-900">${title}</div><div class="text-xs text-slate-500 mt-0.5">${desc}</div></div></div><span class="text-xs text-slate-400">${icon("chevron")}</span></button>`,
          )
          .join(
            "",
          )}<button data-action="role" class="w-full text-left px-3.5 py-3 rounded-xl border border-slate-200 text-xs font-semibold text-blue-600 hover:bg-blue-50 flex gap-2 items-center">${icon("shield")}Switch to ${state.user.role === "admin" ? "resident" : "administrator"} view</button></div>`
      : ""
  }<div class="border-t border-slate-100 pt-4"><p class="text-xs font-semibold text-slate-500 mb-2.5">Quick access</p><div class="grid grid-cols-2 gap-2">${[
    ["home", "home", "Dashboard"],
    ["fridge", "fridge", "PIN Baskets"],
    ["microwave", "microwave", "Microwaves"],
    ["laundry", "washer", "Laundry Hub"],
  ]
    .map(
      ([key, ico, label]) =>
        `<button data-action="nav" data-id="${key}" class="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center gap-2 transition"><span class="text-blue-600">${icon(ico)}</span>${label}</button>`,
    )
    .join(
      "",
    )}</div></div><div class="bg-slate-900 text-white rounded-2xl p-4 text-xs"><div class="flex items-center justify-between mb-2"><span class="font-semibold text-slate-300">Hostel Hub Telemetry</span><span class="text-emerald-400 font-bold">${offline ? "Reconnecting" : "Connected"}</span></div><div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-center"><div><div class="text-slate-400 text-[10px]">Fridge Temp</div><div class="font-bold text-sm mt-0.5">4.0°C</div></div><div><div class="text-slate-400 text-[10px]">Power Source</div><div class="font-bold text-sm text-emerald-400 mt-0.5">Inverter</div></div><div><div class="text-slate-400 text-[10px]">Your Baskets</div><div class="font-bold text-sm text-blue-400 mt-0.5">${myBaskets().length} Active</div></div></div></div>`;
}
function activityRows(limit = 4) {
  return state.events.length
    ? state.events
        .slice(0, limit)
        .map(
          (e) =>
            `<div class="flex gap-3 p-3.5"><div class="w-9 h-9 rounded-xl ${e.type === "warning" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"} flex items-center justify-center shrink-0">${icon(e.type === "warning" ? "alert" : e.title.includes("asket") ? "fridge" : e.title.includes("ash") ? "washer" : "check")}</div><div class="min-w-0 flex-1"><p class="text-xs font-bold">${esc(e.title)}</p><p class="text-[11px] text-slate-500 mt-0.5 leading-relaxed">${esc(e.detail)}</p></div><span class="text-[10px] text-slate-400 shrink-0">${timeAgo(e.at)}</span></div>`,
        )
        .join("")
    : empty("Your activity will appear here.");
}
function basketCard(b) {
  const fresh = freshness(b);
  return `<div class="card mb-3"><div class="flex justify-between items-start gap-2 mb-3"><div class="flex items-center gap-2"><div class="bg-blue-600 text-white px-2.5 py-3 rounded-xl text-xs font-extrabold">#${b.id}</div><div><p class="text-sm font-extrabold">Smart Basket #${b.id}</p><p class="text-[11px] text-slate-500">Unit ${b.unit} · ${esc(b.plan === "three_days" ? "3-Day Pass" : b.plan === "week" ? "Full Week (Sun–Sat)" : "Personal storage")}</p></div></div><span class="text-emerald-600">${icon(b.locked ? "lock" : "unlock")}</span></div><div class="bg-slate-900 text-white rounded-xl p-3 flex justify-between items-center mb-3 gap-3"><div><p class="text-[10px] uppercase tracking-wider text-slate-400">Basket Access PIN</p><p class="font-mono text-lg font-extrabold tracking-widest text-emerald-400">••••</p></div><button data-action="basket" data-id="${b.id}" class="bg-blue-600 hover:bg-blue-500 rounded-lg px-3 py-2 text-[11px] font-bold">${icon(b.locked ? "lock" : "unlock")} ${b.locked ? "Unlock basket" : "Manage basket"}</button></div><div class="flex justify-between items-center text-[11px] font-semibold mb-1"><span class="${fresh.color}">${fresh.label}</span><span class="text-slate-500">${storageTime(b)}</span></div><div class="h-2 bg-slate-100 rounded-full mb-3 overflow-hidden"><div class="h-full rounded-full ${fresh.bar}" style="width:${Math.min(100, (storageHours(b) / 168) * 100)}%"></div></div><div class="flex justify-between text-[11px] text-slate-500 mb-3"><span>Weight sensor: ${b.weight.toFixed(2)} kg</span><span>${b.locked ? "Locked" : "Unlocked"}</span></div><div class="flex gap-2"><button data-action="meal" data-id="${b.id}" class="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg py-2 text-[11px] font-bold">Log New Meal</button><button data-action="basket" data-id="${b.id}" class="flex-1 bg-slate-100 hover:bg-slate-200 rounded-lg py-2 text-[11px] font-bold">Manage Basket</button></div></div>`;
}
function home() {
  const mw = state.appliances.filter((a) => a.kind === "microwave"),
    wm = state.appliances.filter((a) => a.kind === "washer");
  return `<header class="bg-slate-900 text-white px-5 pt-4 pb-6 rounded-b-[28px] shadow-md"><div class="flex items-center justify-between mb-4"><div><h2 class="text-lg font-extrabold">Hi, ${esc(state.user.username)} <span class="text-blue-300">· IPES</span></h2><p class="text-xs text-slate-400 mt-1"><i class="fa-solid fa-location-dot text-blue-400 mr-1" aria-hidden="true"></i> ${state.user.demo ? "Block A, Room 204" : "Block A · Resident"}</p></div><div class="w-11 h-11 bg-slate-800 rounded-2xl flex items-center justify-center text-blue-400 font-extrabold">${state.user.demo ? "EO" : esc(state.user.username.slice(0, 2).toUpperCase())}</div></div><div class="inline-flex items-center gap-2 bg-slate-800 rounded-full border border-slate-700 px-3 py-1 text-emerald-300 text-[11px] font-semibold mb-4"><span class="w-2 h-2 rounded-full bg-emerald-400"></span>${offline ? "Reconnecting" : "Hub Online"} · Inverter Active · 4°C</div><div class="bg-slate-800 rounded-2xl border border-slate-700 px-4 py-3 flex items-center justify-between gap-3"><div><p class="text-[11px] text-slate-400">SmartHub Wallet Balance</p><p id="wallet-balance" class="text-2xl font-extrabold">${currency(state.walletBalance)}</p></div><button data-action="topup" class="bg-blue-600 hover:bg-blue-700 text-xs font-bold rounded-xl px-3 py-2.5 shadow-lg">${icon("plus")} Top Up</button></div></header><div class="px-4 py-5 space-y-5"><section>${sectionTitle("Live Hub Availability", '<span class="text-[10px] text-emerald-600 font-bold"><i class="fa-solid fa-wifi" aria-hidden="true"></i> Synced</span>')}<div class="grid grid-cols-3 gap-2">${[
    [
      "fridge",
      "fridge",
      "text-emerald-500",
      state.baskets.filter((b) => !b.ownerId).length,
      state.baskets.length,
      "Baskets Free",
    ],
    [
      "microwave",
      "microwave",
      "text-amber-500",
      mw.filter((a) => a.status === "available").length,
      mw.length,
      "Microwaves",
    ],
    [
      "laundry",
      "washer",
      "text-blue-500",
      wm.filter((a) => a.status === "available").length,
      wm.length,
      "Laundry Free",
    ],
  ]
    .map(
      ([tab, ico, color, n, total, label]) =>
        `<button data-action="nav" data-id="${tab}" class="text-left bg-white border border-slate-200 rounded-2xl p-3 shadow-card hover:border-blue-300"><span class="${color} inline-block mb-2">${icon(ico)}</span><p class="text-xl font-extrabold">${n}<span class="text-xs text-slate-400">/${total}</span></p><p class="text-[10px] font-semibold text-slate-600">${label}</p></button>`,
    )
    .join(
      "",
    )}</div></section><section>${sectionTitle("My Active Fridge Basket", go("+ Book Basket", "fridge"))}${myBaskets().length ? myBaskets().map(basketCard).join("") : empty("No basket reserved.", btn("Browse available baskets", "nav", "fridge", "primary"))}</section><section>${sectionTitle("My Appliance Sessions", go("My bookings", "bookings"))}${myBookings()
    .map(
      (b) =>
        `<button data-action="nav" data-id="bookings" class="w-full text-left bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl p-3 mb-2 font-bold text-xs flex items-center justify-between gap-2"><span>${b.applianceId} · ${b.status === "running" ? `${b.duration}m wash · ${timer(b.end)}` : b.status === "awaiting_collection" ? "Ready for pickup" : dateTime(b.start)}</span>${icon("arrow")}</button>`,
    )
    .join("")}${state.appliances
    .filter((a) => a.kind === "microwave" && a.userId === state.user.id)
    .map(
      (a) =>
        `<button data-action="nav" data-id="microwave" class="w-full text-left bg-blue-600 text-white rounded-2xl p-3 mb-2 font-bold text-xs">${a.id} · Heating · ${timer(a.endsAt)}</button>`,
    )
    .join(
      "",
    )}${!myBookings().length ? btn("Book a wash cycle", "book", "WM-01", "primary full", "washer") : ""}</section><section>${sectionTitle("Recent IoT Activity", go("View all", "activity"))}<div class="bg-white rounded-2xl border border-slate-200 shadow-card divide-y divide-slate-100">${activityRows()}</div></section>${state.user.demo ? `<div class="reset-home">${btn("Reset presentation", "reset-confirm", "", "", "reset")}</div>` : ""}</div>`;
}
function fridge() {
  const list = state.baskets.filter((b) => b.unit === unit);
  return (
    surface(
      "Smart Fridge",
      `${state.baskets.length} private PIN-locked baskets · 4°C`,
      "fridge",
    ) +
    `<div class="px-4 py-5 space-y-4"><div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4"><p class="text-xs text-emerald-800 font-bold">${icon("spark")} Every basket is individually secured</p><p class="text-[11px] text-emerald-700 mt-1 leading-relaxed">The double doors open normally. Inside, each basket has its own PIN lock and weight sensor.</p></div><div class="grid grid-cols-2 bg-slate-200 rounded-xl p-1 gap-1">${["A", "B"].map((u) => `<button data-action="unit" data-id="${u}" class="rounded-lg py-2.5 text-xs font-bold ${unit === u ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}">Fridge Unit ${u}</button>`).join("")}</div><div class="flex items-center justify-between"><h3 class="font-extrabold text-sm">Unit ${unit} Baskets</h3><span class="text-[11px] text-slate-500">${list.filter((b) => !b.ownerId).length} available / ${list.length}</span></div><div class="grid grid-cols-2 gap-3">${list.map((b) => `<button data-action="basket" data-id="${b.id}" class="text-left rounded-2xl border ${b.mine ? "border-blue-400 bg-blue-50" : !b.ownerId ? "border-emerald-200 bg-white" : "border-slate-200 bg-slate-100"} p-3.5 shadow-card"><div class="flex justify-between mb-3"><span class="${b.mine ? "text-blue-600" : !b.ownerId ? "text-emerald-600" : "text-slate-400"} text-lg">${icon(b.mine && !b.locked ? "unlock" : b.ownerId ? "lock" : "fridge")}</span><span class="text-[10px] font-bold text-slate-500">#${b.id}</span></div><h3 class="font-extrabold text-sm mb-1">Basket #${b.id}</h3><p class="text-[10px] font-bold ${b.mine ? "text-blue-600" : !b.ownerId ? "text-emerald-600" : "text-slate-500"}">${b.mine ? "Your Basket" : b.ownerId ? "Occupied" : "Available"}</p><div class="basket-mesh rounded-lg h-6 mt-3 border border-slate-200/60"></div><p class="text-[10px] text-slate-500 mt-2">${b.mine ? `${b.weight.toFixed(2)} kg · ${b.locked ? "Locked" : "Unlocked"}` : b.ownerId ? "Assigned to another resident" : "Tap to reserve"}</p></button>`).join("")}</div><p class="text-[11px] text-slate-500 text-center leading-relaxed">Select a green basket to reserve, or your blue basket to manage access.</p><p class="text-[11px] text-slate-500 leading-relaxed">Weight changes are observations to review, not proof of theft. Storage time is a reminder, not a food-safety assessment.</p></div>`
  );
}
function bookingActions(b) {
  return `<div class="card-actions">${b.status === "reserved" ? btn("Start wash", "booking-start", b.id, "primary", "washer") + btn("Cancel", "booking-cancel", b.id) : b.status === "awaiting_collection" ? btn("I’ve collected my clothes", "booking-collect", b.id, "primary", "check") : ""}</div>`;
}
function appliances(kind) {
  const laundry = kind === "washer";
  return (
    surface(
      laundry ? "Laundry Hub" : "Smart Microwave",
      laundry
        ? "Real-time washer availability"
        : "Check availability from your room",
      laundry ? "washer" : "microwave",
    ) +
    `<div class="px-4 py-5 space-y-3"><div class="${laundry ? "bg-indigo-50 border-indigo-200 text-indigo-900" : "bg-amber-50 border-amber-200 text-amber-900"} border rounded-2xl p-4"><p class="text-xs font-bold">${icon(laundry ? "bell" : "microwave")} ${laundry ? "No more waiting by machines" : "Skip the kitchen queue"}</p><p class="text-[11px] mt-1 leading-relaxed">${laundry ? "Book a time slot and get a notification when your wash is finished." : "Check which microwave is free, then start heating when you arrive. ₦100 per session."}</p></div>${state.appliances
      .filter((a) => a.kind === kind)
      .map((a) => {
        const active = state.bookings.find(
          (b) =>
            b.applianceId === a.id &&
            ["running", "awaiting_collection"].includes(b.status),
        );
        return `<div class="card"><div class="flex gap-3 items-center"><div class="w-12 h-12 rounded-2xl ${laundry ? "bg-indigo-50 text-indigo-500" : "bg-amber-50 text-amber-500"} flex items-center justify-center shrink-0 text-xl">${icon(laundry ? "washer" : "microwave")}</div><div class="flex-1 min-w-0"><h3 class="font-extrabold text-sm">${laundry ? a.name : "Smart " + a.name}</h3><p class="text-[11px] text-slate-500 mt-1">${laundry ? a.location : "Current sensor · IoT-connected"}</p></div>${badge(a.status)}</div>${a.status === "available" ? `<div class="mt-4">${laundry ? btn("Book Wash Cycle", "book", a.id, "primary full") : btn("Start Heating · ₦100", "heat", a.id, "primary full")}</div>` : a.status === "offline" ? '<p class="mt-3 rounded-lg bg-slate-100 text-slate-500 p-2.5 text-[11px]">Temporarily offline. Please use another appliance.</p>' : `<div class="mt-3 rounded-xl ${active?.mine || a.userId === state.user.id ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-600"} p-3"><div class="flex justify-between items-center gap-3"><div><p class="text-xs font-bold">${a.status === "awaiting_collection" ? "Cycle complete · Awaiting pickup" : active ? timer(active.end) : a.endsAt ? timer(a.endsAt) : "In use"}</p><p class="text-[10px] opacity-70 mt-1">${a.status === "awaiting_collection" ? "Clothes must be collected before the next wash." : active?.mine ? "Your wash is in progress." : "Appliance in use."}</p></div>${!laundry && a.userId === state.user.id ? btn("End Session", "microwave-stop", a.id, "dark small") : ""}</div>${active?.mine && active.status === "awaiting_collection" ? `<div class="mt-3">${bookingActions(active)}</div>` : ""}</div>${laundry ? `<div class="mt-3">${btn("Reserve a later time", "book", a.id, "full", "calendar")}</div>` : ""}`}</div>`;
      })
      .join(
        "",
      )}${laundry ? `<div class="flex justify-center pt-2">${go("View my bookings", "bookings")}</div>` : ""}</div>`
  );
}
function bookings() {
  const list = state.bookings
    .filter((b) => b.mine && (filter === "all" || b.status === filter))
    .sort((a, b) => b.start - a.start);
  return (
    surface(
      "My Bookings",
      "Manage your upcoming and active laundry cycles",
      "calendar",
    ) +
    `<div class="px-4 py-5 space-y-3"><div class="grid grid-cols-3 bg-slate-200 rounded-xl p-1 gap-1">${[
      ["all", "All"],
      ["reserved", "Upcoming"],
      ["running", "In progress"],
    ]
      .map(
        ([key, label]) =>
          `<button data-action="filter" data-id="${key}" class="py-2.5 rounded-lg text-xs font-bold ${filter === key ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}">${label}</button>`,
      )
      .join(
        "",
      )}</div>${btn("New booking", "book", "WM-01", "primary full", "plus")}${list.length ? list.map((b) => `<div class="card"><div class="flex gap-3 items-center justify-between mb-3"><div><h3 class="font-extrabold text-sm">${b.applianceId} · ${b.duration} min wash</h3><p class="text-[11px] text-slate-500 mt-1">${dateTime(b.start)}</p></div>${badge(b.status)}</div>${b.status === "running" ? `<div class="rounded-xl bg-slate-900 text-white p-3"><p class="text-lg font-extrabold">${timer(b.end)}</p><p class="text-[10px] text-slate-400">Remaining · We’ll notify you when the cycle finishes.</p></div>` : bookingActions(b)}</div>`).join("") : empty("No bookings here yet.")}</div>`
  );
}
function activity() {
  return (
    surface(
      "Notifications & Activity",
      "Basket access, appliance updates and alerts",
      "bell",
    ) +
    `<div class="px-4 py-5 space-y-3">${state.alerts.map((a) => `<div class="bg-amber-50 border border-amber-200 rounded-2xl p-4"><p class="text-xs font-bold text-amber-900">${icon("alert")} ${a.resolved ? "Reviewed" : "Weight change to review"}</p><p class="text-[11px] text-amber-800 mt-1 leading-relaxed">${esc(a.detail)}</p>${state.user.role === "admin" && !a.resolved ? `<div class="mt-3">${btn("Mark reviewed", "resolve", a.id, "small")}</div>` : ""}</div>`).join("")}<div class="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 shadow-card">${activityRows(100)}</div></div>`
  );
}
function adminView() {
  if (state.user.role !== "admin")
    return empty("Administrator access is required.");
  return (
    surface(
      "Administration",
      "Manage appliances, basket assignments and reservations",
      "shield",
    ) +
    `<div class="px-4 py-5 space-y-5"><section>${sectionTitle("Appliances")}<div class="card divide-y divide-slate-100">${state.appliances.map((a) => `<div class="flex items-center justify-between gap-3 py-3"><div><p class="text-xs font-bold">${a.name}</p><p class="text-[11px] text-slate-500 mt-1">${labels[a.status]}</p></div>${["available", "offline"].includes(a.status) ? btn(a.status === "offline" ? "Bring online" : "Take offline", "toggle-appliance", a.id, "small") : badge(a.status)}</div>`).join("")}</div></section><section>${sectionTitle("Basket assignments")}<div class="card divide-y divide-slate-100">${state.baskets.map((b) => `<div class="flex items-center justify-between gap-3 py-3"><div><p class="text-xs font-bold">#${b.id} · Unit ${b.unit}</p><p class="text-[11px] text-slate-500 mt-1">${b.mine ? "Your basket" : b.ownerId ? "Assigned" : "Available"} · ${b.weight.toFixed(2)} kg</p></div>${btn("Manage", "assign", b.id, "small")}</div>`).join("")}</div></section><section>${sectionTitle("Reservations")}<div class="space-y-3">${
      state.bookings
        .filter((b) =>
          ["reserved", "running", "awaiting_collection"].includes(b.status),
        )
        .map(
          (b) =>
            `<div class="card"><div class="flex justify-between items-center gap-2 mb-3"><div><p class="text-xs font-bold">${b.applianceId}</p><p class="text-[11px] text-slate-500 mt-1">${dateTime(b.start)}</p></div>${badge(b.status)}</div>${bookingActions(b)}</div>`,
        )
        .join("") || empty("No active reservations.")
    }</div></section><section>${sectionTitle("Alerts", go("Review alerts", "activity"))}${
      state.alerts
        .filter((a) => !a.resolved)
        .map(
          (a) =>
            `<div class="notice warning"><div><p class="font-bold">Weight change to review</p><p class="mt-1 mb-3">${esc(a.detail)}</p>${btn("Mark reviewed", "resolve", a.id, "small")}</div></div>`,
        )
        .join("") || '<p class="text-xs text-slate-500">No open alerts.</p>'
    }</section></div>`
  );
}
function render() {
  if (!state) return;
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
  renderChrome();
  $("#main").innerHTML =
    `${offline ? '<div class="network-banner">Reconnecting. Showing the last saved status.</div>' : ""}${views[page]()}`;
}
boot();

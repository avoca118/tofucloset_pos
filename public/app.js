const state = {
  token: localStorage.getItem("tc_token") || "",
  user: null,
  data: null,
  view: localStorage.getItem("tc_view") || "dashboard",
  navOpen: false,
  profileOpen: false,
  orderTypeFilter: localStorage.getItem("tc_order_type_filter") || "all",
  preorderFilter: "all",
  inventoryFilter: localStorage.getItem("tc_inventory_filter") || "all",
  inventoryQuery: "",
  inventoryPane: localStorage.getItem("tc_inventory_pane") || "products",
  financeTab: localStorage.getItem("tc_finance_tab") || "overview",
  reportPreset: "this-year",
  reportGenerated: false,
  reportFilters: {
    preset: "this-year",
    from: "",
    to: "",
    productId: "",
    category: "",
    customerId: "",
    staffId: "",
    orderStatus: "",
    paymentStatus: "",
    orderType: "",
    cargoBatch: "",
    deliveryMethod: ""
  },
  searchTimer: null
};

const primaryViews = [
  ["dashboard", "Dashboard"],
  ["orders", "Orders"],
  ["customers", "Customers"],
  ["inventory", "Inventory"],
  ["cargo", "Cargo"],
  ["finance", "Finance & Reports"]
];

const bottomViews = [
  ["settings", "Settings"]
];

const viewAliases = {
  preorders: "orders",
  operations: "orders",
  products: "inventory",
  suppliers: "inventory",
  reports: "finance",
  audit: "settings"
};

const validViews = new Set([...primaryViews, ...bottomViews].map(([id]) => id));

function normalizeView(view) {
  const normalized = viewAliases[view] || view || "dashboard";
  return validViews.has(normalized) ? normalized : "dashboard";
}

state.view = normalizeView(state.view);

const app = document.getElementById("app");
const modalRoot = document.getElementById("modal-root");

function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString("en-US")} MMK`;
}

function shortDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function dateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDateKey(value) {
  const [year, month, day] = String(value || today()).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function shiftDateKey(value, days) {
  const date = parseDateKey(value);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function selectedReportDate() {
  const report = state.data?.reports;
  if (report?.range?.from) return report.range.from;
  if (state.reportFilters.from) return state.reportFilters.from;
  return today();
}

function formatDisplayDate(value) {
  return new Date(parseDateKey(value)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function icon(name) {
  const icons = {
    dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>`,
    orders: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>`,
    customers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    inventory: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
    cargo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a2 2 0 0 0-.4-1.2L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,
    finance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16V9"/><path d="M12 16v-5"/><path d="M17 16V7"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>`,
    sales: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    profit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17 9 11l4 4 8-8"/><path d="M14 7h7v7"/></svg>`,
    pending: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
    bag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l1 14H5L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>`
  };
  return icons[name] || icons.dashboard;
}

function navIcon(viewId) {
  const map = {
    dashboard: "dashboard",
    orders: "orders",
    customers: "customers",
    inventory: "inventory",
    cargo: "cargo",
    finance: "finance",
    settings: "settings"
  };
  return `<span class="nav-icon" aria-hidden="true">${icon(map[viewId] || "dashboard")}</span>`;
}

function cargoBadgeClass(status = "") {
  const value = String(status).toLowerCase();
  if (["completed", "arrived", "delivered"].some((item) => value.includes(item))) return "good";
  if (["transit", "shipped", "muse", "china"].some((item) => value.includes(item))) return "warn";
  if (["pending", "waiting", "new"].some((item) => value.includes(item))) return "dark";
  return "";
}

function classForStatus(status) {
  if (["Delivered", "Completed", "Fully Paid", "Packed", "Active", "In Stock"].includes(status)) return "good";
  if (["Cancelled", "Returned", "Refunded", "Failed", "Returned / Refunded", "Out of Stock", "Inactive"].includes(status)) return "bad";
  if (["Unpaid", "Deposit Paid", "Partially Paid", "Waiting", "To Pack", "Partially Arrived", "Low Stock"].includes(status)) return "warn";
  return "";
}

function inventoryStatusLabel(product) {
  if (product.active === false) return "Inactive";
  const bucket = productStockBucket(product);
  if (bucket === "low") return "Low Stock";
  if (bucket === "out") return "Out of Stock";
  if (product.productType === "Preorder") return "Preorder";
  return "In Stock";
}

function orderActionsCell(order) {
  return `
    <div class="order-actions">
      <button class="btn small secondary" data-action="open-order-details" data-id="${order.id}">Details</button>
      <select class="more-select" data-action="order-more" data-id="${order.id}" aria-label="More actions">
        <option value="">More</option>
        <option value="open-order">Edit</option>
        <option value="open-payment">Payment</option>
        <option value="open-receipt">Receipt</option>
        <option value="open-return">Return</option>
        <option value="open-cancel" ${order.status === "Cancelled" ? "disabled" : ""}>Cancel</option>
      </select>
    </div>
  `;
}

function runOrderMoreAction(orderId, action) {
  const order = orderById(orderId);
  if (!order || !action) return;
  if (action === "open-order") openOrderModal(order);
  if (action === "open-payment") openPaymentModal(order);
  if (action === "open-receipt") openReceipt(order);
  if (action === "open-return") openReturnModal(order);
  if (action === "open-cancel") openCancelModal(order);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body && typeof options.body !== "string" && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let message = "Request failed";
    try {
      message = (await response.json()).error || message;
    } catch (_error) {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) return response.json();
  return response.text();
}

async function loadData() {
  if (!state.token) return;
  const data = await api("/api/app");
  state.user = data.user;
  state.data = data;
}

function requireOwner() {
  return state.user?.role === "Owner";
}

function productById(id) {
  return state.data.products.find((product) => product.id === id);
}

function variantById(id) {
  for (const product of state.data.products) {
    const variant = product.variants.find((item) => item.id === id);
    if (variant) return { product, variant };
  }
  return null;
}

function customerById(id) {
  return state.data.customers.find((customer) => customer.id === id);
}

function profileInitials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "T").toUpperCase() + (parts[1]?.[0] || "C").toUpperCase();
}

function orderById(id) {
  return state.data.orders.find((order) => order.id === id);
}

function activeOrders() {
  return state.data.orders.filter((order) => order.status !== "Cancelled");
}

function available(variant) {
  return Number(variant.stockOnHand || 0) - Number(variant.reserved || 0);
}

function imageFor(product) {
  return product.images?.[0] || "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=300&q=80";
}

function orderPayments(orderId) {
  return state.data.payments.filter((payment) => payment.orderId === orderId);
}

function orderRefunds(orderId) {
  return state.data.refunds.filter((refund) => refund.orderId === orderId);
}

function isClosed(order) {
  return ["Delivered", "Completed", "Cancelled", "Returned", "Returned / Refunded"].includes(order.status);
}

function isOverdue(order) {
  return order.expectedArrival && order.expectedArrival < today() && !isClosed(order);
}

function supplierLocked(order) {
  return !["Pending Confirmation", "Deposit Paid", "New"].includes(order.preorderStatus || order.status);
}

function selectOptions(items, selected = "", emptyLabel = "") {
  const empty = emptyLabel ? `<option value="">${esc(emptyLabel)}</option>` : "";
  return `${empty}${items.map((item) => {
    const value = Array.isArray(item) ? item[0] : item;
    const label = Array.isArray(item) ? item[1] : item;
    return `<option value="${esc(value)}" ${String(value) === String(selected) ? "selected" : ""}>${esc(label)}</option>`;
  }).join("")}`;
}

function reportQuery() {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state.reportFilters)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

async function refreshReports() {
  const query = reportQuery();
  const suffix = query ? `?${query}` : "";
  const [summary, staff] = await Promise.all([
    api(`/api/reports/summary${suffix}`),
    api(`/api/reports/staff${suffix}`)
  ]);
  state.data.reports = summary.report;
  state.data.staffSales = staff.staffSales;
}

function syncReportFilters(form) {
  if (!form) return;
  const data = formData(form);
  state.reportFilters = {
    preset: data.preset || "this-year",
    from: data.from || "",
    to: data.to || "",
    productId: data.productId || "",
    category: data.category || "",
    customerId: data.customerId || "",
    staffId: data.staffId || "",
    orderStatus: data.orderStatus || "",
    paymentStatus: data.paymentStatus || "",
    orderType: data.orderType || "",
    cargoBatch: data.cargoBatch || "",
    deliveryMethod: data.deliveryMethod || ""
  };
  state.reportPreset = state.reportFilters.preset;
}

function productSizes(product) {
  return (product.availableSizes?.length ? product.availableSizes : [...new Set((product.variants || []).map((variant) => variant.size))]).filter(Boolean);
}

function productColors(product) {
  return (product.availableColors?.length ? product.availableColors : [...new Set((product.variants || []).map((variant) => variant.color))]).filter(Boolean);
}

function renderLogin(error = "") {
  app.innerHTML = `
    <main class="login-shell">
      <section class="login-visual">
        <div>
          <h1>TOFU'S CLOSET</h1>
          <p>Orders, preorder deposits, stock, packing, delivery, and profit in one calm workspace.</p>
        </div>
      </section>
      <section class="login-panel">
        <form class="login-card" id="login-form">
          <div class="brand-mark"><span class="brand-dot">TC</span><span>TOFU'S CLOSET POS</span></div>
          <div>
            <h2>Welcome back</h2>
            <p class="muted">Sign in to manage today's orders and operations.</p>
          </div>
          <div class="error ${error ? "is-visible" : ""}">${esc(error)}</div>
          <label>Email
            <input name="email" type="email" value="owner@tofuscloset.local" autocomplete="username" required>
          </label>
          <label>Password
            <input name="password" type="password" value="owner123" autocomplete="current-password" required>
          </label>
          <button class="btn good" type="submit">Sign in</button>
          <p class="muted tiny">Owner: owner@tofuscloset.local / owner123<br>Staff: staff@tofuscloset.local / staff123</p>
        </form>
      </section>
    </main>
  `;
}

function renderShell() {
  state.view = normalizeView(state.view);
  if (state.view === "settings" && !requireOwner()) state.view = "dashboard";
  localStorage.setItem("tc_view", state.view);

  const nav = primaryViews
    .map(([id, label]) => `<button class="${state.view === id ? "active" : ""}" data-action="nav" data-view="${id}">${navIcon(id)}<span>${label}</span></button>`)
    .join("");
  const bottomNav = bottomViews
    .filter(([id]) => requireOwner() || id !== "settings")
    .map(([id, label]) => `<button class="${state.view === id ? "active" : ""}" data-action="nav" data-view="${id}">${navIcon(id)}<span>${label}</span></button>`)
    .join("");
  const userNameText = state.user?.name || "Account";

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar ${state.navOpen ? "is-open" : ""}">
        <div class="brand-mark"><span class="brand-dot">TC</span><span>TOFU'S CLOSET</span></div>
        <div class="sidebar-layout">
          <nav class="nav nav-primary">${nav}</nav>
          <div class="sidebar-bottom">
            ${bottomNav ? `<nav class="nav nav-secondary">${bottomNav}</nav>` : ""}
            <div class="profile-wrap">
              <button class="profile-btn ${state.profileOpen ? "active" : ""}" data-action="toggle-profile" aria-expanded="${state.profileOpen}">
                <span class="profile-avatar">${esc(profileInitials(userNameText))}</span>
                <span class="profile-text"><strong>${esc(userNameText)}</strong><small>${esc(state.user?.role || "Account")}</small></span>
                <span class="chevron" aria-hidden="true">&#9662;</span>
              </button>
              <div class="profile-dropdown ${state.profileOpen ? "is-visible" : ""}">
                <button data-action="open-profile">Profile</button>
                ${requireOwner() ? `<button data-action="nav" data-view="settings">Settings</button>` : ""}
                <button class="danger-text" data-action="logout">Logout</button>
              </div>
            </div>
          </div>
        </div>
      </aside>
      <div class="nav-scrim ${state.navOpen ? "is-visible" : ""}" data-action="close-nav"></div>
      <main class="main">
        <div class="topbar">
          <button class="icon-btn menu-btn" data-action="toggle-nav" aria-label="Open navigation">&#9776;</button>
          <div class="search-wrap">
            <input id="global-search" placeholder="Search orders, customers, products..." autocomplete="off">
            <div id="search-results" class="search-results"></div>
          </div>
          <button class="btn good" data-action="open-order">+ New Order</button>
        </div>
        <div class="content">${renderView()}</div>
      </main>
    </div>
  `;
}

function renderView() {
  if (!state.data) return "";
  state.view = normalizeView(state.view);
  if (state.view === "orders") return renderOrders();
  if (state.view === "customers") return renderCustomers();
  if (state.view === "cargo") return renderCargo();
  if (state.view === "inventory") return renderInventory();
  if (state.view === "finance") return renderFinanceReports();
  if (state.view === "settings") return renderSettings();
  return renderDashboard();
}

function renderDashboard() {
  const report = state.data.reports;
  const selectedDate = selectedReportDate();
  const recentOrders = [...state.data.orders]
  .sort((a, b) => new Date(b.createdAt || b.orderDate || 0) - new Date(a.createdAt || a.orderDate || 0))
  .slice(0, 8);
  const pendingPayments = activeOrders().filter((order) => order.balance > 0).slice(0, 6);
  const lowStock = report.lowStock || [];
  const statusEntries = Object.entries(report.statusCounts || {}).filter(([, count]) => count > 0);
  const statusMax = Math.max(...statusEntries.map(([, count]) => count), 1);
  const statusBars = statusEntries
    .map(([status, count]) => `<div class="chart-row"><span>${esc(status)}</span><div class="bar"><span style="width:${Math.max(8, (count / statusMax) * 100)}%"></span></div><strong>${count}</strong></div>`)
    .join("");
  const lowStockRows = lowStock.slice(0, 6)
    .map((item) => `<div class="alert warn-edge"><div><strong>${esc(item.productName)}</strong><div class="muted tiny">${esc(item.label)} · Available ${item.available}</div></div><span class="badge warn">${item.available}</span></div>`)
    .join("");
  const pendingRows = pendingPayments
    .map((order) => {
      const customer = customerById(order.customerId);
      return `<div class="alert"><div><strong>${esc(order.orderNumber)}</strong><div class="muted tiny">${esc(customer?.name || "")} · Paid ${money(order.paid)}</div></div><strong>${money(order.balance)}</strong></div>`;
    })
    .join("");

  return `
    <section class="page-hero">
      <div>
        <p class="eyebrow">Store Overview</p>
        <h2>TOFU'S CLOSET</h2>
      </div>
      <div class="date-nav" aria-label="Report date">
        <button type="button" data-action="shift-dashboard-date" data-delta="-1" aria-label="Previous day">&lt;</button>
        <input
          id="dashboard-date-picker"
          class="date-label"
          type="date"
          value="${esc(selectedDate)}"
          aria-label="Select report date"
        >
        <button type="button" data-action="shift-dashboard-date" data-delta="1" aria-label="Next day">&gt;</button>
      </div>
    </section>
    <section class="metrics-row">
      ${metric("Today's Sales", money(report.netSales), `${report.orders} transaction${report.orders === 1 ? "" : "s"}`, "sales")}
      ${metric("Gross Profit", money(report.profitBeforeExpenses ?? report.netProfit), "Before expenses", "profit")}
      ${metric("Pending / Remaining", money(report.remainingBalance), `${report.alerts?.unpaidBalances || 0} unpaid balance${(report.alerts?.unpaidBalances || 0) === 1 ? "" : "s"}`, "pending")}
      ${metric("Orders", report.orders, `${report.preorder?.waiting || 0} preorder waiting`, "bag")}
    </section>
    <section class="dashboard-grid">
      <div class="panel">
        <div class="panel-head">
          <h3>Recent Orders</h3>
          <button class="btn small secondary" data-action="nav" data-view="orders">View all</button>
        </div>
        ${ordersTable(recentOrders, true)}
      </div>
      <div class="panel">
        <div class="panel-head">
          <h3>Order Status</h3>
          <button class="btn small secondary" data-action="nav" data-view="orders">Orders</button>
        </div>
        <div class="chart-bars">${statusBars || `<div class="empty-state">No orders for this date.</div>`}</div>
      </div>
    </section>
    <section class="dashboard-grid">
      <div class="panel">
        <div class="panel-head">
          <h3>Sales Overview</h3>
          <button class="btn small secondary" data-action="nav" data-view="finance">Finance</button>
        </div>
        <div class="status-grid">
          <div class="status-cell"><strong>${money(report.grossSales)}</strong><span class="muted tiny">Gross sales</span></div>
          <div class="status-cell"><strong>${money(report.paidAmount)}</strong><span class="muted tiny">Collected</span></div>
          <div class="status-cell"><strong>${money(report.refunds)}</strong><span class="muted tiny">Refunds</span></div>
          <div class="status-cell"><strong>${money(report.netProfit)}</strong><span class="muted tiny">Net profit</span></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h3>Pending Payments</h3>
          <button class="btn small secondary" data-action="nav" data-view="orders">Review</button>
        </div>
        <div class="alert-list">${pendingRows || `<div class="empty-state">No remaining balances.</div>`}</div>
      </div>
    </section>
    <section class="grid cols-2">
      <div class="panel">
        <div class="panel-head">
          <h3>Low Stock / Inventory Alerts</h3>
          <button class="btn small secondary" data-action="nav" data-view="inventory">Inventory</button>
        </div>
        <div class="alert-list">${lowStockRows || `<div class="empty-state">Stock levels look healthy.</div>`}</div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h3>Needs Attention</h3>
          <button class="btn small secondary" data-action="nav" data-view="orders">Open orders</button>
        </div>
        <div class="alert-list">
          ${(report.needsAttention || [])
            .map((item) => `<div class="alert ${item.count ? "warn-edge" : ""}"><div><strong>${item.count}</strong><div class="muted tiny">${esc(item.label)}</div></div><span class="badge ${item.count ? "warn" : "good"}">${item.count ? "Open" : "Clear"}</span></div>`)
            .join("") || `<div class="empty-state">No urgent work right now.</div>`}
        </div>
      </div>
    </section>
  `;
}

function metric(label, value, note, iconName = "sales") {
  return `
    <div class="metric">
      <div class="metric-top">
        <span class="label">${esc(label)}</span>
        <span class="metric-icon" aria-hidden="true">${icon(iconName)}</span>
      </div>
      <div>
        <strong>${esc(value)}</strong>
        <small>${esc(note)}</small>
      </div>
    </div>
  `;
}

function alertRow(label, count) {
  const badge = count > 0 ? "warn" : "good";
  return `<div class="alert"><div><strong>${esc(label)}</strong><div class="muted tiny">${count > 0 ? "Needs attention" : "Clear"}</div></div><span class="badge ${badge}">${count}</span></div>`;
}

function renderNotification(item) {
  return `
    <div class="alert">
      <div><strong>${esc(item.title)}</strong><div class="muted tiny">${esc(item.body)}</div></div>
      <button class="btn small secondary" data-action="dismiss-notification" data-id="${esc(item.id)}">Dismiss</button>
    </div>
  `;
}

function productStockBucket(product) {
  const stock = product.variants.reduce((sum, variant) => sum + available(variant), 0);
  const threshold = product.variants.reduce(
    (min, variant) => Math.min(min, variant.lowStockThreshold ?? state.data.settings.lowStockThreshold),
    Infinity
  );
  if (stock <= 0 && product.productType !== "Preorder") return "out";
  if (stock > 0 && stock <= threshold) return "low";
  if (stock > 0) return "instock";
  return product.productType === "Preorder" ? "all" : "out";
}

function matchesInventoryQuery(product, query) {
  if (!query) return true;
  const haystack = `${product.name} ${product.sku} ${product.category} ${product.productType}`.toLowerCase();
  return haystack.includes(query);
}

function filteredInventoryProducts() {
  const filter = state.inventoryFilter || "all";
  const query = String(state.inventoryQuery || "").trim().toLowerCase();
  return state.data.products.filter((product) => {
    if (!matchesInventoryQuery(product, query)) return false;
    if (filter === "all") return true;
    const bucket = productStockBucket(product);
    if (filter === "instock") return bucket === "instock" || product.productType === "Preorder";
    if (filter === "low") return bucket === "low";
    if (filter === "out") return bucket === "out";
    return true;
  });
}

function renderProductCards() {
  return filteredInventoryProducts()
    .map((product) => {
      const stock = product.variants.reduce((sum, variant) => sum + available(variant), 0);
      const reserved = product.variants.reduce((sum, variant) => sum + Number(variant.reserved || 0), 0);
      const sold = product.variants.reduce((sum, variant) => sum + Number(variant.sold || 0), 0);
      const status = inventoryStatusLabel(product);
      return `
        <article class="product-card ${product.active === false ? "is-muted" : ""}">
          <img class="product-photo" src="${esc(imageFor(product))}" alt="">
          <div class="product-body">
            <div class="split">
              <div>
                <h3>${esc(product.name)}</h3>
                <div class="muted tiny">${esc(product.sku)} · ${esc(product.category)}</div>
                <div class="muted tiny">${product.variants.length} variant${product.variants.length === 1 ? "" : "s"}</div>
              </div>
              <span class="badge ${classForStatus(status)}">${esc(status)}</span>
            </div>
            <div class="product-meta compact-meta">
              <div><span>Selling Price</span><strong>${money(product.sellingPrice)}</strong></div>
              <div><span>Stock</span><strong>${stock}</strong></div>
              <div><span>Reserved</span><strong>${reserved}</strong></div>
              <div><span>Sold</span><strong>${sold}</strong></div>
            </div>
            <div class="split product-actions">
              <div class="toolbar">
                <button class="btn small secondary" data-action="open-product" data-id="${product.id}">Edit</button>
                <button class="btn small secondary" data-action="open-stock" data-id="${product.id}">Stock</button>
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join("") || `<div class="empty-state">No products match this filter.</div>`;
}

function renderProductCatalog() {
  const filter = state.inventoryFilter || "all";
  return `
    <div class="catalog-toolbar">
      <div class="filter-tabs">
        ${[
          ["all", "All"],
          ["instock", "In Stock"],
          ["low", "Low Stock"],
          ["out", "Out of Stock"]
        ].map(([id, label]) => `<button class="${filter === id ? "active" : ""}" data-action="inventory-filter" data-filter="${id}">${esc(label)}</button>`).join("")}
      </div>
      <input id="inventory-search" class="catalog-search" type="search" placeholder="Search products, SKU, or category" value="${esc(state.inventoryQuery || "")}">
    </div>
    <div class="product-grid" id="product-grid">${renderProductCards()}</div>
  `;
}

function renderCustomers() {
  const rows = state.data.customers
    .map((customer) => `
      <tr class="clickable-row" data-action="open-customer" data-id="${customer.id}">
        <td><strong>${esc(customer.name)}</strong><div class="muted tiny">${esc(customer.township || "")}</div></td>
        <td class="nowrap">${esc(customer.phone)}<div class="muted tiny">${esc(customer.contact || "")}</div></td>
        <td>${customer.stats.totalOrders}<div class="muted tiny">${customer.stats.activePreorders || 0} active preorder(s)</div></td>
        <td class="nowrap">${money(customer.stats.totalSpent)}</td>
        <td class="nowrap">${money(customer.stats.remainingBalance)}</td>
        <td class="nowrap">${esc(customer.stats.lastOrder || "N/A")}</td>
        <td class="nowrap"><button class="btn small secondary" data-action="open-customer" data-id="${customer.id}">View</button></td>
      </tr>
    `)
    .join("");
  return `
    <section class="section-head">
      <div>
        <p class="eyebrow">CRM</p>
        <h2>Customers</h2>
        <p>Customer profiles, order history, balances, and delivery preferences.</p>
      </div>
      <div class="toolbar">
        <button class="btn good" data-action="open-customer">+ New Customer</button>
        <button class="btn secondary" data-action="export" data-entity="customers">Export CSV</button>
      </div>
    </section>
    <div class="table-wrap">
      <table class="table-customers">
        <thead><tr><th>Customer</th><th>Phone</th><th>Orders</th><th>Total Spent</th><th>Balance</th><th>Last Order</th><th>Actions</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7"><div class="empty-state">No customers yet.</div></td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function orderMatchesType(order, filter = state.orderTypeFilter) {
  if (filter === "instock") return order.orderType === "Instock";
  if (filter === "preorder") return order.orderType === "Preorder";
  if (filter === "mixed") return order.orderType === "Mixed Order";
  return true;
}

function renderOrders() {
  const typeTabs = [
    ["all", "All"],
    ["instock", "Instock"],
    ["preorder", "Preorder"],
    ["mixed", "Mixed"]
  ];
  const selectedType = ["all", "instock", "preorder", "mixed"].includes(state.orderTypeFilter) ? state.orderTypeFilter : "all";
  const filteredOrders = state.data.orders
  .filter((order) => orderMatchesType(order, selectedType))
  .sort((a, b) => {
    const aNum = Number(String(a.orderNumber).replace(/\D/g, ""));
    const bNum = Number(String(b.orderNumber).replace(/\D/g, ""));
    return bNum - aNum;
  });
  const showPreorderTracker = selectedType !== "instock";
  return `
    <section class="section-head">
      <div>
        <p class="eyebrow">Sales</p>
        <h2>Orders</h2>
        <p>Manage all customer orders</p>
      </div>
      <div class="toolbar">
        <button class="btn good" data-action="open-order">+ New Order</button>
        <button class="btn secondary" data-action="export" data-entity="orders">Export CSV</button>
      </div>
    </section>
    <div class="filter-tabs">
      ${typeTabs.map(([id, label]) => `<button class="${selectedType === id ? "active" : ""}" data-action="order-type-filter" data-filter="${id}">${esc(label)}</button>`).join("")}
    </div>
    ${ordersTable(filteredOrders)}
    ${showPreorderTracker ? renderPreorderTracker(selectedType) : ""}
  `;
}

function ordersTable(orders, compact = false) {
  if (!orders.length) return `<div class="empty-state">No orders yet.</div>`;

    if (compact) {
    return `
      <div class="recent-orders-list">
        ${orders.map((order) => {
          const customer = customerById(order.customerId);
          const overdue = isOverdue(order);

          return `
            <article class="recent-order-item">

              <div class="recent-order-main">
                <div class="recent-order-heading">
                  <strong>${esc(order.orderNumber)}</strong>

                  <span class="badge ${classForStatus(order.status)}">
                    ${esc(order.status)}
                  </span>
                </div>

                <div class="recent-order-customer">
                  ${esc(customer?.name || "Unknown")}
                </div>

                <div class="muted tiny">
                  ${esc(displayDateOnly(order.orderDate))}
                  ${overdue ? " · Delayed" : ""}
                </div>
              </div>

              <div class="recent-order-type">
                <span class="badge dark">
                  ${esc(order.orderType)}
                </span>
              </div>

              <div class="recent-order-money">
                <div>
                  <span>Total</span>
                  <strong>${money(order.total)}</strong>
                </div>

                <div>
                  <span>Remaining Balance</span>
                  <strong>${money(order.balance)}</strong>
                </div>
              </div>

            </article>
          `;
        }).join("")}
      </div>
    `;
  }

    const rows = orders
    .map((order) => {
      const customer = customerById(order.customerId);
      const items = order.items || [];

      const firstItem = items[0];

      const itemPreview = firstItem
        ? `
          <div class="order-item-name">
            ${esc(firstItem.productName)}
          </div>
          <div class="muted tiny">
            ${esc(firstItem.color || "-")} / ${esc(firstItem.size || "-")}
            ×${firstItem.quantity}
          </div>
        `
        : `<div class="muted">No items</div>`;

      const extraItems =
        items.length > 1
          ? `<div class="muted tiny">+ ${items.length - 1} more item${items.length > 2 ? "s" : ""}</div>`
          : "";

      const overdue = isOverdue(order);

      const eta =
        order.expectedArrival ||
        items
          .map((item) => item.expectedArrival)
          .filter(Boolean)
          .sort()[0] ||
        "-";

      return `
        <tr>
          <!-- Order -->
          <td class="order-table-order">
            <strong>${esc(order.orderNumber)}</strong>
            <div class="muted tiny">${esc(displayDateOnly(order.orderDate))}</div>
            ${overdue ? `<span class="badge warn">Delayed</span>` : ""}
          </td>

          <!-- Customer -->
          <td class="order-table-customer">
            <strong>${esc(customer?.name || "Unknown")}</strong>
            <div class="muted tiny">${esc(customer?.phone || "")}</div>
          </td>

          <!-- Items -->
          <td class="order-table-items">
            ${itemPreview}
            ${extraItems}
          </td>

          <!-- Amount -->
          <td class="order-table-amount">
            <div class="amount-line">
              <span>Total</span>
              <strong>${money(order.total)}</strong>
            </div>
            <div class="amount-line">
              <span>Paid</span>
              <strong>${money(order.paid)}</strong>
            </div>
            <div class="amount-line">
              <span>Balance</span>
              <strong>${money(order.balance)}</strong>
            </div>
          </td>

          <!-- Status -->
          <td class="order-table-status">
            <span
              class="badge ${classForStatus(order.status)}"
              title="${esc(order.status)}"
            >
              ${esc(order.status)}
            </span>

            <div class="muted tiny">
              ${esc(order.paymentStatus || "")}
            </div>
          </td>

          <!-- Delivery -->
            <td class="order-table-delivery">
              <strong>${esc(order.deliveryMethod || "-")}</strong>

              <div class="muted tiny">
                ${esc(order.deliveryStatus || "")}
              </div>
            </td>

            <!-- Actions -->
            <td class="order-table-actions">
              ${orderActionsCell(order)}
            </td>
        </tr>
      `;
    })
    .join("");

  const desktopTable = `
    <div class="table-wrap orders-desktop-table">
      <table class="table-orders">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Items</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Deli</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;

  if (compact) return desktopTable;

  const mobileCards = orders
    .map((order) => {
      const customer = customerById(order.customerId);

      const items = order.items || [];

      const itemPreview = items
        .slice(0, 2)
        .map(
          (item) =>
            `${esc(item.productName)} ${esc(item.color || "")}/${esc(item.size || "")} ×${item.quantity}`
        )
        .join("<br>");

      const extraItems =
        items.length > 2
          ? `<div class="muted tiny">+${items.length - 2} more item(s)</div>`
          : "";

      const cargoBatches = [
        ...new Set(items.map((item) => item.batchId).filter(Boolean))
      ].join(", ") || "-";

      const eta =
        order.expectedArrival ||
        items
          .map((item) => item.expectedArrival)
          .filter(Boolean)
          .sort()[0] ||
        "-";

      const overdue = isOverdue(order);

      return `
        <article class="order-mobile-card">

          <div class="order-mobile-head">
            <div>
              <strong class="order-mobile-number">
                ${esc(order.orderNumber)}
              </strong>
              <div class="muted tiny">
                ${esc(displayDateOnly(order.orderDate))}
              </div>
            </div>

            <div class="order-mobile-status">
              <span class="badge ${classForStatus(order.status)}">
                ${esc(order.status)}
              </span>

              ${
                overdue
                  ? `<span class="badge warn">Delayed</span>`
                  : ""
              }
            </div>
          </div>

          <div class="order-mobile-section">
            <div class="order-mobile-label">Customer</div>

            <div class="order-mobile-customer">
              <strong>${esc(customer?.name || "Unknown")}</strong>
              <span class="muted tiny">
                ${esc(customer?.phone || "")}
              </span>
            </div>
          </div>

          <div class="order-mobile-section">
            <div class="order-mobile-label">Items</div>

            <div class="order-mobile-items">
              ${itemPreview}
              ${extraItems}
            </div>
          </div>

          <div class="order-mobile-section order-mobile-money">

            <div class="order-mobile-money-row">
              <span>${esc(order.orderType)}</span>
              <strong>${money(order.total)}</strong>
            </div>

            <div class="order-mobile-money-row">
              <span>Paid</span>
              <strong>${money(order.paid)}</strong>
            </div>

            <div class="order-mobile-money-row">
              <span>Balance</span>
              <strong>${money(order.balance)}</strong>
            </div>

          </div>

          <div class="order-mobile-section">
            <div class="order-mobile-label">Delivery</div>

            <div class="order-mobile-delivery">
              <div>
                <strong>${esc(order.deliveryMethod || "-")}</strong>
                <span class="muted tiny">
                  ${esc(order.deliveryStatus || "")}
                </span>
              </div>

              <div class="order-mobile-delivery-meta">
                <span>
                  Cargo
                  <strong>${esc(cargoBatches)}</strong>
                </span>

                <span>
                  ETA
                  <strong>${esc(eta)}</strong>
                </span>
              </div>
            </div>
          </div>

          <div class="order-mobile-actions">
            ${orderActionsCell(order)}
          </div>

        </article>
      `;
    })
    .join("");

  return `
    ${desktopTable}

    <div class="orders-mobile-list">
      ${mobileCards}
    </div>
  `;
}
function orderStatusControls(order) {
  const settings = state.data.settings;
  return `
    <div class="stack">
      <label>Order status
        <select class="compact-select" data-action="change-order-status" data-kind="status" data-id="${order.id}">
          ${settings.orderStatuses.map((status) => `<option ${status === order.status ? "selected" : ""}>${esc(status)}</option>`).join("")}
        </select>
      </label>
      ${order.orderType === "Instock" ? "" : `<label>Preorder status
        <select class="compact-select" data-action="change-order-status" data-kind="preorderStatus" data-id="${order.id}">
          ${settings.preorderStatuses.map((status) => `<option ${status === order.preorderStatus ? "selected" : ""}>${esc(status)}</option>`).join("")}
        </select>
      </label>`}
      <label>Packing
        <select class="compact-select" data-action="change-order-status" data-kind="packingStatus" data-id="${order.id}">
          ${settings.packingStatuses.map((status) => `<option ${status === order.packingStatus ? "selected" : ""}>${esc(status)}</option>`).join("")}
        </select>
      </label>
      <label>Delivery
        <select class="compact-select" data-action="change-order-status" data-kind="deliveryStatus" data-id="${order.id}">
          ${settings.deliveryStatuses.map((status) => `<option ${status === order.deliveryStatus ? "selected" : ""}>${esc(status)}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}

function renderInventory() {
  const preorderStats = state.data.products
    .filter((product) => product.productType !== "In Stock")
    .map((product) => {
      const lines = activeOrders()
        .filter((order) => ["Preorder", "Mixed Order"].includes(order.orderType))
        .flatMap((order) => order.items || [])
        .filter((item) => item.productId === product.id);
      const qty = (predicate) => lines.filter(predicate).reduce((sum, item) => sum + item.quantity, 0);
      return {
        product,
        ordered: lines.reduce((sum, item) => sum + item.quantity, 0),
        supplierOrdered: qty((item) => ["Supplier Ordered", "Supplier Shipped"].includes(item.arrivalStatus) || ["Supplier Ordered", "Ordered"].includes(item.supplierStatus)),
        inTransit: qty((item) => ["Cargo", "In Transit", "In Transit to Yangon", "China -> Myanmar Cargo"].includes(item.arrivalStatus) || ["Cargo", "In Transit", "In Transit to Yangon"].includes(item.cargoStatus)),
        arrived: qty((item) => ["Arrived", "Checking", "Ready for Customer"].includes(item.arrivalStatus)),
        delivered: qty((item) => item.arrivalStatus === "Delivered")
      };
    })
    .filter((row) => row.ordered > 0);
  const preorderRows = preorderStats
    .map((row) => `
      <tr>
        <td><strong>${esc(row.product.name)}</strong><div class="muted tiny">${esc(row.product.sku)}</div></td>
        <td>${row.ordered}</td>
        <td>${row.supplierOrdered}</td>
        <td>${row.inTransit}</td>
        <td>${row.arrived}</td>
        <td>${row.delivered}</td>
      </tr>
    `)
    .join("");
  const variantRows = state.data.products
    .filter((product) => product.productType !== "Preorder")
    .flatMap((product) =>
      product.variants.map((variant) => `
        <tr>
          <td><strong>${esc(product.name)}</strong><div class="muted tiny">${esc(product.sku)}</div></td>
          <td>${esc(variant.color)} / ${esc(variant.size)}</td>
          <td>${variant.stockOnHand}</td>
          <td>${variant.reserved}</td>
          <td><span class="badge ${available(variant) <= variant.lowStockThreshold ? "warn" : "good"}">${available(variant)}</span></td>
          <td>${variant.sold}</td>
          <td>${variant.returned}</td>
          <td><button class="btn small secondary" data-action="open-stock" data-id="${product.id}" data-variant="${variant.id}">Adjust</button></td>
        </tr>
      `)
    )
    .join("");
  const history = state.data.inventoryTransactions
    .slice(0, 80)
    .map((tx) => `
      <tr>
        <td>${dateTime(tx.date)}</td>
        <td>${esc(tx.productName)}<div class="muted tiny">${esc(tx.variantLabel)}</div></td>
        <td><span class="badge">${esc(tx.action)}</span></td>
        <td>${tx.quantity}</td>
        <td>${esc(tx.relatedOrderId ? orderById(tx.relatedOrderId)?.orderNumber || tx.relatedOrderId : "")}</td>
        <td>${esc(tx.staffName)}</td>
        <td>${esc(tx.note)}</td>
      </tr>
    `)
    .join("");
  return `
    <section class="section-head">
      <div>
        <p class="eyebrow">Catalog</p>
        <h2>Inventory</h2>
        <p>Manage products, stock, variants, and selling prices.</p>
      </div>
      <div class="toolbar">
        ${requireOwner() ? `<button class="btn good" data-action="open-product">+ New Product</button>` : ""}
        <button class="btn secondary" data-action="export" data-entity="products">Export products</button>
        <button class="btn secondary" data-action="export" data-entity="inventory">Export inventory</button>
      </div>
    </section>
    <div class="filter-tabs">
      ${[
        ["products", "Products"],
        ["variants", "Variant Stock"],
        ["preorders", "Preorder Quantities"],
        ["history", "History"]
      ].map(([id, label]) => `<button class="${(state.inventoryPane || "products") === id ? "active" : ""}" data-action="inventory-pane" data-pane="${id}">${esc(label)}</button>`).join("")}
    </div>
    ${(state.inventoryPane || "products") === "products" ? renderProductCatalog() : ""}
    ${(state.inventoryPane || "products") === "preorders" ? `
    <div class="panel">
      <h3>Preorder Quantities</h3>
      <div class="table-wrap embedded">
        <table class="table-inventory">
          <thead><tr><th>Product</th><th>Ordered</th><th>Supplier Ordered</th><th>In Transit</th><th>Arrived</th><th>Delivered</th></tr></thead>
          <tbody>${preorderRows || `<tr><td colspan="6"><div class="empty-state">No active preorder quantities yet.</div></td></tr>`}</tbody>
        </table>
      </div>
    </div>` : ""}
    ${(state.inventoryPane || "products") === "variants" ? `
    <div class="panel">
      <h3>Variant Stock</h3>
      <div class="table-wrap embedded">
        <table class="table-inventory">
          <thead><tr><th>Product</th><th>Variant</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Sold</th><th>Returned</th><th>Actions</th></tr></thead>
          <tbody>${variantRows || `<tr><td colspan="8"><div class="empty-state">No instock variants yet.</div></td></tr>`}</tbody>
        </table>
      </div>
    </div>` : ""}
    ${(state.inventoryPane || "products") === "history" ? `
    <div class="panel">
      <h3>Inventory History</h3>
      <div class="table-wrap embedded">
        <table class="table-inventory">
          <thead><tr><th>Date</th><th>Product</th><th>Action</th><th>Qty</th><th>Order</th><th>Staff</th><th>Note</th></tr></thead>
          <tbody>${history || `<tr><td colspan="7"><div class="empty-state">No inventory history yet.</div></td></tr>`}</tbody>
        </table>
      </div>
    </div>` : ""}
  `;
}

function preorderBucket(order, item) {
  const status = item.arrivalStatus || order.preorderStatus || order.status;
  if (isOverdue(order)) return "overdue";
  if (["Waiting", "Pending Confirmation", "Deposit Paid", "Waiting for Supplier"].includes(status) || ["Pending Confirmation", "Deposit Paid", "Waiting for Supplier"].includes(order.preorderStatus)) return "waiting";
  if (["Ordered from Supplier", "Supplier Ordered", "Supplier Shipped"].includes(status) || ["Ordered from Supplier", "Supplier Shipped"].includes(order.preorderStatus)) return "supplier";
  if (["Cargo", "China -> Myanmar Cargo", "In Transit", "In Transit to Yangon"].includes(status) || order.batchId) return "cargo";
  if (["Arrived", "Checking", "Arrived in Myanmar"].includes(status) || order.status === "Partially Arrived") return "arrived";
  if (["Ready for Customer", "Ready for Delivery"].includes(status) || ["Ready for Customer", "Ready for Delivery"].includes(order.status)) return "ready";
  if (order.balance > 0 && ["Arrived in Myanmar", "Ready for Customer", "Customer Balance Pending"].includes(order.status)) return "balance";
  if (["Delivered", "Completed"].includes(order.status)) return "completed";
  return "all";
}

function renderPreorderTracker(typeFilter = "all") {
  const filters = [
    ["all", "All"],
    ["waiting", "Waiting"],
    ["supplier", "Supplier Ordered"],
    ["cargo", "Cargo"],
    ["arrived", "Arrived"],
    ["ready", "Ready"],
    ["balance", "Balance Pending"],
    ["overdue", "Overdue"],
    ["completed", "Completed"]
  ];
  const rows = state.data.orders
    .filter((order) => ["Preorder", "Mixed Order"].includes(order.orderType))
    .filter((order) => orderMatchesType(order, typeFilter))
    .flatMap((order) => {
      const customer = customerById(order.customerId);
      return order.items.map((item) => ({ order, item, customer, bucket: preorderBucket(order, item) }));
    })
    .filter((row) => state.preorderFilter === "all" || row.bucket === state.preorderFilter)
    .map(({ order, item, customer, bucket }) => `
      <tr>
        <td class="nowrap"><strong>${esc(order.orderNumber)}</strong><div class="muted tiny">${esc(displayDateOnly(order.orderDate))} · ${esc(customer?.name || "")}</div>${bucket === "overdue" ? `<span class="badge warn">Delayed</span>` : ""}</td>
        <td>${esc(item.productName)}<div class="muted tiny">${esc(item.size)} / ${esc(item.color)} · Qty ${item.quantity}</div></td>
        <td class="nowrap">
          <span class="badge ${classForStatus(item.arrivalStatus || order.preorderStatus || order.status)}">${esc(item.arrivalStatus || order.preorderStatus || order.status)}</span>
          <select class="compact-select" data-action="change-item-arrival" data-order-id="${order.id}" data-item-id="${item.id}">
            ${state.data.settings.itemPreorderStatuses.map((status) => `<option ${status === item.arrivalStatus ? "selected" : ""}>${esc(status)}</option>`).join("")}
          </select>
        </td>
        <td class="nowrap">${esc(order.batchId || item.batchId || "Unassigned")}</td>
        <td class="nowrap">${money(item.quantity * item.unitPrice - item.discount)}<div class="muted tiny">Paid ${money(order.paid)} · Bal ${money(order.balance)}</div></td>
        <td class="nowrap"><button class="btn small secondary" data-action="open-order-details" data-id="${order.id}">Details</button></td>
      </tr>
    `)
    .join("");
  return `
    <section class="subsection-head">
      <div><h3>Preorder Tracking</h3><p>Track preorder and mixed-order items from deposit through cargo, arrival, balance collection, and delivery.</p></div>
      <div class="toolbar">
        <button class="btn good" data-action="open-order">New order</button>
        <button class="btn secondary" data-action="export" data-entity="orders">Export</button>
      </div>
    </section>
    <div class="filter-tabs">
      ${filters.map(([id, label]) => `<button class="${state.preorderFilter === id ? "active" : ""}" data-action="preorder-filter" data-filter="${id}">${esc(label)}</button>`).join("")}
    </div>
    <div class="table-wrap">
      <table class="table-preorder">
        <thead><tr><th>Order</th><th>Product</th><th>Status</th><th>Cargo</th><th>Total / Paid</th><th>Actions</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6">No preorder items for this filter.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderPreorders() {
  return renderPreorderTracker("all");
}

function renderCargo() {
  const batchProducts = (batch) => {
    const ids = new Set(batch.productIds || []);
    for (const orderId of batch.orderIds || []) {
      const order = orderById(orderId);
      for (const item of order?.items || []) ids.add(item.productId);
    }
    return [...ids].map((id) => productById(id)?.name).filter(Boolean).join(", ");
  };
  const batchRows = state.data.cargoBatches
    .map((batch) => `
      <tr>
        <td><strong>${esc(batch.batchId)}</strong><div class="muted tiny">${esc(batch.date)}</div></td>
        <td class="cell-clip" title="${esc(batch.route)}">${esc(batch.route)}</td>
        <td class="nowrap">
          <div>China → Muse ${money(batch.chinaMuseCargoFee || 0)}</div>
          <div>Muse → Yangon ${money(batch.museYangonCargoFee || 0)}</div>
          <div class="muted tiny">Total ${money(batch.cargoFee || 0)} · Other ${money(batch.otherExpenses || 0)}</div>
        </td>
        <td class="nowrap">
          <span class="badge ${cargoBadgeClass(batch.status)}">${esc(batch.status)}</span>
        </td>
        <td class="nowrap">${esc(batch.arrivalDate || "")}</td>
        <td class="cell-clip" title="${esc((batch.orderIds || []).map((id) => orderById(id)?.orderNumber || id).join(", ") || "-")}">${(batch.orderIds || []).map((id) => esc(orderById(id)?.orderNumber || id)).join(", ") || "-"}</td>
        <td class="cell-clip" title="${esc(batchProducts(batch) || "-")}">${esc(batchProducts(batch) || "-")}</td>
        <td class="nowrap">
          <select class="compact-select" data-action="change-batch-status" data-id="${batch.id}">
            ${state.data.settings.cargoStatuses.map((status) => `<option ${status === batch.status ? "selected" : ""}>${esc(status)}</option>`).join("")}
          </select>
          <button class="btn small secondary" data-action="edit-cargo-orders" data-id="${batch.id}">Edit Orders</button>
        </td>
      </tr>
    `)
    .join("");
  return `
    <section class="section-head">
      <div>
        <p class="eyebrow">Logistics</p>
        <h2>Cargo</h2>
        <p>Track preorder cargo batches from pending through transit, arrival, and completion.</p>
      </div>
    </section>
    <section class="grid cols-2">
      <form class="panel grid" id="cargo-form">
        <h3>Create Cargo Batch</h3>
        <div class="form-section">
          <h4>Batch Information</h4>
          <div class="grid cols-2">
            <label>Batch ID<input name="batchId" placeholder="B004"></label>
            <label>Route<select name="route">${state.data.settings.cargoRoutes.map((route) => `<option>${esc(route)}</option>`).join("")}</select></label>
            <label>Arrival date<input name="arrivalDate" type="date"></label>
            <label>Status<select name="status">${state.data.settings.cargoStatuses.map((status) => `<option>${esc(status)}</option>`).join("")}</select></label>
          </div>
        </div>
        <div class="form-section">
          <h4>Financial</h4>
          <div class="grid cols-2">
            <label>China → Muse Cargo Fee
            <input name="chinaMuseCargoFee" type="number" min="0" value="0">
          </label>

          <label>Muse → Yangon Cargo Fee
            <input name="museYangonCargoFee" type="number" min="0" value="0">
          </label>
            <label>Other expenses<input name="otherExpenses" type="number" min="0" value="0"></label>
          </div>
        </div>
        <div class="form-section">
          <h4>Orders</h4>

          <label>
            Search Order / Customer
            <input
              type="text"
              id="cargo-create-order-search"
              placeholder="Search ORD-0001 or customer name..."
              autocomplete="off"
            >
          </label>

          <div
            class="check-list"
            id="cargo-create-order-list"
            style="max-height: 360px; overflow-y: auto; margin-top: 12px;"
          >
            <strong>Assign Orders</strong>

            ${activeOrders()
              .filter((order) => ["Preorder", "Mixed Order"].includes(order.orderType))
              .sort((a, b) => String(b.orderNumber || "").localeCompare(
                String(a.orderNumber || ""),
                undefined,
                { numeric: true }
              ))
              .map((order) => `
                <label
                  class="check-row cargo-create-order-option"
                  data-search="${esc(`${order.orderNumber} ${customerById(order.customerId)?.name || ""}`.toLowerCase())}"
                >
                  <input
                    type="checkbox"
                    name="orderIds"
                    value="${esc(order.id)}"
                  >
                  <span>
                    ${esc(order.orderNumber)}
                    · ${esc(customerById(order.customerId)?.name || "")}
                    · ${money(order.total)}
                  </span>
                </label>
              `)
              .join("") || `<div class="empty-state">No active preorder orders.</div>`}
          </div>
        </div>
        <div class="form-section">
          <h4>Notes</h4>
          <label>Notes<textarea name="notes"></textarea></label>
        </div>
        <button class="btn good" type="submit">Create batch</button>
      </form>
      <div class="panel">
        <h3>Ready For Delivery</h3>
        <div class="alert-list">
          ${activeOrders()
            .filter((order) => ["Arrived", "Arrived in Myanmar", "Ready for Customer", "Ready for Delivery"].includes(order.status) || order.items?.some((item) => ["Arrived", "Ready for Customer"].includes(item.arrivalStatus)))
            .map((order) => `<div class="alert"><div><strong>${esc(order.orderNumber)}</strong><div class="muted tiny">${esc(customerById(order.customerId)?.name || "")} · Remaining ${money(order.balance)}</div></div><button class="btn small secondary" data-action="open-order-details" data-id="${order.id}">Open</button></div>`)
            .join("") || `<div class="empty-state">No arrived orders waiting for action.</div>`}
        </div>
      </div>
    </section>
    <div class="panel">
      <h3>Cargo Batches</h3>
      <div class="table-wrap embedded">
        <table class="table-cargo">
          <thead><tr><th>Batch</th><th>Route</th><th>Fee</th><th>Status</th><th>Arrival</th><th>Orders</th><th>Products</th><th>Actions</th></tr></thead>
          <tbody>${batchRows || `<tr><td colspan="8"><div class="empty-state">No cargo batches yet.</div></td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderFinanceReports() {
  const tabs = [
    ["overview", "Overview"],
    ["sales", "Sales"],
    ["profit", "Profit"],
    ["expenses", "Expenses"],
    ["payments", "Payments"]
  ];
  const tab = ["overview", "sales", "profit", "expenses", "payments"].includes(state.financeTab)
    ? state.financeTab
    : "overview";
  return `
    <section class="section-head">
      <div>
        <p class="eyebrow">Business</p>
        <h2>Finance & Reports</h2>
        <p>Sales, profit, expenses, and payments with the same calculation logic.</p>
      </div>
      <div class="toolbar">
        <button class="btn secondary" data-action="export" data-entity="payments">Export payments</button>
        <button class="btn secondary" data-action="export" data-entity="expenses">Export expenses</button>
        <button class="btn secondary" data-action="export" data-entity="profit">Export profit</button>
      </div>
    </section>
    <div class="filter-tabs">
      ${tabs.map(([id, label]) => `<button class="${tab === id ? "active" : ""}" data-action="finance-tab" data-tab="${id}">${esc(label)}</button>`).join("")}
    </div>
    ${renderReportFilters()}
    ${tab === "overview" ? renderFinanceOverview() : ""}
    ${tab === "sales" ? renderFinanceSales() : ""}
    ${tab === "profit" ? renderFinanceProfit() : ""}
    ${tab === "expenses" ? renderFinanceExpenses() : ""}
    ${tab === "payments" ? renderFinancePayments() : ""}
  `;
}

function renderReportFilters() {
  const filters = state.reportFilters;
  const presetOptions = [
    ["today", "Today"],
    ["yesterday", "Yesterday"],
    ["this-week", "This Week"],
    ["last-week", "Last Week"],
    ["this-month", "This Month"],
    ["last-month", "Last Month"],
    ["this-year", "This Year"],
    ["last-year", "Last Year"],
    ["custom", "Custom Range"]
  ];
  const paymentStatuses = ["Unpaid", "Deposit Paid", "Partially Paid", "Fully Paid", "Partially Refunded", "Refunded"];
  const cargoOptions = state.data.cargoBatches.map((batch) => [batch.batchId, `${batch.batchId} · ${batch.route}`]);
  return `
    <form class="panel grid report-filters" id="report-filters">
      <div class="grid cols-4">
        <label>Date range
          <select name="preset" data-action="report-preset">
            ${presetOptions.map(([value, label]) => `<option value="${value}" ${filters.preset === value ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
        <label>From<input name="from" type="date" value="${esc(filters.from || "")}"></label>
        <label>To<input name="to" type="date" value="${esc(filters.to || "")}"></label>
        <label>Product<select name="productId">${selectOptions(state.data.products.map((product) => [product.id, `${product.name} (${product.sku})`]), filters.productId, "All products")}</select></label>
      </div>
      <div class="grid cols-4">
        <label>Category<select name="category">${selectOptions(state.data.settings.productCategories || [], filters.category, "All categories")}</select></label>
        <label>Customer<select name="customerId">${selectOptions(state.data.customers.map((customer) => [customer.id, `${customer.name} · ${customer.phone}`]), filters.customerId, "All customers")}</select></label>
        <label>Staff<select name="staffId">${selectOptions(state.data.staffSales.map((staff) => [staff.userId, staff.name]), filters.staffId, "All staff")}</select></label>
        <label>Order status<select name="orderStatus">${selectOptions(state.data.settings.orderStatuses || [], filters.orderStatus, "All statuses")}</select></label>
      </div>
      <div class="grid cols-4">
        <label>Payment status<select name="paymentStatus">${selectOptions(paymentStatuses, filters.paymentStatus, "All payment statuses")}</select></label>
        <label>Preorder / Instock<select name="orderType">${selectOptions(["Preorder", "Instock", "Mixed Order"], filters.orderType, "All order types")}</select></label>
        <label>Cargo batch<select name="cargoBatch">${selectOptions(cargoOptions, filters.cargoBatch, "All cargo batches")}</select></label>
        <label>Delivery method<select name="deliveryMethod">${selectOptions(state.data.settings.deliveryMethods || [], filters.deliveryMethod, "All delivery methods")}</select></label>
      </div>
      <div class="form-actions">
        <button class="btn secondary" type="button" data-action="clear-report-filters">Reset</button>
        <button class="btn good" type="submit">Generate report</button>
      </div>
    </form>
  `;
}

function renderFinanceOverview() {
  const report = state.data.reports;
  return `
    <section class="metrics-row">
      ${metric("Revenue", money(report.netSales), `${report.range.from} to ${report.range.to}`, "sales")}
      ${metric("Collected", money(state.reportGenerated ? (report.totalCollected ?? report.paidAmount) : 0), "Cash received", "bag")}
      ${metric("Remaining", money(report.remainingBalance), "Active balances", "pending")}
      ${metric("Net Profit", money(report.netProfit), "After costs & expenses", "profit")}
    </section>
    <section class="grid cols-2">
      <div class="panel">
        <h3>Profit Formula</h3>
        <div class="status-grid">
          <div class="status-cell"><strong>${money(report.netSales)}</strong><span class="muted tiny">Net sales</span></div>
          <div class="status-cell"><strong>-${money(report.productCost)}</strong><span class="muted tiny">Product cost</span></div>
          <div class="status-cell"><strong>-${money(report.cargoCost)}</strong><span class="muted tiny">Cargo cost</span></div>
          <div class="status-cell"><strong>-${money(report.expenses)}</strong><span class="muted tiny">Expenses</span></div>
        </div>
      </div>
      <div class="panel">
        <h3>Quick Snapshot</h3>
        <div class="status-grid">
          <div class="status-cell"><strong>${report.orders}</strong><span class="muted tiny">Orders</span></div>
          <div class="status-cell"><strong>${money(report.refunds)}</strong><span class="muted tiny">Refunds</span></div>
          <div class="status-cell"><strong>${money(report.discounts)}</strong><span class="muted tiny">Discounts</span></div>
          <div class="status-cell"><strong>${money(report.grossSales)}</strong><span class="muted tiny">Gross sales</span></div>
        </div>
      </div>
    </section>
  `;
}

function renderFinanceSales() {
  const report = state.data.reports;
  const staffRows = state.data.staffSales
    .map((row) => `
      <tr>
        <td>${esc(row.name)}<div class="muted tiny">${esc(row.role)}</div></td>
        <td>${row.ordersCreated}</td>
        <td>${money(row.totalSales)}</td>
        <td>${money(row.paidAmount)}</td>
        <td>${row.cancelledOrders}</td>
        <td>${row.returnedOrders}</td>
      </tr>
    `)
    .join("");
  const statusBars = Object.entries(report.statusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => {
      const max = Math.max(...Object.values(report.statusCounts), 1);
      return `<div class="chart-row"><span>${esc(status)}</span><div class="bar"><span style="width:${Math.max(6, (count / max) * 100)}%"></span></div><strong>${count}</strong></div>`;
    })
    .join("");
  return `
    <section class="metrics-row">
      ${metric("Orders", report.orders, `${report.range.from} to ${report.range.to}`, "bag")}
      ${metric("Gross Sales", money(report.grossSales), "Before discounts", "sales")}
      ${metric("Discounts", money(report.discounts), "Order discounts", "pending")}
      ${metric("Total Collected", money(report.totalCollected ?? report.paidAmount), "Cash received", "profit")}
    </section>
    <section class="grid cols-2">
      <div class="panel"><h3>Order Trend by Status</h3><div class="chart-bars">${statusBars || `<div class="empty-state">No orders in this range.</div>`}</div></div>
      <div class="panel">
        <h3>Staff / Admin Sales</h3>
        <div class="table-wrap embedded"><table class="table-finance"><thead><tr><th>Admin</th><th>Orders</th><th>Total sales</th><th>Paid</th><th>Cancelled</th><th>Returned</th></tr></thead><tbody>${staffRows || `<tr><td colspan="6"><div class="empty-state">No staff sales data.</div></td></tr>`}</tbody></table></div>
      </div>
    </section>
  `;
}

function renderFinanceProfit() {
  const report = state.data.reports;
  return `
    <section class="metrics-row">
      ${metric("Net Sales", money(report.netSales), "After discounts & refunds", "sales")}
      ${metric("Product Cost", money(report.productCost), "Historical cost snapshots", "inventory")}
      ${metric("Cargo Cost", money(report.cargoCost), "Allocated by order item", "cargo")}
      ${metric("Net Profit", money(report.netProfit), "After costs and expenses", "profit")}
    </section>
    <div class="panel">
      <h3>Auditable Profit</h3>
      <div class="table-wrap embedded"><table><tbody>
        <tr><th>Sales revenue</th><td>${money(report.salesRevenue ?? report.netSales)}</td></tr>
        <tr><th>Discounts</th><td>-${money(report.discounts)}</td></tr>
        <tr><th>Refunds</th><td>-${money(report.refunds)}</td></tr>
        <tr><th>Product cost</th><td>-${money(report.productCost)}</td></tr>
        <tr><th>Cargo cost</th><td>-${money(report.cargoCost)}</td></tr>
        <tr><th>Shop delivery cost</th><td>-${money(report.shopDeliveryCost)}</td></tr>
        <tr><th>Expenses</th><td>-${money(report.expenses)}</td></tr>
        <tr><th>Net profit</th><td><strong>${money(report.netProfit)}</strong></td></tr>
      </tbody></table></div>
    </div>
  `;
}

function renderFinanceExpenses() {
  const report = state.data.reports;
  const expenseRows = state.data.expenses
    .slice(0, 25)
    .map((expense) => `
      <tr><td>${esc(expense.date)}</td><td>${esc(expense.category)}</td><td>${money(expense.amount)}</td><td>${esc(expense.paymentMethod)}</td><td>${esc(expense.description)}<div class="muted tiny">${esc(expense.note || "")}</div></td><td>${esc(orderById(expense.orderId)?.orderNumber || expense.batchId || "-")}</td><td>${esc(expense.addedByName)}</td></tr>
    `)
    .join("");
  return `
    <section class="metrics-row">
      ${metric("Expenses", money(report.expenses), "In selected range", "pending")}
      ${metric("Refunds", money(report.refunds), "Refunded in range", "sales")}
      ${metric("Cargo Cost", money(report.cargoCost), "Logistics allocation", "cargo")}
      ${metric("Shop Delivery", money(report.shopDeliveryCost), "Delivery cost", "bag")}
    </section>
    <section class="grid cols-2">
      <form class="panel grid" id="expense-form">
        <h3>Add Expense</h3>
        <div class="grid cols-2">
          <label>Category<select name="category">${state.data.settings.expenseCategories.map((item) => `<option>${esc(item)}</option>`).join("")}</select></label>
          <label>Amount<input name="amount" type="number" min="1" required></label>
          <label>Date<input name="date" type="date" value="${today()}"></label>
          <label>Payment method<select name="paymentMethod">${state.data.settings.paymentMethods.map((item) => `<option>${esc(item)}</option>`).join("")}</select></label>
          <label>Related order<select name="orderId">${selectOptions(state.data.orders.map((order) => [order.id, order.orderNumber]), "", "No related order")}</select></label>
          <label>Related cargo batch<select name="batchId">${selectOptions(state.data.cargoBatches.map((batch) => [batch.batchId, `${batch.batchId} · ${batch.route}`]), "", "No related batch")}</select></label>
        </div>
        <label>Description<textarea name="description"></textarea></label>
        <label>Note<textarea name="note"></textarea></label>
        <button class="btn good" type="submit" ${requireOwner() ? "" : "disabled"}>Save expense</button>
      </form>
      <div class="panel">
        <h3>Expense History</h3>
        <div class="table-wrap embedded"><table class="table-finance"><thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Method</th><th>Description</th><th>Related</th><th>By</th></tr></thead><tbody>${expenseRows || `<tr><td colspan="7"><div class="empty-state">No expenses yet.</div></td></tr>`}</tbody></table></div>
      </div>
    </section>
  `;
}

function renderFinancePayments() {
  const paymentRows = state.data.payments
    .slice(0, 25)
    .map((payment) => `
      <tr><td>${esc(orderById(payment.orderId)?.orderNumber || "")}</td><td>${esc(customerById(payment.customerId)?.name || "")}</td><td>${money(payment.amount)}</td><td>${esc(payment.method)}</td><td>${esc(String(payment.paymentDate || "").slice(0, 10))}</td><td>${esc(payment.receivedByName)}</td></tr>
    `)
    .join("");
  const refundRows = state.data.refunds
    .slice(0, 20)
    .map((refund) => `
      <tr><td>${esc(orderById(refund.orderId)?.orderNumber || "")}</td><td>${money(refund.amount)}</td><td>${esc(refund.method)}</td><td>${esc(refund.reason)}</td><td>${esc(refund.processedByName)}</td></tr>
    `)
    .join("");
  return `
    <div class="panel">
      <h3>Payment History</h3>
      <div class="table-wrap embedded"><table class="table-finance"><thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Method</th><th>Date</th><th>Received by</th></tr></thead><tbody>${paymentRows || `<tr><td colspan="6"><div class="empty-state">No payments yet.</div></td></tr>`}</tbody></table></div>
    </div>
    <div class="panel">
      <h3>Refunds</h3>
      <div class="table-wrap embedded"><table class="table-finance"><thead><tr><th>Order</th><th>Amount</th><th>Method</th><th>Reason</th><th>By</th></tr></thead><tbody>${refundRows || `<tr><td colspan="5"><div class="empty-state">No refunds yet.</div></td></tr>`}</tbody></table></div>
    </div>
  `;
}

function renderFinance() {
  return renderFinanceOverview();
}

function renderReports() {
  return renderFinanceSales();
}

function renderAudit() {
  const rows = state.data.auditLogs
    .slice(0, 150)
    .map((log) => `
      <tr>
        <td>${dateTime(log.createdAt)}</td>
        <td>${esc(log.userName)}</td>
        <td><span class="badge">${esc(log.action)}</span></td>
        <td>${esc(log.entityType)}</td>
        <td>${esc(log.details)}</td>
      </tr>
    `)
    .join("");
  return `
    <section class="subsection-head">
      <div><h3>Audit Log</h3><p>Important business actions are retained and normal staff cannot delete them.</p></div>
    </section>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>User</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderSettings() {
  const settings = state.data.settings;
  return `
    <section class="section-head">
      <div>
        <p class="eyebrow">System</p>
        <h2>Settings</h2>
        <p>Configurable defaults for deposits, statuses, payment methods, delivery, and permissions.</p>
      </div>
    </section>
    <form class="panel grid" id="settings-form">
      <div class="grid cols-3">
        <label>Store name<input name="storeName" value="${esc(settings.storeName)}"></label>
        <label>Default deposit per item<input name="defaultDepositPerItem" type="number" value="${settings.defaultDepositPerItem}"></label>
        <label>Low stock threshold<input name="lowStockThreshold" type="number" value="${settings.lowStockThreshold}"></label>
        <label>Default waiting time<input name="defaultWaitingTime" value="${esc(settings.defaultWaitingTime)}"></label>
        <label>Gate rule<input name="gateRule" value="${esc(settings.gateRule)}"></label>
        <label>Contact info<input name="contactInfo" value="${esc(settings.contactInfo)}"></label>
      </div>
      <div class="grid cols-2">
        ${settingsTextarea("paymentMethods", "Payment methods", settings.paymentMethods)}
        ${settingsTextarea("deliveryMethods", "Delivery methods", settings.deliveryMethods)}
        ${settingsTextarea("orderStatuses", "Order statuses", settings.orderStatuses)}
        ${settingsTextarea("productCategories", "Product categories", settings.productCategories)}
        ${settingsTextarea("expenseCategories", "Expense categories", settings.expenseCategories)}
        ${settingsTextarea("customerTags", "Customer tags", settings.customerTags)}
      </div>
      <button class="btn good" type="submit">Save settings</button>
    </form>
    ${renderAudit()}
  `;
}

function settingsTextarea(name, label, values) {
  return `<label>${esc(label)}<textarea name="${name}">${esc((values || []).join("\n"))}</textarea></label>`;
}

function userName(id) {
  return state.data?.staffSales?.find((row) => row.userId === id)?.name || state.data?.auditLogs?.find((log) => log.userId === id)?.userName || "Staff";
}

function showModal(html) {
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><div class="modal-card" data-modal-card>${html}</div></div>`;
}

function showNarrowModal(html) {
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><div class="modal-card narrow" data-modal-card>${html}</div></div>`;
}

function closeModal() {
  modalRoot.innerHTML = "";
}

function openCargoOrdersModal(batchId) {
  const batch = state.data.cargoBatches.find((item) => item.id === batchId);
  if (!batch) return;

  const selectedIds = new Set(batch.orderIds || []);

  const orders = activeOrders()
  .filter((order) => ["Preorder", "Mixed Order"].includes(order.orderType))
  .sort((a, b) => String(b.orderNumber || "").localeCompare(
    String(a.orderNumber || ""),
    undefined,
    { numeric: true }
  ));

  showModal(`
    <div class="modal-head">
      <div>
        <h3>Edit Orders · ${esc(batch.batchId)}</h3>
        <p class="muted tiny">Select the orders assigned to this cargo batch.</p>
      </div>
      <button class="btn small secondary" type="button" data-action="close-modal">Close</button>
    </div>

    <form id="cargo-orders-form" class="grid">
      <input type="hidden" name="batchId" value="${esc(batch.id)}">

      <div class="form-section">
        <h4>Assign Orders</h4>

        <label>
          Search Order / Customer
          <input
            type="text"
            id="cargo-order-search"
            placeholder="Search ORD-0001 or customer name..."
            autocomplete="off"
          >
        </label>

        <div
          class="check-list"
          id="cargo-order-list"
          style="max-height: 360px; overflow-y: auto; margin-top: 12px;"
        >
          ${orders.map((order) => `
            <label
              class="check-row cargo-order-option"
              data-search="${esc(`${order.orderNumber} ${customerById(order.customerId)?.name || ""}`.toLowerCase())}"
            >
              <input
                type="checkbox"
                name="orderIds"
                value="${esc(order.id)}"
                ${selectedIds.has(order.id) ? "checked" : ""}
              >
              <span>
                ${esc(order.orderNumber)}
                · ${esc(customerById(order.customerId)?.name || "")}
                · ${money(order.total)}
              </span>
            </label>
          `).join("") || `<div class="empty-state">No active preorder orders.</div>`}
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn secondary" type="button" data-action="close-modal">Cancel</button>
        <button class="btn good" type="submit">Save Orders</button>
      </div>
    </form>
  `);

  setupCargoOrderSearch();
}

function setupCargoOrderSearch() {
  const input = document.getElementById("cargo-order-search");
  const list = document.getElementById("cargo-order-list");

  if (!input || !list) return;

  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();

    list.querySelectorAll(".cargo-order-option").forEach((row) => {
      row.style.display = !query || row.dataset.search.includes(query)
        ? ""
        : "none";
    });
  });
}

function openProfileModal() {
  const permissions = state.user?.permissions?.includes("*")
    ? "Full access"
    : (state.user?.permissions || []).join(", ") || "Standard access";
  showNarrowModal(`
    <div class="modal-head">
      <div><h3>Profile</h3><p class="muted tiny">${esc(state.user?.email || "")}</p></div>
      <button class="btn small secondary" data-action="close-modal">Close</button>
    </div>
    <div class="profile-summary">
      <span class="profile-avatar large">${esc(profileInitials(state.user?.name || ""))}</span>
      <div>
        <h3>${esc(state.user?.name || "Account")}</h3>
        <p class="muted">${esc(state.user?.role || "")}</p>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <tbody>
          <tr><th>Email</th><td>${esc(state.user?.email || "-")}</td></tr>
          <tr><th>Role</th><td>${esc(state.user?.role || "-")}</td></tr>
          <tr><th>Permissions</th><td>${esc(permissions)}</td></tr>
        </tbody>
      </table>
    </div>
  `);
}

function productOptions(selected = "") {
  return state.data.products
    .filter((product) => product.active !== false)
    .map((product) => `<option value="${product.id}" ${product.id === selected ? "selected" : ""}>${esc(product.name)} (${esc(product.sku)})</option>`)
    .join("");
}

function variantOptions(productId, selected = "") {
  const product = productById(productId) || state.data.products[0];
  return (product?.variants || [])
    .filter((variant) => variant.active !== false)
    .map((variant) => `<option value="${variant.id}" data-price="${product.discountPrice || product.sellingPrice}" ${variant.id === selected ? "selected" : ""}>${esc(variant.color)} / ${esc(variant.size)} · Avail ${available(variant)}</option>`)
    .join("");
}

function customerOptions(selected = "") {
  return `<option value="">New customer</option>${state.data.customers
    .map((customer) => `<option value="${customer.id}" ${customer.id === selected ? "selected" : ""}>${esc(customer.name)} · ${esc(customer.phone)}</option>`)
    .join("")}`;
}

function deliveryPaymentNote(method = "") {
  if (method === "Gate") return `${state.data.settings.gateRule || "All Prepaid"} is required for Gate delivery.`;
  if (method === "Royal Express") return "Royal Express requires prepaid balance because COD is not available.";
  return "";
}

function openProductModal(product = null) {
  const variantsText = product
    ? product.variants.map((variant) => `${variant.color}, ${variant.size}, ${variant.stockOnHand}, ${variant.lowStockThreshold}`).join("\n")
    : "Black, S, 5, 3\nBlack, M, 5, 3\nWhite, S, 5, 3";
  const sizes = product ? productSizes(product).map((size) => `<span class="chip">${esc(size)}</span>`).join("") : "";
  const colors = product ? productColors(product).map((color) => `<span class="chip">${esc(color)}</span>`).join("") : "";
  const costHistory = (product?.costHistory || [])
    .map((entry) => `<div class="timeline-item"><strong>${money(entry.cost)}</strong><div class="muted tiny">${esc(entry.date || "")} · ${esc(entry.note || "")}</div></div>`)
    .join("");
  showModal(`
    <div class="modal-head">
      <div><h3>${product ? "Product Details" : "New Product"}</h3><p class="muted tiny">Variant format: Color, Size, Stock, Low stock threshold</p></div>
      <button class="btn small secondary" data-action="close-modal">Close</button>
    </div>
    ${product ? `<section class="grid auto">
      <div class="panel"><h3>Sizes</h3><div class="row">${sizes || `<span class="chip">Free</span>`}</div></div>
      <div class="panel"><h3>Colors</h3><div class="row">${colors || `<span class="chip">Default</span>`}</div></div>
      <div class="panel"><h3>Waiting Time</h3><p class="muted">${esc(product.defaultWaitingTime || state.data.settings.defaultWaitingTime)}</p></div>
      <div class="panel"><h3>Cost History</h3><div class="timeline">${costHistory || `<div class="empty-state">No cost records.</div>`}</div></div>
    </section>` : ""}
    <form id="product-form" data-id="${product?.id || ""}" class="grid">
      <div class="grid cols-3">
        <label>Product name<input name="name" required value="${esc(product?.name || "")}"></label>
        <label>SKU<input name="sku" required value="${esc(product?.sku || "")}"></label>
        <label>Category<input name="category" value="${esc(product?.category || "Tops")}"></label>
        <label>Type<select name="productType">${["Preorder", "In Stock", "Both"].map((type) => `<option ${(product?.productType || "Preorder") === type ? "selected" : ""}>${type}</option>`).join("")}</select></label>
        <label>Selling price<input name="sellingPrice" type="number" min="0" required value="${product?.sellingPrice || ""}"></label>
        <label>Purchase cost<input name="purchaseCost" type="number" min="0" required value="${product?.purchaseCost || ""}"></label>
        <label>Discount price<input name="discountPrice" type="number" min="0" value="${product?.discountPrice || 0}"></label>
        <label>Default cargo cost<input name="defaultCargoCost" type="number" min="0" value="${product?.defaultCargoCost || 0}"></label>
        <label>Estimated product cost<input name="estimatedProductCost" type="number" min="0" value="${product?.estimatedProductCost || product?.purchaseCost || 0}"></label>
        <label>Default waiting time<input name="defaultWaitingTime" value="${esc(product?.defaultWaitingTime || state.data.settings.defaultWaitingTime)}"></label>
        <label>Status<select name="active">${[[true, "Active"], [false, "Inactive"]].map(([value, label]) => `<option value="${value}" ${(product?.active !== false) === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      </div>
      <label>Customer-facing description<textarea name="customerDescription">${esc(product?.customerDescription || product?.description || "")}</textarea></label>
      <label>Description<textarea name="description">${esc(product?.description || "")}</textarea></label>
      <div class="grid cols-2">
        <label>Image URL<input name="image" value="${esc(product?.images?.[0] || "")}"></label>
        <label>Upload image<input name="imageFile" type="file" accept="image/*"></label>
      </div>
      <label>Variants<textarea name="variants" required>${esc(variantsText)}</textarea></label>
      <div class="grid cols-2">
        <label>Internal notes<textarea name="internalNotes">${esc(product?.internalNotes || product?.notes || "")}</textarea></label>
        <label>Notes<textarea name="notes">${esc(product?.notes || "")}</textarea></label>
      </div>
      <div class="form-actions">
        ${product && requireOwner() ? `<button class="btn danger" type="button" data-action="delete-product" data-id="${product.id}">Soft delete</button>` : ""}
        <button class="btn secondary" type="button" data-action="close-modal">Cancel</button>
        <button class="btn good" type="submit">Save product</button>
      </div>
    </form>
  `);
}

function openStockModal(product, selectedVariant = "") {
  showNarrowModal(`
    <div class="modal-head">
      <div><h3>Adjust Stock</h3><p class="muted tiny">${esc(product.name)}</p></div>
      <button class="btn small secondary" data-action="close-modal">Close</button>
    </div>
    <form id="stock-form" data-id="${product.id}" class="grid">
      <label>Variant<select name="variantId">${product.variants.map((variant) => `<option value="${variant.id}" ${variant.id === selectedVariant ? "selected" : ""}>${esc(variant.color)} / ${esc(variant.size)} · On hand ${variant.stockOnHand}</option>`).join("")}</select></label>
      <div class="grid cols-2">
        <label>Quantity change<input name="quantity" type="number" required placeholder="Use -1 for stock out"></label>
        <label>Action<select name="action"><option>Stock In</option><option>Stock Out</option><option>Adjustment</option><option>Return</option><option>Damaged</option></select></label>
      </div>
      <label>Note<textarea name="note"></textarea></label>
      <div class="form-actions">
        <button class="btn secondary" type="button" data-action="close-modal">Cancel</button>
        <button class="btn good" type="submit">Save stock change</button>
      </div>
    </form>
  `);
}

function openCustomerModal(customer = null) {
  const orders = customer ? state.data.orders.filter((order) => order.customerId === customer.id).slice(0, 8) : [];
  const history = orders
    .map((order) => `
      <tr>
        <td>${esc(order.orderNumber)}<div class="muted tiny">${esc(displayDateOnly(order.orderDate))}</div></td>
        <td>${esc(order.orderType)}<div class="muted tiny">${esc(order.status)}</div></td>
        <td>${money(order.total)}<div class="muted tiny">Remaining ${money(order.balance)}</div></td>
        <td><button class="btn small secondary" type="button" data-action="open-order-details" data-id="${order.id}">Open</button></td>
      </tr>
    `)
    .join("");
  showModal(`
    <div class="modal-head">
      <h3>${customer ? "Customer Details" : "New Customer"}</h3>
      <button class="btn small secondary" data-action="close-modal">Close</button>
    </div>
    ${customer ? `<div class="status-grid modal-summary">
      <div class="status-cell"><strong>${customer.stats.totalOrders}</strong><span class="muted tiny">Total orders</span></div>
      <div class="status-cell"><strong>${money(customer.stats.totalSpent)}</strong><span class="muted tiny">Total spent</span></div>
      <div class="status-cell"><strong>${money(customer.stats.remainingBalance)}</strong><span class="muted tiny">Remaining balance</span></div>
      <div class="status-cell"><strong>${customer.stats.activePreorders || 0}</strong><span class="muted tiny">Active preorders</span></div>
    </div>` : ""}
    <form id="customer-form" data-id="${customer?.id || ""}" class="grid">
      <div class="grid cols-2">
        <label>Name<input name="name" required value="${esc(customer?.name || "")}"></label>
        <label>Phone<input name="phone" required value="${esc(customer?.phone || "")}"></label>
        <label>Messenger/Viber<input name="contact" value="${esc(customer?.contact || "")}"></label>
        <label>Township<input name="township" value="${esc(customer?.township || "")}"></label>
      </div>
      <label>Address<textarea name="address">${esc(customer?.address || "")}</textarea></label>
      <label>Delivery method<select name="deliveryMethod">${state.data.settings.deliveryMethods.map((method) => `<option ${customer?.deliveryMethod === method ? "selected" : ""}>${esc(method)}</option>`).join("")}</select></label>
      <label>Tags<input name="tags" value="${esc((customer?.tags || ["New Customer"]).join(", "))}"></label>
      <label>Customer-visible notes<textarea name="customerVisibleNotes">${esc(customer?.customerVisibleNotes || "")}</textarea></label>
      <label>Internal staff notes<textarea name="internalNotes">${esc(customer?.internalNotes || customer?.notes || "")}</textarea></label>
      <label>Notes<textarea name="notes">${esc(customer?.notes || "")}</textarea></label>
      <div class="form-actions">
        <button class="btn secondary" type="button" data-action="close-modal">Cancel</button>
        <button class="btn good" type="submit">Save customer</button>
      </div>
    </form>
    ${customer ? `<div class="panel embedded-panel">
      <h3>Order History</h3>
      <div class="table-wrap embedded"><table><thead><tr><th>Order</th><th>Type / Status</th><th>Total</th><th>Actions</th></tr></thead><tbody>${history || `<tr><td colspan="4"><div class="empty-state">No orders yet.</div></td></tr>`}</tbody></table></div>
    </div>` : ""}
  `);
}

function lineItemRow(item = null, orderType = "") {
  const selectedProduct = item?.productId || "";
  const selectedVariant = item?.variantId || "";
  return `
    <div class="line-item" data-item-id="${esc(item?.id || "")}">
      <label>Product
        <input
          class="line-product-name"
          name="productName"
          value="${esc(item?.productName || productById(selectedProduct)?.name || "")}"
          placeholder="Enter product name"
        >
        <input
          type="hidden"
          class="line-product-id"
          name="productId"
          value="${esc(item?.productId || selectedProduct || "")}"
        >
      </label>

      <label>Size
        <input
          class="line-size"
          name="size"
          value="${esc(item?.size || "")}"
          placeholder="Size"
        >
      </label>

      <label>Color
        <input
          class="line-color"
          name="color"
          value="${esc(item?.color || "")}"
          placeholder="Color"
        >
      </label>

      <label>Variant
        <input
          class="line-variant-name"
          name="variantName"
          value="${esc(item?.variantName || "")}"
          placeholder="Variant"
        >
      </label>

      <label>Qty
        <input class="line-qty" type="number" min="1" value="${item?.quantity || 1}">
      </label>

      <label>Price
        <input class="line-price" type="number" min="0" value="${item?.unitPrice || 0}">
      </label>

      <label>Discount
        <input class="line-discount" type="number" min="0" value="${item?.discount || 0}">
      </label>

      <button class="btn small danger" type="button" data-action="remove-line">X</button>
    </div>
  `;
}

function openOrderModal(order = null) {
  const items = order?.items?.length ? order.items : [null];
  const deliveryNote = deliveryPaymentNote(order?.deliveryMethod || "");
  showModal(`
    <div class="modal-head">
      <div><h3>${order ? `Edit ${esc(order.orderNumber)}` : "Create Order"}</h3><p class="muted tiny">Customer -> items -> payment -> cargo / arrival -> delivery.</p></div>
      <button class="btn small secondary" data-action="close-modal">Close</button>
    </div>
    ${order && supplierLocked(order) ? `<div class="alert"><div><strong>Preorder tracking already started</strong><div class="muted tiny">Changing product, size, color, or quantity after preorder progress begins will be recorded in the audit log.</div></div><span class="badge warn">Review</span></div>` : ""}
    <form id="order-form" data-id="${order?.id || ""}" class="grid">
      <div class="grid cols-3">
      <label>
        Order Date
        <input
          name="orderDate"
          type="date"
          value="${esc(order?.orderDate || today())}"
          required
        >
      </label>
        <label>Existing customer<select name="customerId">${customerOptions(order?.customerId || "")}</select></label>
        <label>New customer name<input name="customerName" placeholder="Required if no existing customer"></label>
        <label>New customer phone<input name="customerPhone" placeholder="Required if no existing customer"></label>
        <label>Order type<select name="orderType">${["Preorder", "Instock", "Mixed Order"].map((type) => `<option ${order?.orderType === type ? "selected" : ""}>${type}</option>`).join("")}</select></label>
        <label>Platform<select name="platform">
          ${["Facebook", "TikTok", "Telegram"].map((platform) => `<option value="${platform}" ${order?.platform === platform ? "selected" : ""}>${platform}</option>`).join("")}
        </select></label>
      </div>
      <label>Address<textarea name="address"></textarea></label>
      <div>
        <div class="split"><h3>Items</h3><button class="btn small secondary" type="button" data-action="add-line">Add item</button></div>
        <div class="line-items" id="line-items">${items.map((item) => lineItemRow(item, order?.orderType || "Preorder")).join("")}</div>
      </div>
      <div class="grid cols-3">
        <label>Status<select name="status">${state.data.settings.orderStatuses.map((status) => `<option ${order?.status === status ? "selected" : ""}>${esc(status)}</option>`).join("")}</select></label>
        <label>Preorder status<select name="preorderStatus">${state.data.settings.preorderStatuses.map((status) => `<option ${order?.preorderStatus === status ? "selected" : ""}>${esc(status)}</option>`).join("")}</select></label>
        <label>Waiting time<input name="waitingTime" value="${esc(order?.waitingTime || state.data.settings.defaultWaitingTime)}"></label>
        <label>Expected arrival<input name="expectedArrival" type="date" value="${esc(order?.expectedArrival || "")}"></label>
        <label>Required deposit<input name="requiredDeposit" type="number" min="0" value="${order?.requiredDeposit || state.data.settings.defaultDepositPerItem}"></label>
        <label>Delivery method<select name="deliveryMethod">${state.data.settings.deliveryMethods.map((method) => `<option ${order?.deliveryMethod === method ? "selected" : ""}>${esc(method)}</option>`).join("")}</select></label>
        <label>Delivery fee<input name="deliveryFee" type="number" min="0" value="${order?.deliveryFee || 0}"></label>
        <label>Tracking number<input name="trackingNumber" value="${esc(order?.trackingNumber || "")}"></label>
      </div>
      <div class="delivery-rule ${deliveryNote ? "is-visible" : ""}" id="delivery-rule-note">${esc(deliveryNote)}</div>
      ${order ? "" : `<div class="grid cols-2"><label>Initial deposit/payment<input name="initialPayment" type="number" min="0" value="${state.data.settings.defaultDepositPerItem}"></label><label>Payment method<select name="initialPaymentMethod">${state.data.settings.paymentMethods.map((method) => `<option>${esc(method)}</option>`).join("")}</select></label></div>`}
      <div class="grid cols-2">
        <label>Customer note<textarea name="customerNotes">${esc(order?.customerNotes || "")}</textarea></label>
        <label>Internal note<textarea name="internalNotes">${esc(order?.internalNotes || "")}</textarea></label>
      </div>
      <div class="form-actions">
        <button class="btn secondary" type="button" data-action="close-modal">Cancel</button>
        <button class="btn good" type="submit">Save order</button>
      </div>
    </form>
  `);
}

function openPaymentModal(order) {
  showNarrowModal(`
    <div class="modal-head">
      <div><h3>Record Payment</h3><p class="muted tiny">${esc(order.orderNumber)} · Remaining Balance ${money(order.balance)}</p></div>
      <button class="btn small secondary" data-action="close-modal">Close</button>
    </div>
    <form id="payment-form" data-id="${order.id}" class="grid">
      <label>Amount<input name="amount" type="number" min="1" max="${order.balance}" value="${order.balance}" required></label>
      <label>Method<select name="method">${state.data.settings.paymentMethods.map((method) => `<option>${esc(method)}</option>`).join("")}</select></label>
      <label>Note<textarea name="note"></textarea></label>
      <div class="form-actions">
        <button class="btn secondary" type="button" data-action="close-modal">Cancel</button>
        <button class="btn good" type="submit">Save payment</button>
      </div>
    </form>
  `);
}

function openCancelModal(order) {
  showNarrowModal(`
    <div class="modal-head">
      <div><h3>Cancel ${esc(order.orderNumber)}</h3><p class="muted tiny">Reserved stock will be restored and the order will remain in history.</p></div>
      <button class="btn small secondary" data-action="close-modal">Close</button>
    </div>
    <form id="cancel-form" data-id="${order.id}" class="grid">
      <label>Reason<textarea name="reason" required></textarea></label>
      <div class="form-actions">
        <button class="btn secondary" type="button" data-action="close-modal">Keep order</button>
        <button class="btn danger" type="submit">Confirm cancellation</button>
      </div>
    </form>
  `);
}

function openReturnModal(order) {
  const itemOptions = order.items.map((item) => `<option value="${item.id}">${esc(item.productName)} ${esc(item.color)}/${esc(item.size)} x${item.quantity}</option>`).join("");
  showNarrowModal(`
    <div class="modal-head">
      <div><h3>Return / Refund</h3><p class="muted tiny">${esc(order.orderNumber)} · Paid ${money(order.paid)}</p></div>
      <button class="btn small secondary" data-action="close-modal">Close</button>
    </div>
    <form id="return-form" data-id="${order.id}" class="grid">
      <label>Returned item<select name="orderItemId">${itemOptions}</select></label>
      <div class="grid cols-2">
        <label>Quantity<input name="quantity" type="number" min="1" value="1" required></label>
        <label>Condition<select name="condition"><option>Resellable</option><option>Damaged</option></select></label>
      </div>
      <label>Reason<textarea name="reason" required></textarea></label>
      <div class="grid cols-2">
        <label>Refund amount<input name="refundAmount" type="number" min="0" value="0"></label>
        <label>Refund method<select name="refundMethod">${state.data.settings.paymentMethods.map((method) => `<option>${esc(method)}</option>`).join("")}</select></label>
      </div>
      <div class="form-actions">
        <button class="btn secondary" type="button" data-action="close-modal">Cancel</button>
        <button class="btn good" type="submit">Process return</button>
      </div>
    </form>
  `);
}

function openOrderDetails(order) {
  const customer = customerById(order.customerId);
  const itemRows = order.items
    .map((item) => `
      <tr>
        <td>${esc(item.productName)}<div class="muted tiny">${esc(item.sku || "")}</div></td>
        <td>${esc(item.size)} / ${esc(item.color)}<div class="muted tiny">Qty ${item.quantity}</div></td>
        <td>${money(item.quantity * item.unitPrice - item.discount)}<div class="muted tiny">Discount ${money(item.discount)}</div></td>
        <td><span class="badge ${classForStatus(item.arrivalStatus)}">${esc(item.arrivalStatus || "Waiting")}</span><div class="muted tiny">Cargo ${esc(item.cargoStatus || "Waiting")}</div></td>
        <td>${esc(item.batchId || order.batchId || "-")}<div class="muted tiny">Expected ${esc(displayDateOnly(item.expectedArrival || order.expectedArrival || ""))}</div></td>
      </tr>
    `)
    .join("");
  const payments = orderPayments(order.id)
    .map((payment) => `<div class="timeline-item"><strong>${esc(String(payment.paymentDate || "").slice(0, 10))} · Payment · ${money(payment.amount)}</strong><div class="muted tiny">${esc(payment.method)} · ${esc(payment.note || "")}</div></div>`)
    .join("");
  const refunds = orderRefunds(order.id)
    .map((refund) => `<div class="timeline-item"><strong>${esc(refund.refundDate)} · Refund · ${money(refund.amount)}</strong><div class="muted tiny">${esc(refund.method)} · ${esc(refund.reason || "")}</div></div>`)
    .join("");
  const timeline = (order.timeline || [])
    .map((event) => `<div class="timeline-item"><strong>${dateTime(event.createdAt)} · ${esc(event.title)}</strong><div class="muted tiny">${esc(event.note || "")} ${event.userName ? `· ${esc(event.userName)}` : ""}</div></div>`)
    .join("");
  const deliveryNote = deliveryPaymentNote(order.deliveryMethod);
  showModal(`
    <div class="modal-head">
      <div><h3>${esc(order.orderNumber)}</h3><p class="muted tiny">${esc(order.orderType)} · ${esc(displayDateOnly(order.orderDate))} · Expected ${esc(displayDateOnly(order.expectedArrival || ""))}</p></div>
      <div class="toolbar">
        <button class="btn small secondary" data-action="open-order" data-id="${order.id}">Edit</button>
        <button class="btn small secondary" data-action="open-payment" data-id="${order.id}">Payment</button>
        <button class="btn small secondary" data-action="open-receipt" data-id="${order.id}">Receipt</button>
        <button class="btn small secondary" data-action="open-return" data-id="${order.id}">Return</button>
        <button class="btn small danger" data-action="open-cancel" data-id="${order.id}" ${order.status === "Cancelled" ? "disabled" : ""}>Cancel</button>
        <button class="btn small secondary" data-action="close-modal">Close</button>
      </div>
    </div>
    ${deliveryNote ? `<div class="delivery-rule is-visible">${esc(deliveryNote)}</div>` : ""}
    <section class="grid auto">
      ${metric("Total", money(order.total), "Order value")}
      ${metric("Deposit Paid", money(Math.min(order.paid, order.requiredDeposit || order.paid)), `Required ${money(order.requiredDeposit || 0)}`)}
      ${metric("Additional Payments", money(Math.max(order.paid - (order.requiredDeposit || 0), 0)), "After deposit")}
      ${metric("Remaining Balance", money(order.balance), esc(order.paymentStatus))}
      ${metric("Refund", money(order.refunded || 0), `Final paid ${money(order.finalPaidAmount || order.paid)}`)}
      ${metric("Net Profit", money(order.netProfit || 0), "After item costs")}
    </section>
    <section class="grid cols-2">
      <div class="panel">
        <h3>Customer</h3>
        <p><strong>${esc(customer?.name || "Unknown")}</strong></p>
        <p class="muted">${esc(customer?.phone || "")}<br>${esc(customer?.contact || "")}<br>${esc(customer?.address || "")}</p>
      </div>
      <div class="panel">
        <h3>Current Status</h3>
        <div class="row">
          <span class="badge ${classForStatus(order.status)}">${esc(order.status)}</span>
          <span class="badge ${classForStatus(order.paymentStatus)}">${esc(order.paymentStatus)}</span>
          <span class="badge">${esc(order.deliveryMethod || "")}</span>
          <span class="badge">${esc(order.deliveryStatus || "")}</span>
        </div>
        <div class="embedded-panel">${orderStatusControls(order)}</div>
        <p class="muted tiny">Waiting time ${esc(order.waitingTime || state.data.settings.defaultWaitingTime)}</p>
      </div>
    </section>
    <section class="grid cols-2">
      <div class="panel">
        <h3>Cargo</h3>
        <p><strong>${esc(order.batchId || "Unassigned")}</strong></p>
        <p class="muted">Expected arrival ${esc(displayDateOnly(order.expectedArrival || ""))}</p>
      </div>
      <div class="panel">
        <h3>Delivery</h3>
        <p><strong>${esc(order.deliveryMethod || "-")}</strong></p>
        <p class="muted">${esc(order.deliveryStatus || "-")}<br>Tracking ${esc(order.trackingNumber || "-")}</p>
      </div>
    </section>
    <div class="panel">
      <h3 style="margin-bottom: 10px;">Items</h3>
      <div class="table-wrap"><table class="table-order-items"><thead><tr><th>Product</th><th>Variant</th><th>Total</th><th>Status</th><th>Cargo / ETA</th></tr></thead><tbody>${itemRows}</tbody></table></div>
    </div>
    <section class="grid cols-2">
      <div class="panel"><h3>Payment History</h3><div class="timeline">${payments || `<div class="empty-state">No payments yet.</div>`}${refunds}</div></div>
      <div class="panel"><h3>Status / Workflow History</h3><div class="timeline">${timeline || `<div class="empty-state">No timeline entries yet.</div>`}</div></div>
    </section>
    <section class="grid cols-2">
      <div class="panel"><h3>Customer Notes</h3><p class="muted">${esc(order.customerNotes || "-")}</p></div>
      <div class="panel"><h3>Internal Notes</h3><p class="muted">${esc(order.internalNotes || "-")}</p>${order.cancellation ? `<p class="muted tiny">Cancellation: ${esc(order.cancellation.reason || "")}</p>` : ""}</div>
    </section>
  `);
}

function displayDateOnly(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function openReceipt(order) {
  const customer = customerById(order.customerId);
  const rows = order.items
    .map((item) => `
      <tr><td>${esc(item.productName)}</td><td>${esc(item.size)}</td><td>${esc(item.color)}</td><td>${item.quantity}</td><td>${Number(item.unitPrice || 0).toLocaleString()}</td><td>${Number(item.discount || 0).toLocaleString()}</td><td>${money(item.quantity * item.unitPrice - item.discount)}</td></tr>
    `)
    .join("");
  const payments = state.data.payments
    .filter((payment) => payment.orderId === order.id)
    .map((payment) => `<div>${esc(String(payment.paymentDate || "").slice(0, 10))} · ${esc(payment.method)} · ${money(payment.amount)}</div>`)
    .join("");
  showModal(`
    <div class="modal-head no-print">
      <h3>Receipt</h3>
      <div class="toolbar"><button class="btn small secondary" data-action="print-receipt">Print</button><button class="btn small secondary" data-action="save-receipt-png" data-id="${order.id}">Save PNG</button><button class="btn small secondary" data-action="close-modal">Close</button></div>
    </div>
    <div class="receipt">
      <div class="split"><div><h2>TOFU'S CLOSET</h2><div class="muted">${esc(state.data.settings.contactInfo)}</div></div><div><strong>${esc(order.orderNumber)}</strong><div class="muted tiny">${esc(displayDateOnly(order.orderDate))}</div></div></div>
      <div class="grid cols-2">
        <div><strong>Customer</strong><div>${esc(customer?.name || "")}</div><div class="muted tiny">${esc(customer?.phone || "")}</div><div class="muted tiny">${esc(customer?.address || "")}</div></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Product</th><th>Size</th><th>Color</th><th>Qty</th><th>Price</th><th>Discount</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="grid cols-2">
        <div><strong>Payments</strong><div class="muted tiny">${payments || "No payments recorded."}</div><div class="muted tiny">Payment status: ${esc(order.paymentStatus)}</div></div>
        <div class="table-wrap"><table><tbody><tr><th>Total</th><td>${money(order.total)}</td></tr><tr><th>Paid</th><td>${money(order.paid)}</td></tr><tr><th>Remaining Balance</th><td>${money(order.balance)}</td></tr></tbody></table></div>
      </div>
      <div><strong>Customer Notes</strong><div class="muted">${esc(order.customerNotes || "")}</div></div>
    </div>
  `);
}

function parseVariants(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [color, size, stockOnHand, lowStockThreshold] = line.split(",").map((part) => part.trim());
      return { color, size, stockOnHand: Number(stockOnHand || 0), lowStockThreshold: Number(lowStockThreshold || 3) };
    });
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function fileToDataUrl(file) {
  if (!file || !file.size) return "";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parseOrderItems(form) {
  return [...form.querySelectorAll(".line-item")].map((row) => {
    const productInput = row.querySelector(".line-product-name");
    const productIdInput = row.querySelector(".line-product-id");
    const variantInput = row.querySelector(".line-variant-name");

    const productName = productInput?.value?.trim() || "";

    // Match typed product name with existing product
    const matchedProduct = state.data.products.find(
      (product) =>
        String(product.name || "").trim().toLowerCase() ===
        productName.toLowerCase()
    );

    if (matchedProduct && productIdInput) {
      productIdInput.value = matchedProduct.id;
    }

    return {
      id: row.dataset.itemId || "",
      productId: matchedProduct?.id || productIdInput?.value || "",
      productName,
      variantId: row.querySelector(".line-variant")?.value || "",
      size: row.querySelector(".line-size")?.value?.trim() || "",
      color: row.querySelector(".line-color")?.value?.trim() || "",
      variantName: row.querySelector(".line-variant-name")?.value?.trim() || "",
      quantity: Number(row.querySelector(".line-qty").value),
      unitPrice: Number(row.querySelector(".line-price").value),
      discount: Number(row.querySelector(".line-discount").value)
    };
  });
}

async function refreshAndRender() {
  await loadData();
  renderShell();
}

function showError(message) {
  alert(message);
}

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  try {
    if (form.id === "login-form") {
      const body = formData(form);
      const result = await api("/api/auth/login", { method: "POST", body });
      state.token = result.token;
      localStorage.setItem("tc_token", result.token);
      await refreshAndRender();
      return;
    }

    if (form.id === "product-form") {
      const body = formData(form);
      const imageFile = form.querySelector('input[name="imageFile"]').files[0];
      const uploaded = await fileToDataUrl(imageFile);
      body.image = uploaded || body.image;
      body.variants = parseVariants(body.variants);
      const id = form.dataset.id;
      await api(id ? `/api/products/${id}` : "/api/products", { method: id ? "PUT" : "POST", body });
      closeModal();
      await refreshAndRender();
      return;
    }

    if (form.id === "stock-form") {
      await api(`/api/products/${form.dataset.id}/stock`, { method: "POST", body: formData(form) });
      closeModal();
      await refreshAndRender();
      return;
    }

    if (form.id === "customer-form") {
      const body = formData(form);
      body.tags = body.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
      const id = form.dataset.id;
      await api(id ? `/api/customers/${id}` : "/api/customers", { method: id ? "PUT" : "POST", body });
      closeModal();
      await refreshAndRender();
      return;
    }

    if (form.id === "order-form") {
      const body = formData(form);
      const id = form.dataset.id;
      body.items = parseOrderItems(form);
      if (!body.customerId) {
        body.customer = {
          name: body.customerName,
          phone: body.customerPhone,
          contact: body.customerContact,
          township: body.township,
          address: body.address,
          deliveryMethod: body.deliveryMethod
        };
      }
      await api(id ? `/api/orders/${id}` : "/api/orders", { method: id ? "PUT" : "POST", body });
      closeModal();
      await refreshAndRender();
      return;
    }

    if (form.id === "payment-form") {
      await api(`/api/orders/${form.dataset.id}/payments`, { method: "POST", body: formData(form) });
      closeModal();
      await refreshAndRender();
      return;
    }

    if (form.id === "cancel-form") {
      await api(`/api/orders/${form.dataset.id}/cancel`, { method: "POST", body: formData(form) });
      closeModal();
      await refreshAndRender();
      return;
    }

    if (form.id === "return-form") {
      const body = formData(form);
      body.items = [{ orderItemId: body.orderItemId, quantity: Number(body.quantity), condition: body.condition }];
      await api(`/api/orders/${form.dataset.id}/returns`, { method: "POST", body });
      closeModal();
      await refreshAndRender();
      return;
    }

    if (form.id === "expense-form") {
      await api("/api/expenses", { method: "POST", body: formData(form) });
      await refreshAndRender();
      return;
    }

    if (form.id === "cargo-form") {
      const body = formData(form);
      body.orderIds = new FormData(form).getAll("orderIds");
      await api("/api/cargo-batches", { method: "POST", body });
      await refreshAndRender();
      return;
    }

    if (form.id === "cargo-orders-form") {
      const batchId = formData(form).batchId;
      const body = {
        orderIds: new FormData(form).getAll("orderIds")
      };

      await api(`/api/cargo-batches/${batchId}`, {
        method: "PUT",
        body
      });

      closeModal();
      await refreshAndRender();
      return;
    }

    if (form.id === "report-filters") {
      syncReportFilters(form);
      await refreshReports();
      state.reportGenerated = true;
      renderShell();
      return;
    }

    if (form.id === "settings-form") {
      const body = formData(form);
      for (const key of ["paymentMethods", "deliveryMethods", "orderStatuses", "productCategories", "expenseCategories", "customerTags"]) {
        body[key] = body[key].split("\n").map((item) => item.trim()).filter(Boolean);
      }
      body.defaultDepositPerItem = Number(body.defaultDepositPerItem);
      body.lowStockThreshold = Number(body.lowStockThreshold);
      await api("/api/settings", { method: "PUT", body });
      await refreshAndRender();
    }
  } catch (error) {
    if (form.id === "login-form") renderLogin(error.message);
    else showError(error.message);
  }
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  try {
    if (action === "close-modal" && !event.target.closest("[data-modal-card]")) closeModal();
    if (action === "close-modal" && target.matches("button")) closeModal();
    if (action === "nav") {
      state.view = normalizeView(target.dataset.view);
      localStorage.setItem("tc_view", state.view);
      state.navOpen = false;
      state.profileOpen = false;
      renderShell();
    }
    if (action === "toggle-nav") {
      state.navOpen = !state.navOpen;
      state.profileOpen = false;
      renderShell();
    }
    if (action === "close-nav") {
      state.navOpen = false;
      renderShell();
    }
    if (action === "toggle-profile") {
      state.profileOpen = !state.profileOpen;
      renderShell();
    }
    if (action === "open-profile") {
      state.profileOpen = false;
      renderShell();
      openProfileModal();
    }
    if (action === "logout") {
      await api("/api/auth/logout", { method: "POST" });
      state.token = "";
      state.profileOpen = false;
      localStorage.removeItem("tc_token");
      renderLogin();
    }
    if (action === "order-type-filter") {
      state.orderTypeFilter = target.dataset.filter || "all";
      localStorage.setItem("tc_order_type_filter", state.orderTypeFilter);
      renderShell();
    }
    if (action === "preorder-filter") {
      state.preorderFilter = target.dataset.filter || "all";
      renderShell();
    }
    if (action === "inventory-filter") {
      state.inventoryFilter = target.dataset.filter || "all";
      localStorage.setItem("tc_inventory_filter", state.inventoryFilter);
      renderShell();
    }
    if (action === "inventory-pane") {
      state.inventoryPane = target.dataset.pane || "products";
      localStorage.setItem("tc_inventory_pane", state.inventoryPane);
      renderShell();
    }
    if (action === "finance-tab") {
      state.financeTab = target.dataset.tab || "overview";
      localStorage.setItem("tc_finance_tab", state.financeTab);
      renderShell();
    }
    if (action === "shift-dashboard-date") {
      const delta = Number(target.dataset.delta || 0);
      const nextDate = shiftDateKey(selectedReportDate(), delta);
      state.reportFilters = {
        ...state.reportFilters,
        preset: "custom",
        from: nextDate,
        to: nextDate
      };
      state.reportPreset = "custom";
      await refreshReports();
      renderShell();
    }

    if (action === "open-product") openProductModal(target.dataset.id ? productById(target.dataset.id) : null);
    if (action === "open-stock") openStockModal(productById(target.dataset.id), target.dataset.variant || "");
    if (action === "open-customer") openCustomerModal(target.dataset.id ? customerById(target.dataset.id) : null);
    if (action === "open-order") openOrderModal(target.dataset.id ? orderById(target.dataset.id) : null);
    if (action === "open-order-details") openOrderDetails(orderById(target.dataset.id));
    if (action === "edit-cargo-orders") openCargoOrdersModal(target.dataset.id);
    if (action === "open-payment") openPaymentModal(orderById(target.dataset.id));
    if (action === "open-cancel") openCancelModal(orderById(target.dataset.id));
    if (action === "open-return") openReturnModal(orderById(target.dataset.id));
    if (action === "open-receipt") openReceipt(orderById(target.dataset.id));
    if (action === "print-receipt") window.print();

    if (action === "save-receipt-png") {
      const receipt = document.querySelector("#modal-root .receipt");

      if (!receipt || typeof html2canvas === "undefined") {
        alert("Receipt image tool is not available.");
        return;
      }

      html2canvas(receipt, {
        backgroundColor: "#ffffff",
        scale: Math.max(4, window.devicePixelRatio * 4),
        useCORS: true,
        logging: false
      }).then((canvas) => {
        const link = document.createElement("a");
        const order = orderById(
          target.closest("[data-action]")?.dataset.id
        );

        link.download = `${order?.orderNumber || "receipt"}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      });
    }
    if (action === "add-line") {
      document.getElementById("line-items").insertAdjacentHTML(
        "beforeend",
        lineItemRow(
          null,
          document.querySelector('#order-form select[name="orderType"]')?.value || "Preorder"
        )
      );
    }
    if (action === "remove-line") {
      const rows = [...document.querySelectorAll(".line-item")];
      if (rows.length > 1) target.closest(".line-item").remove();
    }
    if (action === "delete-product") {
      if (confirm("Soft delete this product? Existing order history will remain.")) {
        await api(`/api/products/${target.dataset.id}`, { method: "DELETE" });
        closeModal();
        await refreshAndRender();
      }
    }
    if (action === "dismiss-notification") {
      await api(`/api/notifications/${encodeURIComponent(target.dataset.id)}/dismiss`, { method: "POST" });
      await refreshAndRender();
    }
    if (action === "clear-report-filters") {
      state.reportFilters = {
        preset: "today",
        from: "",
        to: "",
        productId: "",
        category: "",
        customerId: "",
        staffId: "",
        orderStatus: "",
        paymentStatus: "",
        orderType: "",
        cargoBatch: "",
        deliveryMethod: ""
      };
      state.reportPreset = "this-year";
      await refreshReports();
      renderShell();
    }
    if (action === "search-hit") {
      document.getElementById("search-results")?.classList.remove("is-visible");
      if (target.dataset.type === "Order") openOrderDetails(orderById(target.dataset.id));
      if (target.dataset.type === "Product") openProductModal(productById(target.dataset.id));
      if (target.dataset.type === "Customer") openCustomerModal(customerById(target.dataset.id));
      if (target.dataset.type === "Cargo") {
        state.view = "cargo";
        localStorage.setItem("tc_view", state.view);
        renderShell();
      }
    }
    if (action === "export") {
      await downloadCsv(target.dataset.entity);
    }
  } catch (error) {
    showError(error.message);
  }
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  try {
    if (target.name === "deliveryMethod") {
      const note = document.getElementById("delivery-rule-note");
      if (note) {
        const text = deliveryPaymentNote(target.value);
        note.textContent = text;
        note.classList.toggle("is-visible", Boolean(text));
      }
    }
    if (target.dataset.action === "order-more") {
      const nextAction = target.value;
      target.value = "";
      runOrderMoreAction(target.dataset.id, nextAction);
      return;
    }
    if (target.dataset.action === "change-order-status") {
      const body = { [target.dataset.kind]: target.value };
      await api(`/api/orders/${target.dataset.id}/status`, { method: "POST", body });
      await refreshAndRender();
    }
    if (target.dataset.action === "change-item-arrival") {
      await api(`/api/orders/${target.dataset.orderId}/status`, {
        method: "POST",
        body: { itemArrivals: [{ itemId: target.dataset.itemId, arrivalStatus: target.value }] }
      });
      await refreshAndRender();
    }
    if (target.dataset.action === "change-batch-status") {
      await api(`/api/cargo-batches/${target.dataset.id}`, { method: "PUT", body: { status: target.value } });
      await refreshAndRender();
    }
    if (target.dataset.action === "report-preset") {
      syncReportFilters(target.form);
      await refreshReports();
      renderShell();
    }
    if (target.id === "dashboard-date-picker") {

      const nextDate = target.value;

      if (!nextDate) return;

      state.reportFilters.preset = "custom";
      state.reportFilters.from = nextDate;
      state.reportFilters.to = nextDate;
      state.reportPreset = "custom";

      await refreshReports();
      renderShell();
      return;
    }
  } catch (error) {
    showError(error.message);
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "inventory-search") {
    state.inventoryQuery = event.target.value;
    const grid = document.getElementById("product-grid");
    if (grid) grid.innerHTML = renderProductCards();
    return;
  }
  if (event.target.id !== "global-search") return;
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(async () => {
    const box = document.getElementById("search-results");
    const query = event.target.value.trim();
    if (!query) {
      box.classList.remove("is-visible");
      box.innerHTML = "";
      return;
    }
    try {
      const { results } = await api(`/api/search?q=${encodeURIComponent(query)}`);
      box.innerHTML = results.length
        ? results
            .map((item) => `<div class="search-hit" data-action="search-hit" data-type="${esc(item.type)}" data-id="${esc(item.id)}"><span class="badge">${esc(item.type)}</span><div><strong>${esc(item.title)}</strong><div class="muted tiny">${esc(item.subtitle)}</div></div><span>${money(item.amount)}</span></div>`)
            .join("")
        : `<div class="search-hit"><span></span><div class="muted">No results</div><span></span></div>`;
      box.classList.add("is-visible");
    } catch (_error) {
      box.classList.remove("is-visible");
    }
  }, 180);
});

async function downloadCsv(entity) {
  const query = state.view === "finance" ? reportQuery() : "";
  const suffix = query ? `?${query}` : "";
  const response = await fetch(`/api/export/${encodeURIComponent(entity)}${suffix}`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });
  if (!response.ok) throw new Error("Export failed");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tofus-${entity}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

(async function init() {
  if (!state.token) {
    renderLogin();
    return;
  }
  try {
    await loadData();
    renderShell();
  } catch (_error) {
    localStorage.removeItem("tc_token");
    state.token = "";
    renderLogin("Session expired. Please sign in again.");
  }
})();

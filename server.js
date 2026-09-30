require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mysqlStore = require("./lib/mysql-store");

const PORT = Number(process.env.PORT || 8800);
const PUBLIC_DIR = path.join(__dirname, "public");

const sessions = new Map();

const ORDER_STATUSES = [
  "Pending Confirmation",
  "Deposit Paid",
  "Ordered from Supplier",
  "Waiting for Supplier",
  "Supplier Shipped",
  "Arrived in China Warehouse",
  "China -> Myanmar Cargo",
  "Arrived in Myanmar",
  "Checking",
  "Ready for Customer",
  "Customer Balance Pending",
  "Partially Arrived",
  "Ready for Delivery",
  "Delivered",
  "Completed",
  "Cancelled",
  "Returned / Refunded",
  "Returned",
  "New",
  "Confirmed",
  "Ordered",
  "In Production",
  "Waiting",
  "Arrived",
  "To Pack",
  "Packed",
  "Shipped"
];

const PACKING_STATUSES = ["To Pack", "Packing", "Packed", "Shipped"];
const DELIVERY_STATUSES = ["Waiting", "Shipped", "In Transit", "Delivered", "Failed", "Returned"];
const PREORDER_STATUSES = [
  "Pending Confirmation",
  "Deposit Paid",
  "Ordered from Supplier",
  "Waiting for Supplier",
  "Supplier Shipped",
  "Arrived in China Warehouse",
  "China -> Myanmar Cargo",
  "Arrived in Myanmar",
  "Checking",
  "Ready for Customer",
  "Customer Balance Pending",
  "Delivered",
  "Completed",
  "Cancelled",
  "Returned / Refunded"
];
const CARGO_STATUSES = [
  "Preparing",
  "China -> Muse",
  "Arrived at Muse",
  "Muse -> Yangon",
  "In Transit",
  "In Transit to Yangon",
  "Arrived in Yangon",
  "Completed"
];
const ITEM_PREORDER_STATUSES = [
  "Waiting",
  "Supplier Ordered",
  "Supplier Shipped",
  "Cargo",
  "Arrived",
  "Checking",
  "Ready for Customer",
  "Delivered",
  "Returned"
];
const CARGO_ROUTES = ["China -> Muse", "Muse -> Yangon", "China -> Muse -> Yangon"];

function nowIso() {
  return new Date().toISOString();
}

function dateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function addDaysToDate(value, days) {
  const date = value ? new Date(value) : new Date();
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function waitingTimeDays(value, fallback = 28) {
  const text = String(value || "").toLowerCase();
  const number = Number((text.match(/\d+/) || [])[0]);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  if (text.includes("month")) return number * 30;
  if (text.includes("week")) return number * 7;
  if (text.includes("day")) return number;
  return number;
}

function expectedArrivalDate(orderDate, waitingTime) {
  return addDaysToDate(orderDate || dateKey(), waitingTimeDays(waitingTime));
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function toInt(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(number);
}

function assertRule(condition, message, status = 400) {
  if (!condition) {
    const error = new Error(message);
    error.status = status;
    throw error;
  }
}

function unique(values) {
  return Array.from(new Set((values || []).filter((value) => value !== undefined && value !== null && String(value).trim() !== "").map((value) => String(value).trim())));
}

function mergeUnique(preferred, existing) {
  return unique([...(preferred || []), ...(existing || [])]);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64);
  const saved = Buffer.from(hash, "hex");
  return saved.length === candidate.length && crypto.timingSafeEqual(saved, candidate);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: user.permissions || []
  };
}

function buildVariant(id, productId, color, size, stockOnHand, threshold = 3) {
  return {
    id,
    productId,
    color,
    size,
    stockOnHand,
    reserved: 0,
    sold: 0,
    returned: 0,
    damaged: 0,
    lowStockThreshold: threshold,
    active: true
  };
}

function buildProduct({
  id,
  sku,
  name,
  category,
  supplier,
  productType,
  description,
  purchaseCost,
  sellingPrice,
  discountPrice = 0,
  image = "",
  variants = [],
  supplierLink = "",
  supplierProductCode = "",
  supplierPrice = 0,
  estimatedProductCost = 0,
  defaultWaitingTime = "4 Weeks & Above",
  notes = "",
  defaultCargoCost = 0
}) {
  const sizes = unique(variants.map((variant) => variant.size));
  const colors = unique(variants.map((variant) => variant.color));
  return {
    id,
    sku,
    name,
    images: image ? [image] : [],
    category,
    supplier,
    productType,
    description,
    purchaseCost,
    sellingPrice,
    discountPrice,
    supplierLink,
    supplierProductCode,
    supplierPrice,
    estimatedProductCost: estimatedProductCost || purchaseCost + defaultCargoCost,
    defaultWaitingTime,
    availableSizes: sizes,
    availableColors: colors,
    customerDescription: description,
    notes,
    internalNotes: notes,
    defaultCargoCost,
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    variants,
    costHistory: [
      {
        id: createId("cost"),
        cost: purchaseCost,
        date: dateKey(),
        note: "Initial cost"
      }
    ]
  };
}

function defaultSettings() {
  return {
    storeName: "TOFU'S CLOSET",
    contactInfo: "",
    logo: "",
    defaultDepositPerItem: 10000,
    defaultWaitingTime: "4 Weeks & Above",
    lowStockThreshold: 3,
    allowOverpayment: false,
    gateRule: "All Prepaid",
    paymentMethods: ["KPay", "WavePay", "Bank Transfer", "Cash", "Other"],
    deliveryMethods: ["Deli", "Royal Express", "Other Delivery", "Pickup", "Gate"],
    orderStatuses: ORDER_STATUSES,
    packingStatuses: PACKING_STATUSES,
    deliveryStatuses: DELIVERY_STATUSES,
    preorderStatuses: PREORDER_STATUSES,
    itemPreorderStatuses: ITEM_PREORDER_STATUSES,
    cargoStatuses: CARGO_STATUSES,
    cargoRoutes: CARGO_ROUTES,
    productCategories: ["Tops", "Pants", "Bags", "Accessories"],
    expenseCategories: [
      "Cargo",
      "Delivery",
      "Packaging",
      "Marketing",
      "Advertising",
      "Platform Fees",
      "Supplier",
      "Supplier Related",
      "Refund",
      "Other"
    ],
    customerTags: [
      "New Customer",
      "Regular Customer",
      "VIP",
      "Preorder Customer",
      "Instock Customer",
      "Problem Order",
      "High Value Customer"
    ],
    staffPermissions: [
      "orders:create",
      "orders:edit",
      "orders:status",
      "payments:create",
      "customers:manage",
      "products:view",
      "inventory:view",
      "reports:own"
    ]
  };
}

function createEmptyDb() {
  return {
    version: 1,
    createdAt: nowIso(),
    settings: defaultSettings(),
    users: [],
    customers: [],
    products: [],
    orders: [],
    payments: [],
    refunds: [],
    returns: [],
    expenses: [],
    inventoryTransactions: [],
    cargoBatches: [],
    auditLogs: [],
    dismissedNotifications: [],
    orderStatusHistory: [],
    suppliers: []
  };
}

function nextCustomerCode(db) {
  const numeric = (db.customers || [])
    .map((customer) => Number(String(customer.customerCode || "").replace(/\D/g, "")))
    .filter(Number.isFinite);
  const next = (numeric.length ? Math.max(...numeric) : 1000) + 1;
  return `C${next}`;
}

function createOwnerAccount(db, input) {
  assertRule(!(db.users || []).length, "Initial owner account already exists", 409);
  assertRule(input?.name, "Name is required");
  assertRule(input?.email, "Email is required");
  assertRule(input?.password && String(input.password).length >= 8, "Password must be at least 8 characters");
  const owner = {
    id: createId("user"),
    name: String(input.name).trim(),
    email: String(input.email).trim().toLowerCase(),
    role: "Owner",
    passwordHash: hashPassword(input.password),
    permissions: ["*"],
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.users.unshift(owner);
  addAudit(db, owner, "Owner account created", "user", owner.id, owner.email);
  return owner;
}

function createBaseDb() {
  const db = createEmptyDb();
  const owner = {
    id: "u_owner",
    name: "Owner",
    email: "owner@tofuscloset.local",
    role: "Owner",
    passwordHash: hashPassword("owner123", "owner-demo-salt"),
    permissions: ["*"],
    active: true
  };
  const staff = {
    id: "u_staff",
    name: "Staff Admin",
    email: "staff@tofuscloset.local",
    role: "Staff",
    passwordHash: hashPassword("staff123", "staff-demo-salt"),
    permissions: db.settings.staffPermissions,
    active: true
  };
  db.users = [owner, staff];

  const babyVariants = [
    buildVariant("v_baby_black_s", "p_baby_tee", "Black", "S", 5),
    buildVariant("v_baby_black_m", "p_baby_tee", "Black", "M", 8),
    buildVariant("v_baby_black_l", "p_baby_tee", "Black", "L", 3),
    buildVariant("v_baby_white_s", "p_baby_tee", "White", "S", 4),
    buildVariant("v_baby_white_m", "p_baby_tee", "White", "M", 6),
    buildVariant("v_baby_white_l", "p_baby_tee", "White", "L", 2)
  ];
  const cuteVariants = [
    buildVariant("v_cute_pink_s", "p_cute_tee", "Pink", "S", 4),
    buildVariant("v_cute_pink_m", "p_cute_tee", "Pink", "M", 5),
    buildVariant("v_cute_blue_m", "p_cute_tee", "Blue", "M", 3)
  ];
  const jeanVariants = [
    buildVariant("v_jean_blue_28", "p_men_jean", "Blue", "28", 3),
    buildVariant("v_jean_blue_30", "p_men_jean", "Blue", "30", 4),
    buildVariant("v_jean_black_32", "p_men_jean", "Black", "32", 2)
  ];
  const shirtVariants = [
    buildVariant("v_long_cream_s", "p_long_sleeve", "Cream", "S", 6),
    buildVariant("v_long_cream_m", "p_long_sleeve", "Cream", "M", 6),
    buildVariant("v_long_gray_l", "p_long_sleeve", "Gray", "L", 4)
  ];
  const tankVariants = [
    buildVariant("v_tank_black_free", "p_tank_top", "Black", "Free", 10),
    buildVariant("v_tank_white_free", "p_tank_top", "White", "Free", 7)
  ];
  const bagVariants = [
    buildVariant("v_backpack_black_free", "p_backpack", "Black", "Free", 5),
    buildVariant("v_pink_bag_free", "p_pink_bag", "Pink", "Free", 3)
  ];

  db.customers = [];
  db.products = [];
  return db;
}

function findProduct(db, productId) {
  return db.products.find((product) => product.id === productId);
}

function findVariant(db, variantId) {
  for (const product of db.products) {
    const variant = product.variants.find((item) => item.id === variantId);
    if (variant) return { product, variant };
  }
  return null;
}

function findCustomer(db, customerId) {
  return db.customers.find((customer) => customer.id === customerId);
}

function findUser(db, userId) {
  return db.users.find((user) => user.id === userId);
}

function userName(db, userId) {
  return findUser(db, userId)?.name || "System";
}

function can(user, permission) {
  if (!user) return false;
  if (user.role === "Owner" || (user.permissions || []).includes("*")) return true;
  return (user.permissions || []).includes(permission);
}

function addAudit(db, user, action, entityType, entityId, details = "") {
  db.auditLogs.unshift({
    id: createId("audit"),
    userId: user?.id || "system",
    userName: user?.name || "System",
    action,
    entityType,
    entityId,
    details,
    createdAt: nowIso()
  });
}

function addTimeline(order, user, title, note = "") {
  order.timeline = order.timeline || [];
  order.timeline.unshift({
    id: createId("tl"),
    userId: user?.id || "system",
    userName: user?.name || "System",
    title,
    note,
    createdAt: nowIso()
  });
}

function addInventoryTransaction(db, user, transaction) {
  const variantInfo = findVariant(db, transaction.variantId);
  db.inventoryTransactions.unshift({
    id: createId("inv"),
    date: nowIso(),
    productId: variantInfo?.product.id || transaction.productId,
    productName: variantInfo?.product.name || transaction.productName || "",
    variantId: transaction.variantId,
    variantLabel: variantInfo ? `${variantInfo.variant.color} / ${variantInfo.variant.size}` : "",
    quantity: toInt(transaction.quantity),
    action: transaction.action,
    relatedOrderId: transaction.relatedOrderId || "",
    staffId: user?.id || "system",
    staffName: user?.name || "System",
    note: transaction.note || ""
  });
}

function variantAvailable(variant) {
  return toInt(variant.stockOnHand) - toInt(variant.reserved);
}

function orderNumber(db) {
  const numeric = db.orders
    .map((order) => {
      const match = String(order.orderNumber || "").match(/^ORD-(\d+)$/i);
      return match ? Number(match[1]) : NaN;
    })
    .filter(Number.isFinite);

  const next = (numeric.length ? Math.max(...numeric) : 0) + 1;

  return `ORD-${String(next).padStart(4, "0")}`;
}

function paymentStatusFor(db, order, financials) {
  if (financials.refunded > 0 && financials.refunded >= financials.paid) return "Refunded";
  if (financials.refunded > 0) return "Partially Refunded";
  if (financials.paid <= 0) return "Unpaid";
  if (financials.paid >= financials.total) return "Fully Paid";
  const expectedDeposit = toInt(order.requiredDeposit || db.settings.defaultDepositPerItem * order.items.reduce((sum, item) => sum + item.quantity, 0));
  if (financials.paid <= expectedDeposit) return "Deposit Paid";
  return "Partially Paid";
}

function calculateOrderFinancials(db, order) {
  const items = order.items || [];
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discount = items.reduce((sum, item) => sum + toInt(item.discount), 0);
  const productTotal = Math.max(subtotal - discount, 0);
  const deliveryFee = toInt(order.deliveryFee);
  const total = productTotal + deliveryFee;
  const payments = db.payments.filter((payment) => payment.orderId === order.id);
  const refunds = db.refunds.filter((refund) => refund.orderId === order.id);
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const refunded = refunds.reduce((sum, refund) => sum + refund.amount, 0);
  const finalPaidAmount = Math.max(paid - refunded, 0);
  const balance = Math.max(total - finalPaidAmount, 0);
  const productCost = items.reduce(
  (sum, item) => sum + Number(item.purchaseCost || 0) * Number(item.quantity || 0),
  0);
  const cargoCost = items.reduce((sum, item) => sum + Number(item.cargoCost || 0), 0);
  const shopDeliveryCost = toInt(order.shopDeliveryCost);
  const allocatedExpense = toInt(order.allocatedExpense);
  const netSales = Math.max(productTotal + deliveryFee - refunded, 0);
  const profit = netSales - productCost - cargoCost - shopDeliveryCost - allocatedExpense;

  return {
    subtotal,
    discount,
    productTotal,
    deliveryFee,
    total,
    paid,
    refunded,
    finalPaidAmount,
    balance,
    productCost,
    cargoCost,
    shopDeliveryCost,
    allocatedExpense,
    netSales,
    profit
  };
}

function refreshOrder(db, order) {
  const financials = calculateOrderFinancials(db, order);
  order.subtotal = financials.subtotal;
  order.discount = financials.discount;
  order.total = financials.total;
  order.paid = financials.paid;
  order.refunded = financials.refunded;
  order.finalPaidAmount = financials.finalPaidAmount;
  order.balance = financials.balance;
  order.remainingBalance = financials.balance;
  order.requiredDeposit = toInt(
    order.requiredDeposit || db.settings.defaultDepositPerItem * (order.items || []).reduce((sum, item) => sum + toInt(item.quantity), 0)
  );
  order.productCost = financials.productCost;
  order.cargoCost = financials.cargoCost;
  order.netProfit = financials.profit;
  order.paymentStatus = paymentStatusFor(db, order, financials);
  return order;
}

function refreshAllOrders(db) {
  db.orders.forEach((order) => refreshOrder(db, order));
}

function normalizeOrderItem(db, item) {
  const orderType = item.orderType || "Preorder";
  const quantity = toInt(item.quantity);

  assertRule(quantity > 0, "Quantity must be greater than zero");

  const unitPrice = toInt(item.unitPrice);
  const discount = toInt(item.discount);

  assertRule(unitPrice >= 0, "Price cannot be negative");
  assertRule(discount >= 0, "Discount cannot be negative");

  // PREORDER
  if (orderType === "Preorder") {
    const product = item.productId
      ? findProduct(db, item.productId)
      : null;

    return {
      id: item.id || createId("item"),
      productId: product?.id || item.productId || "",
      variantId: "",
      sku: product?.sku || "",
      productName: String(item.productName || product?.name || "").trim(),
      color: "",
      size: String(item.variantName || "").trim(),
      variantName: String(item.variantName || "").trim(),
      quantity,
      unitPrice,
      discount,
      purchaseCost: toInt(item.purchaseCost || product?.purchaseCost || 0),
      cargoCost: toInt(item.cargoCost ?? product?.defaultCargoCost ?? 0),
      supplierStatus: item.supplierStatus || "Pending",
      cargoStatus: item.cargoStatus || "Waiting",
      arrivalStatus: item.arrivalStatus || "Waiting",
      expectedArrival: item.expectedArrival || expectedArrivalDate(
        item.orderDate || dateKey(),
        item.waitingTime || db.settings.defaultWaitingTime
      ),
      batchId: item.batchId || "",
      customerNotified: item.customerNotified === true
    };
  }

  // NORMAL / STOCK ORDER
  const found = findVariant(db, item.variantId);

  assertRule(found, "Product variant not found");
  assertRule(found.product.active !== false, "Product is inactive");
  assertRule(found.variant.active !== false, "Product variant is inactive");

  return {
    id: item.id || createId("item"),
    productId: found.product.id,
    variantId: found.variant.id,
    sku: found.product.sku,
    productName: found.product.name,
    color: found.variant.color,
    size: found.variant.size,
    variantName: `${found.variant.color} / ${found.variant.size}`,
    quantity,
    unitPrice: unitPrice || found.product.discountPrice || found.product.sellingPrice,
    discount,
    purchaseCost: toInt(item.purchaseCost || found.product.purchaseCost),
    cargoCost: toInt(item.cargoCost ?? found.product.defaultCargoCost),
    supplierStatus: item.supplierStatus || "Pending",
    cargoStatus: item.cargoStatus || "Waiting",
    arrivalStatus: item.arrivalStatus || "Waiting",
    expectedArrival: item.expectedArrival || expectedArrivalDate(
      item.orderDate || dateKey(),
      item.waitingTime || db.settings.defaultWaitingTime
    ),
    batchId: item.batchId || "",
    customerNotified: item.customerNotified === true
  };
}

function canReserveProduct(product, variant, quantity) {
  if (["Preorder", "Both"].includes(product.productType)) return true;
  return variantAvailable(variant) >= quantity;
}

function validateItemsCanReserve(db, items, replacingOrder = null) {
  const oldReserved = new Map();

  if (replacingOrder?.stockState === "reserved") {
    for (const item of replacingOrder.items) {
      if (!item.variantId) continue;

      oldReserved.set(
        item.variantId,
        (oldReserved.get(item.variantId) || 0) + item.quantity
      );
    }
  }

  const requested = new Map();

  for (const item of items) {
    // Preorder items do not use inventory variants
    if (!item.variantId) continue;

    requested.set(
      item.variantId,
      (requested.get(item.variantId) || 0) + item.quantity
    );
  }

  for (const [variantId, quantity] of requested.entries()) {
    const found = findVariant(db, variantId);

    assertRule(found, "Product variant not found");

    if (["Preorder", "Both"].includes(found.product.productType)) {
      continue;
    }

    const availableWithCurrentOrder =
      variantAvailable(found.variant) +
      (oldReserved.get(variantId) || 0);

    assertRule(
      availableWithCurrentOrder >= quantity,
      `${found.product.name} ${found.variant.color}/${found.variant.size} does not have enough available stock`
    );
  }
}

function reserveOrderItems(db, order, user, note = "Reserved for order") {
  validateItemsCanReserve(db, order.items);

  for (const item of order.items) {
    if (!item.variantId) continue;

    const found = findVariant(db, item.variantId);
    if (!found) continue;

    found.variant.reserved += item.quantity;

    addInventoryTransaction(db, user, {
      variantId: item.variantId,
      quantity: item.quantity,
      action: "Reserved",
      relatedOrderId: order.id,
      note
    });
  }

  order.stockState = "reserved";
}

function releaseOrderReservations(db, order, user, note = "Reservation released") {
  if (order.stockState !== "reserved") return;
  for (const item of order.items) {
    const found = findVariant(db, item.variantId);
    if (!found) continue;
    found.variant.reserved = Math.max(0, found.variant.reserved - item.quantity);
    addInventoryTransaction(db, user, {
      variantId: item.variantId,
      quantity: item.quantity,
      action: "Reservation Released",
      relatedOrderId: order.id,
      note
    });
  }
  order.stockState = "released";
}

function finalizeOrderStock(db, order, user) {
  if (order.stockState === "sold") return;
  if (order.stockState === "released") reserveOrderItems(db, order, user, "Reserved before sale finalization");
  for (const item of order.items) {
    const found = findVariant(db, item.variantId);
    if (!found) continue;
    found.variant.reserved = Math.max(0, found.variant.reserved - item.quantity);
    found.variant.stockOnHand -= item.quantity;
    found.variant.sold += item.quantity;
    addInventoryTransaction(db, user, {
      variantId: item.variantId,
      quantity: item.quantity,
      action: "Sold",
      relatedOrderId: order.id,
      note: "Order delivered/completed"
    });
  }
  order.stockState = "sold";
}

function restoreSoldStock(db, order, user, note = "Sold stock restored") {
  if (order.stockState !== "sold") return;
  for (const item of order.items) {
    const found = findVariant(db, item.variantId);
    if (!found) continue;
    found.variant.stockOnHand += item.quantity;
    found.variant.sold = Math.max(0, found.variant.sold - item.quantity);
    addInventoryTransaction(db, user, {
      variantId: item.variantId,
      quantity: item.quantity,
      action: "Sold Stock Restored",
      relatedOrderId: order.id,
      note
    });
  }
  order.stockState = "released";
}

function createOrUpdateCustomer(db, customerInput, user) {
  if (customerInput?.id) {
    const existing = findCustomer(db, customerInput.id);
    if (existing) return existing;
  }
  assertRule(customerInput?.name, "Customer name is required");
  assertRule(customerInput?.phone, "Customer phone is required");
  const customer = {
    id: createId("cust"),
    customerCode: customerInput.customerCode || nextCustomerCode(db),
    name: String(customerInput.name).trim(),
    phone: String(customerInput.phone).trim(),
    contact: String(customerInput.contact || "").trim(),
    address: String(customerInput.address || "").trim(),
    township: String(customerInput.township || "").trim(),
    deliveryMethod: String(customerInput.deliveryMethod || "Deli"),
    notes: String(customerInput.notes || ""),
    customerVisibleNotes: String(customerInput.customerVisibleNotes || ""),
    internalNotes: String(customerInput.internalNotes || customerInput.notes || ""),
    tags: Array.isArray(customerInput.tags) ? customerInput.tags : ["New Customer"],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.customers.unshift(customer);
  addAudit(db, user, "Customer created", "customer", customer.id, customer.name);
  return customer;
}

function createOrder(db, input, user) {
  assertRule(can(user, "orders:create"), "You do not have permission to create orders", 403);
  const customer = input.customerId
    ? findCustomer(db, input.customerId)
    : createOrUpdateCustomer(db, input.customer || {}, user);
  assertRule(customer, "Customer is required");
  assertRule(Array.isArray(input.items) && input.items.length > 0, "At least one order item is required");
  const orderDate = input.orderDate || dateKey();
  const waitingTime = input.waitingTime || db.settings.defaultWaitingTime;

  const items = input.items.map((item) =>
    normalizeOrderItem(db, {
      ...item,
      orderDate,
      orderType: input.orderType || "Preorder",
      waitingTime
    })
  );

  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  for (const item of items) {
    if (!item.expectedArrival) item.expectedArrival = expectedArrivalDate(orderDate, waitingTime);
  }

  const order = {
    id: createId("order"),
    orderNumber: input.orderNumber || orderNumber(db),
    orderDate,
    customerId: customer.id,
    createdBy: user.id,
    orderType: input.orderType || "Preorder",
    status: input.status || "Pending Confirmation",
    preorderStatus: input.preorderStatus || "Pending Confirmation",
    packingStatus: input.packingStatus || "To Pack",
    deliveryStatus: input.deliveryStatus || "Waiting",
    deliveryMethod: input.deliveryMethod || customer.deliveryMethod || "Deli",
    deliveryFee: toInt(input.deliveryFee),
    shopDeliveryCost: toInt(input.shopDeliveryCost),
    trackingNumber: String(input.trackingNumber || ""),
    waitingTime,
    expectedArrival: input.expectedArrival || expectedArrivalDate(orderDate, waitingTime),
    requiredDeposit: toInt(input.requiredDeposit || db.settings.defaultDepositPerItem * quantity),
    batchId: input.batchId || "",
    customerNotified: input.customerNotified === true,
    customerNotes: String(input.customerNotes || ""),
    internalNotes: String(input.internalNotes || ""),
    cancellation: null,
    packedBy: "",
    packedAt: "",
    timeline: [],
    items,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    stockState: "draft"
  };

  refreshOrder(db, order);
  const deposit = toInt(input.initialPayment);
  if (deposit > 0) {
    assertRule(can(user, "payments:create"), "You do not have permission to record the initial payment", 403);
    if (!db.settings.allowOverpayment) {
      assertRule(deposit <= order.total, "Initial payment cannot exceed order total");
    }
  }
  reserveOrderItems(db, order, user);
  db.orders.unshift(order);
  addTimeline(order, user, "Order created", `${order.items.length} item(s) added`);
  addAudit(db, user, "Order created", "order", order.id, order.orderNumber);

  if (deposit > 0) {
    addPayment(db, order.id, {
      amount: deposit,
      method: input.initialPaymentMethod || "KPay",
      note: "Initial deposit"
    }, user);
  }

  return refreshOrder(db, order);
}

function updateOrder(db, orderId, input, user) {
  assertRule(can(user, "orders:edit"), "You do not have permission to edit orders", 403);
  const order = db.orders.find((item) => item.id === orderId);
  assertRule(order, "Order not found", 404);
  assertRule(order.status !== "Cancelled", "Cancelled orders cannot be edited");
  assertRule(order.stockState !== "sold", "Delivered orders cannot be edited; process a return instead");

  if (input.customerId) {
    assertRule(findCustomer(db, input.customerId), "Customer not found");
    order.customerId = input.customerId;
  }
  if (input.customer) {
    const customer = createOrUpdateCustomer(db, input.customer, user);
    order.customerId = customer.id;
  }
  if (Array.isArray(input.items)) {
    assertRule(input.items.length > 0, "At least one order item is required");
    const nextItems = input.items.map((item) =>
      normalizeOrderItem(db, {
        ...item,
        orderType: input.orderType || order.orderType || "Preorder",
        orderDate: order.orderDate,
        waitingTime: order.waitingTime
      })
    );
    validateItemsCanReserve(db, nextItems, order);
    releaseOrderReservations(db, order, user, "Order edited");
    order.items = nextItems;
    reserveOrderItems(db, order, user, "Order edited");
  }

  const editable = [
    "orderDate",
    "orderType",
    "status",
    "preorderStatus",
    "packingStatus",
    "deliveryStatus",
    "deliveryMethod",
    "trackingNumber",
    "waitingTime",
    "expectedArrival",
    "batchId",
    "customerNotified",
    "customerNotes",
    "internalNotes"
  ];
  for (const key of editable) {
    if (Object.prototype.hasOwnProperty.call(input, key)) order[key] = input[key];
  }
  if (Object.prototype.hasOwnProperty.call(input, "requiredDeposit")) order.requiredDeposit = toInt(input.requiredDeposit);
  if (Object.prototype.hasOwnProperty.call(input, "deliveryFee")) order.deliveryFee = toInt(input.deliveryFee);
  if (Object.prototype.hasOwnProperty.call(input, "shopDeliveryCost")) order.shopDeliveryCost = toInt(input.shopDeliveryCost);
  order.updatedAt = nowIso();
  addTimeline(order, user, "Order edited", "Order details or items changed");
  addAudit(db, user, "Order edited", "order", order.id, order.orderNumber);
  return refreshOrder(db, order);
}

function cancelOrder(db, orderId, reason, user) {
  assertRule(can(user, "orders:edit"), "You do not have permission to cancel orders", 403);
  const order = db.orders.find((item) => item.id === orderId);
  assertRule(order, "Order not found", 404);
  assertRule(order.status !== "Cancelled", "Order is already cancelled");
  if (order.stockState === "reserved") releaseOrderReservations(db, order, user, "Order cancelled");
  if (order.stockState === "sold") restoreSoldStock(db, order, user, "Order cancelled after sale");
  order.status = "Cancelled";
  order.deliveryStatus = order.deliveryStatus === "Delivered" ? "Returned" : order.deliveryStatus;
  order.cancellation = {
    reason: String(reason || "No reason provided"),
    cancelledBy: user.id,
    cancelledByName: user.name,
    cancelledAt: nowIso()
  };
  order.updatedAt = nowIso();
  addTimeline(order, user, "Order cancelled", order.cancellation.reason);
  addAudit(db, user, "Order cancelled", "order", order.id, order.cancellation.reason);
  return refreshOrder(db, order);
}

function addPayment(db, orderId, input, user) {
  assertRule(can(user, "payments:create"), "You do not have permission to record payments", 403);
  const order = db.orders.find((item) => item.id === orderId);
  assertRule(order, "Order not found", 404);
  assertRule(order.status !== "Cancelled", "Cannot add payment to a cancelled order");
  refreshOrder(db, order);
  const amount = toInt(input.amount);
  assertRule(amount > 0, "Payment amount must be greater than zero");
  if (!db.settings.allowOverpayment) {
    assertRule(amount <= order.balance, "Payment cannot exceed remaining balance");
  }
  const payment = {
    id: createId("pay"),
    orderId,
    customerId: order.customerId,
    amount,
    method: input.method || "KPay",
    paymentDate: input.paymentDate || dateKey(),
    receivedBy: user.id,
    receivedByName: user.name,
    note: String(input.note || ""),
    createdAt: nowIso()
  };
  db.payments.unshift(payment);
  refreshOrder(db, order);
  if (
    order.orderType !== "Instock" &&
    order.preorderStatus === "Pending Confirmation" &&
    order.paid >= order.requiredDeposit
  ) {
    order.preorderStatus = "Deposit Paid";
    order.status = "Deposit Paid";

    // Order is confirmed when the required deposit is received.
    order.orderDate = payment.paymentDate;
  }
  if (order.balance === 0 && order.preorderStatus === "Customer Balance Pending") {
    order.preorderStatus = "Ready for Customer";
    order.status = "Ready for Customer";
  }
  addTimeline(order, user, amount >= order.requiredDeposit ? "Payment recorded" : "Deposit paid", `${amount} MMK by ${payment.method}`);
  addAudit(db, user, "Payment recorded", "payment", payment.id, `${order.orderNumber}: ${amount} MMK`);
  return refreshOrder(db, order);
}

function addRefund(db, orderId, input, user) {
  assertRule(user.role === "Owner" || can(user, "payments:create"), "You do not have permission to process refunds", 403);
  const order = db.orders.find((item) => item.id === orderId);
  assertRule(order, "Order not found", 404);
  refreshOrder(db, order);
  const amount = toInt(input.amount);
  assertRule(amount > 0, "Refund amount must be greater than zero");
  const available = Math.max(order.paid - order.refunded, 0);
  assertRule(amount <= available, "Refund cannot exceed collected payment");
  const refund = {
    id: createId("refund"),
    orderId,
    customerId: order.customerId,
    amount,
    method: input.method || "KPay",
    reason: String(input.reason || "Refund"),
    refundDate: input.refundDate || dateKey(),
    processedBy: user.id,
    processedByName: user.name,
    createdAt: nowIso()
  };
  db.refunds.unshift(refund);
  addTimeline(order, user, "Refund processed", `${amount} MMK - ${refund.reason}`);
  addAudit(db, user, "Refund processed", "refund", refund.id, `${order.orderNumber}: ${amount} MMK`);
  return refreshOrder(db, order);
}

function changeOrderStatus(db, orderId, input, user) {
  assertRule(can(user, "orders:status") || can(user, "orders:edit"), "You do not have permission to update order status", 403);
  const order = db.orders.find((item) => item.id === orderId);
  assertRule(order, "Order not found", 404);
  assertRule(order.status !== "Cancelled", "Cancelled orders cannot be updated");

  const previousStatus = order.status;
  if (input.status) {
    assertRule(db.settings.orderStatuses.includes(input.status), "Invalid order status");
    order.status = input.status;
  }
  if (input.preorderStatus) {
    assertRule((db.settings.preorderStatuses || PREORDER_STATUSES).includes(input.preorderStatus), "Invalid preorder status");
    order.preorderStatus = input.preorderStatus;
    if ((db.settings.orderStatuses || ORDER_STATUSES).includes(input.preorderStatus)) order.status = input.preorderStatus;
  }
  if (input.packingStatus) {
    assertRule(db.settings.packingStatuses.includes(input.packingStatus), "Invalid packing status");
    order.packingStatus = input.packingStatus;
    if (input.packingStatus === "Packed") {
      order.packedBy = user.id;
      order.packedByName = user.name;
      order.packedAt = nowIso();
    }
  }
  if (input.deliveryStatus) {
    assertRule(db.settings.deliveryStatuses.includes(input.deliveryStatus), "Invalid delivery status");
    order.deliveryStatus = input.deliveryStatus;
  }
  if (Object.prototype.hasOwnProperty.call(input, "trackingNumber")) order.trackingNumber = String(input.trackingNumber || "");
  if (Object.prototype.hasOwnProperty.call(input, "batchId")) {
    order.batchId = String(input.batchId || "");
    for (const item of order.items) item.batchId = order.batchId;
  }
  if (Object.prototype.hasOwnProperty.call(input, "customerNotified")) order.customerNotified = input.customerNotified === true || input.customerNotified === "true";
  if (Array.isArray(input.itemArrivals)) {
    for (const arrival of input.itemArrivals) {
      const item = order.items.find((line) => line.id === arrival.itemId);
      if (item) {
        item.arrivalStatus = arrival.arrivalStatus || item.arrivalStatus;
        if (arrival.supplierStatus) item.supplierStatus = arrival.supplierStatus;
        if (arrival.cargoStatus) item.cargoStatus = arrival.cargoStatus;
        if (arrival.batchId !== undefined) item.batchId = String(arrival.batchId || "");
        if (arrival.expectedArrival) item.expectedArrival = arrival.expectedArrival;
        if (Object.prototype.hasOwnProperty.call(arrival, "customerNotified")) item.customerNotified = arrival.customerNotified === true || arrival.customerNotified === "true";
      }
    }
    const arrivedStates = new Set(["Arrived", "Checking", "Ready for Customer", "Delivered"]);
    const arrived = order.items.filter((item) => arrivedStates.has(item.arrivalStatus)).length;
    if (arrived > 0 && arrived < order.items.length) {
      order.status = "Partially Arrived";
      order.preorderStatus = "Arrived in Myanmar";
    }
    if (arrived === order.items.length) {
      order.status = "Arrived in Myanmar";
      order.preorderStatus = "Arrived in Myanmar";
    }
  }

  if (["Delivered", "Completed"].includes(order.status) || order.deliveryStatus === "Delivered") {
    finalizeOrderStock(db, order, user);
  }
  if (["Arrived", "Arrived in Myanmar", "Ready for Customer"].includes(order.status) && !input.packingStatus) {
    order.packingStatus = "To Pack";
  }
  order.updatedAt = nowIso();
  if (previousStatus !== order.status) {
    db.orderStatusHistory = db.orderStatusHistory || [];
    db.orderStatusHistory.unshift({
      id: createId("osh"),
      orderId: order.id,
      oldStatus: previousStatus,
      newStatus: order.status,
      changedBy: user.id,
      changedAt: nowIso(),
      note: input.note || ""
    });
  }
  const title = previousStatus === order.status ? "Order status updated" : `Status changed to ${order.status}`;
  addTimeline(order, user, title, input.note || "");
  addAudit(db, user, "Order status changed", "order", order.id, `${previousStatus} -> ${order.status}`);
  return refreshOrder(db, order);
}

function recordReturn(db, orderId, input, user) {
  const order = db.orders.find((item) => item.id === orderId);
  assertRule(order, "Order not found", 404);
  assertRule(order.status !== "Cancelled", "Cancelled orders cannot be returned");
  assertRule(Array.isArray(input.items) && input.items.length > 0, "Return items are required");
  const returnRecord = {
    id: createId("return"),
    orderId,
    customerId: order.customerId,
    reason: String(input.reason || "Return"),
    status: "Processed",
    processedBy: user.id,
    processedByName: user.name,
    returnDate: input.returnDate || dateKey(),
    createdAt: nowIso(),
    items: []
  };

  for (const returnItem of input.items) {
    const orderItem = order.items.find((line) => line.id === returnItem.orderItemId);
    assertRule(orderItem, "Return item not found on order");
    const quantity = toInt(returnItem.quantity);
    assertRule(quantity > 0 && quantity <= orderItem.quantity, "Invalid return quantity");
    const found = findVariant(db, orderItem.variantId);
    assertRule(found, "Variant not found");
    const resellable = returnItem.condition === "Resellable" || returnItem.resellable === true;
    found.variant.returned += quantity;
    if (resellable) {
      found.variant.stockOnHand += quantity;
    } else {
      found.variant.damaged += quantity;
    }
    addInventoryTransaction(db, user, {
      variantId: orderItem.variantId,
      quantity,
      action: resellable ? "Return Restocked" : "Return Damaged",
      relatedOrderId: order.id,
      note: input.reason || ""
    });
    returnRecord.items.push({
      id: createId("ret_item"),
      orderItemId: orderItem.id,
      productName: orderItem.productName,
      variantId: orderItem.variantId,
      color: orderItem.color,
      size: orderItem.size,
      quantity,
      condition: resellable ? "Resellable" : "Damaged"
    });
  }

  db.returns.unshift(returnRecord);
  order.status = "Returned";
  order.deliveryStatus = "Returned";
  addTimeline(order, user, "Return processed", returnRecord.reason);
  addAudit(db, user, "Return processed", "return", returnRecord.id, order.orderNumber);

  const refundAmount = toInt(input.refundAmount);
  if (refundAmount > 0) {
    addRefund(db, orderId, {
      amount: refundAmount,
      method: input.refundMethod || "KPay",
      reason: input.reason || "Return refund"
    }, user);
  }

  return refreshOrder(db, order);
}

function createProduct(db, input, user) {
  assertRule(user.role === "Owner", "Only owner can create products", 403);
  assertRule(input.name, "Product name is required");
  assertRule(input.sku, "SKU is required");
  assertRule(!db.products.some((product) => product.sku.toLowerCase() === String(input.sku).toLowerCase()), "Duplicate SKU is not allowed");
  const productId = createId("prod");
  const variants = (input.variants || []).map((variant) =>
    buildVariant(
      createId("var"),
      productId,
      String(variant.color || "Default"),
      String(variant.size || "Free"),
      toInt(variant.stockOnHand),
      toInt(variant.lowStockThreshold || db.settings.lowStockThreshold)
    )
  );
  assertRule(variants.length > 0, "At least one variant is required");
  const product = buildProduct({
    id: productId,
    sku: String(input.sku).trim(),
    name: String(input.name).trim(),
    category: input.category || "Tops",
    supplier: input.supplier || "",
    productType: input.productType || "Preorder",
    description: input.description || "",
    purchaseCost: toInt(input.purchaseCost),
    sellingPrice: toInt(input.sellingPrice),
    discountPrice: toInt(input.discountPrice),
    image: input.image || "",
    variants,
    supplierLink: input.supplierLink || "",
    supplierProductCode: input.supplierProductCode || "",
    supplierPrice: toInt(input.supplierPrice),
    estimatedProductCost: toInt(input.estimatedProductCost),
    defaultWaitingTime: input.defaultWaitingTime || db.settings.defaultWaitingTime,
    notes: input.notes || "",
    defaultCargoCost: toInt(input.defaultCargoCost)
  });
  if (Object.prototype.hasOwnProperty.call(input, "customerDescription")) product.customerDescription = String(input.customerDescription || "");
  if (Object.prototype.hasOwnProperty.call(input, "internalNotes")) product.internalNotes = String(input.internalNotes || "");
  product.active = input.active !== false && input.active !== "false";
  db.products.unshift(product);
  for (const variant of variants) {
    if (variant.stockOnHand > 0) {
      addInventoryTransaction(db, user, {
        variantId: variant.id,
        quantity: variant.stockOnHand,
        action: "Stock In",
        note: "Opening stock"
      });
    }
  }
  addAudit(db, user, "Product created", "product", product.id, product.name);
  return product;
}

function updateProduct(db, productId, input, user) {
  assertRule(user.role === "Owner", "Only owner can edit products", 403);
  const product = findProduct(db, productId);
  assertRule(product, "Product not found", 404);
  if (input.sku && db.products.some((item) => item.id !== productId && item.sku.toLowerCase() === String(input.sku).toLowerCase())) {
    throw new Error("Duplicate SKU is not allowed");
  }
  const oldCost = product.purchaseCost;
  const fields = [
    "sku",
    "name",
    "category",
    "supplier",
    "productType",
    "description",
    "supplierLink",
    "supplierProductCode",
    "defaultWaitingTime",
    "customerDescription",
    "internalNotes",
    "notes"
  ];
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) product[field] = input[field];
  }
  for (const moneyField of ["purchaseCost", "sellingPrice", "discountPrice", "defaultCargoCost", "supplierPrice", "estimatedProductCost"]) {
    if (Object.prototype.hasOwnProperty.call(input, moneyField)) product[moneyField] = toInt(input[moneyField]);
  }
  if (Object.prototype.hasOwnProperty.call(input, "active")) product.active = input.active !== false && input.active !== "false";
  if (Array.isArray(input.images)) product.images = input.images;
  if (input.image) product.images = [input.image, ...(product.images || []).filter((image) => image !== input.image)];
  if (Array.isArray(input.variants)) {
    const nextVariants = [];
    for (const inputVariant of input.variants) {
      const existing = inputVariant.id
        ? product.variants.find((variant) => variant.id === inputVariant.id)
        : product.variants.find((variant) => variant.color === inputVariant.color && variant.size === inputVariant.size);
      if (existing) {
        existing.color = String(inputVariant.color || existing.color);
        existing.size = String(inputVariant.size || existing.size);
        existing.lowStockThreshold = toInt(inputVariant.lowStockThreshold || existing.lowStockThreshold);
        if (Object.prototype.hasOwnProperty.call(inputVariant, "stockOnHand")) {
          const nextStock = toInt(inputVariant.stockOnHand);
          const delta = nextStock - existing.stockOnHand;
          existing.stockOnHand = nextStock;
          if (delta !== 0) {
            addInventoryTransaction(db, user, {
              variantId: existing.id,
              quantity: delta,
              action: "Adjustment",
              note: "Product variant stock edited"
            });
          }
        }
        existing.active = inputVariant.active !== false;
        nextVariants.push(existing);
      } else {
        const variant = buildVariant(
          createId("var"),
          product.id,
          String(inputVariant.color || "Default"),
          String(inputVariant.size || "Free"),
          toInt(inputVariant.stockOnHand),
          toInt(inputVariant.lowStockThreshold || db.settings.lowStockThreshold)
        );
        nextVariants.push(variant);
        addInventoryTransaction(db, user, {
          variantId: variant.id,
          quantity: variant.stockOnHand,
          action: "Stock In",
          note: "New variant"
        });
      }
    }
    product.variants = nextVariants;
    product.availableSizes = unique(nextVariants.map((variant) => variant.size));
    product.availableColors = unique(nextVariants.map((variant) => variant.color));
  }
  if (oldCost !== product.purchaseCost) {
    product.costHistory.unshift({
      id: createId("cost"),
      cost: product.purchaseCost,
      date: dateKey(),
      note: "Cost updated"
    });
  }
  product.updatedAt = nowIso();
  addAudit(db, user, "Product edited", "product", product.id, product.name);
  return product;
}

function adjustStock(db, productId, input, user) {
  assertRule(user.role === "Owner", "Only owner can adjust stock", 403);
  const product = findProduct(db, productId);
  assertRule(product, "Product not found", 404);
  const variant = product.variants.find((item) => item.id === input.variantId);
  assertRule(variant, "Variant not found");
  const quantity = toInt(input.quantity);
  assertRule(quantity !== 0, "Quantity cannot be zero");
  const nextStock = variant.stockOnHand + quantity;
  assertRule(nextStock >= 0, "Stock cannot become negative");
  assertRule(nextStock >= variant.reserved, "Stock cannot be lower than reserved quantity");
  variant.stockOnHand = nextStock;
  const action = input.action || (quantity > 0 ? "Stock In" : "Stock Out");
  addInventoryTransaction(db, user, {
    variantId: variant.id,
    quantity,
    action,
    note: input.note || ""
  });
  addAudit(db, user, "Stock changed", "product", product.id, `${product.name} ${variant.color}/${variant.size}: ${quantity}`);
  return product;
}

function updateCustomer(db, customerId, input, user) {
  const customer = findCustomer(db, customerId);
  assertRule(customer, "Customer not found", 404);
  for (const key of ["name", "phone", "contact", "address", "township", "deliveryMethod", "notes", "customerVisibleNotes", "internalNotes"]) {
    if (Object.prototype.hasOwnProperty.call(input, key)) customer[key] = input[key];
  }
  if (Array.isArray(input.tags)) customer.tags = input.tags;
  customer.updatedAt = nowIso();
  addAudit(db, user, "Customer edited", "customer", customer.id, customer.name);
  return customer;
}

function createExpense(db, input, user) {
  assertRule(user.role === "Owner", "Only owner can manage expenses", 403);
  const amount = toInt(input.amount);
  assertRule(amount > 0, "Expense amount must be greater than zero");
  const expense = {
    id: createId("expense"),
    category: input.category || "Other",
    amount,
    date: input.date || dateKey(),
    description: String(input.description || ""),
    paymentMethod: input.paymentMethod || "Cash",
    addedBy: user.id,
    addedByName: user.name,
    orderId: input.orderId || "",
    batchId: input.batchId || "",
    note: String(input.note || ""),
    createdAt: nowIso()
  };
  db.expenses.unshift(expense);
  addAudit(db, user, "Expense created", "expense", expense.id, `${expense.category}: ${amount} MMK`);
  return expense;
}

const MUSE_YANGON_CARGO_GROUPS = [
  {
    batches: ["B001", "B002", "B003"],
    fee: 111000
  },
  {
    batches: ["B004"],
    fee: 438200
  },
  {
    batches: ["B005", "B006"],
    fee: 304200
  },
  {
    batches: ["B007"],
    fee: 65300
  }
];

function getMuseYangonGroupFee(batchId) {
  const group = MUSE_YANGON_CARGO_GROUPS.find((group) =>
    group.batches.includes(batchId)
  );
  return group ? group.fee : 0;
}

function allocateCargoFeeToBatch(db, batch) {
  const group = MUSE_YANGON_CARGO_GROUPS.find((group) =>
    group.batches.includes(batch.batchId)
  );

  const groupBatchIds = group ? group.batches : [batch.batchId];

  // Use order_items.batchId as the source of truth.
  const orders = (db.orders || []).filter((order) =>
    (order.items || []).some((item) =>
      groupBatchIds.includes(item.batchId)
    )
  );

  const items = orders.flatMap((order) =>
    (order.items || []).filter((item) =>
      groupBatchIds.includes(item.batchId)
    )
  );

  if (!items.length) return;

  // Recalculate affected cargo costs from zero.
  items.forEach((item) => {
    item.cargoCost = 0;
  });

  // 1. China → Muse fee: allocate separately for each batch.
  for (const batchId of groupBatchIds) {
    const cargoBatch = (db.cargoBatches || []).find(
      (b) => b.batchId === batchId
    );

    if (!cargoBatch) continue;

    const batchItems = items.filter(
      (item) => item.batchId === batchId
    );

    const batchQuantity = batchItems.reduce(
      (sum, item) => sum + toInt(item.quantity),
      0
    );

    if (batchQuantity <= 0) continue;

    const chinaMuseFee = toInt(cargoBatch.chinaMuseCargoFee);
    let allocated = 0;

    batchItems.forEach((item, index) => {
      const quantity = toInt(item.quantity);

      if (index === batchItems.length - 1) {
        item.cargoCost += chinaMuseFee - allocated;
      } else {
        const share = Math.round(
          (chinaMuseFee * quantity) / batchQuantity
        );

        item.cargoCost += share;
        allocated += share;
      }
    });
  }

  // 2. Muse → Yangon fee: allocate once across the whole group.
  const museYangonFee = group
    ? getMuseYangonGroupFee(batch.batchId)
    : 0;

  const totalQuantity = items.reduce(
    (sum, item) => sum + toInt(item.quantity),
    0
  );

  if (totalQuantity > 0 && museYangonFee > 0) {
    let allocatedYangon = 0;

    items.forEach((item, index) => {
      const quantity = toInt(item.quantity);

      if (index === items.length - 1) {
        item.cargoCost += museYangonFee - allocatedYangon;
      } else {
        const share = Math.round(
          (museYangonFee * quantity) / totalQuantity
        );

        item.cargoCost += share;
        allocatedYangon += share;
      }
    });
  }

  // Refresh affected orders.
  for (const order of orders) {
    refreshOrder(db, order);
  }
}

function createCargoBatch(db, input, user) {
  const orderIds = Array.isArray(input.orderIds) ? input.orderIds : [];
  const batch = {
    id: createId("batch"),
    batchId: input.batchId || `B${String(db.cargoBatches.length + 1).padStart(3, "0")}`,
    route: input.route || "China -> Muse -> Yangon",
    chinaMuseCargoFee: toInt(input.chinaMuseCargoFee),
    museYangonCargoFee: getMuseYangonGroupFee(input.batchId),
    cargoFee:
      toInt(input.chinaMuseCargoFee) +
      getMuseYangonGroupFee(input.batchId),
    otherExpenses: toInt(input.otherExpenses),
    date: input.date || dateKey(),
    arrivalDate: input.arrivalDate || "",
    status: input.status || "Preparing",
    orderIds,
    productIds: Array.isArray(input.productIds) ? input.productIds : [],
    notes: input.notes || "",
    createdAt: nowIso()
  };
  db.cargoBatches.unshift(batch);
  for (const orderId of orderIds) {
    const order = db.orders.find((item) => item.id === orderId);
    if (!order) continue;
    order.batchId = batch.batchId;
    order.preorderStatus = batch.status === "Preparing" ? order.preorderStatus : "China -> Myanmar Cargo";
    order.status = order.preorderStatus;
    for (const item of order.items) {
      item.batchId = batch.batchId;
      item.cargoStatus = batch.status;
    }
    addTimeline(order, user, `Added to cargo batch ${batch.batchId}`, batch.route);
  }
  allocateCargoFeeToBatch(db, batch);
  saveDb(db);
  addAudit(db, user, "Cargo batch created", "cargo_batch", batch.id, batch.batchId);
  return batch;
}

function activeOrders(db) {
  return db.orders.filter((order) => order.status !== "Cancelled");
}

function inRange(dateValue, from, to) {
  const value = dateKey(dateValue);
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

function rangeFromPreset(preset = "today", from = "", to = "") {
  const today = new Date();
  const todayText = dateKey(today);
  if (preset === "custom") return { from, to };
  if (preset === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const key = dateKey(y);
    return { from: key, to: key };
  }
  if (preset === "this-week") {
    const start = new Date(today);
    const day = today.getDay() || 7;
    start.setDate(today.getDate() - day + 1);
    return { from: dateKey(start), to: todayText };
  }
  if (preset === "last-week") {
    const day = today.getDay() || 7;
    const start = new Date(today);
    start.setDate(today.getDate() - day - 6);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: dateKey(start), to: dateKey(end) };
  }
  if (preset === "this-month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: dateKey(start), to: todayText };
  }
  if (preset === "last-month") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: dateKey(start), to: dateKey(end) };
  }
  if (preset === "this-year") {
    const start = new Date(today.getFullYear(), 0, 1);
    return { from: dateKey(start), to: todayText };
  }
  if (preset === "last-year") {
    const start = new Date(today.getFullYear() - 1, 0, 1);
    const end = new Date(today.getFullYear() - 1, 11, 31);
    return { from: dateKey(start), to: dateKey(end) };
  }
  return { from: todayText, to: todayText };
}

function applyOrderFilters(db, orders, options = {}) {
  return orders.filter((order) => {
    if (options.productId && !(order.items || []).some((item) => item.productId === options.productId || item.variantId === options.productId)) return false;
    if (options.category) {
      const hasCategory = (order.items || []).some((item) => findProduct(db, item.productId)?.category === options.category);
      if (!hasCategory) return false;
    }
    if (options.customerId && order.customerId !== options.customerId) return false;
    if (options.staffId && order.createdBy !== options.staffId) return false;
    if (options.orderStatus && order.status !== options.orderStatus && order.preorderStatus !== options.orderStatus) return false;
    if (options.paymentStatus && order.paymentStatus !== options.paymentStatus) return false;
    if (options.orderType && order.orderType !== options.orderType) return false;
    if (options.cargoBatch && order.batchId !== options.cargoBatch) return false;
    if (options.deliveryMethod && order.deliveryMethod !== options.deliveryMethod) return false;
    return true;
  });
}

function computeReports(db, options = {}) {
  refreshAllOrders(db);
  const range = rangeFromPreset(options.preset || "today", options.from, options.to);
  const active = activeOrders(db);
  const orders = applyOrderFilters(db, active.filter((order) => inRange(order.orderDate, range.from, range.to)), options);
  const allActive = applyOrderFilters(db, active, options);
  const filteredOrderIds = new Set(orders.map((order) => order.id));
  const hasOrderFilters = [
    "productId",
    "category",
    "customerId",
    "staffId",
    "orderStatus",
    "paymentStatus",
    "orderType",
    "cargoBatch",
    "deliveryMethod"
  ].some((key) => options[key]);
  const payments = db.payments.filter((payment) => inRange(payment.paymentDate, range.from, range.to) && (!hasOrderFilters || filteredOrderIds.has(payment.orderId)));
  const refunds = db.refunds.filter((refund) => inRange(refund.refundDate, range.from, range.to) && (!hasOrderFilters || filteredOrderIds.has(refund.orderId)));
  const expenses = db.expenses.filter((expense) => inRange(expense.date, range.from, range.to));
  const grossSales = orders.reduce((sum, order) => sum + order.subtotal + order.deliveryFee, 0);
  const discounts = orders.reduce((sum, order) => sum + order.discount, 0);
  const orderRevenue = orders.reduce((sum, order) => sum + order.total, 0);
  const allActiveOrderIds = new Set(allActive.map((order) => order.id));
  const paidAmount = db.payments
    .filter((payment) => allActiveOrderIds.has(payment.orderId))
    .reduce((sum, payment) => sum + payment.amount, 0);
  const refundAmount = refunds.reduce((sum, refund) => sum + refund.amount, 0);
    const remainingBalance = orders
      .filter((order) => {
      const orderNumber = Number(String(order.orderNumber || "").replace("ORD-", ""));
      const excludedGreenOrders = new Set([
        2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,
        22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,
        40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,
        57,58,59,60,62,63,64,66,68,69,70,71,72,73,74,75,89
      ]);

      return !excludedGreenOrders.has(orderNumber);
    })
    .reduce((sum, order) => sum + Math.max(toInt(order.balance), 0), 0);
  const productCost = orders.reduce((sum, order) => sum + order.productCost, 0);
  const cargoCost = allActive.reduce((sum, order) => sum + order.cargoCost, 0);
  const shopDeliveryCost = orders.reduce((sum, order) => sum + toInt(order.shopDeliveryCost), 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const netSales = Math.max(orderRevenue - refundAmount, 0);
  const profitBeforeExpenses = orders.reduce((sum, order) => sum + order.netProfit, 0);
  const netProfit = profitBeforeExpenses - expenseTotal;
  const statusCounts = {};
  for (const status of db.settings.orderStatuses) statusCounts[status] = 0;
  for (const order of (orders.length || hasOrderFilters ? orders : allActive)) statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
  const lowStock = db.products.flatMap((product) =>
    product.variants
      .filter((variant) => variant.active !== false && variantAvailable(variant) <= (variant.lowStockThreshold ?? db.settings.lowStockThreshold))
      .map((variant) => ({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        variantId: variant.id,
        label: `${variant.color} / ${variant.size}`,
        available: variantAvailable(variant),
        threshold: variant.lowStockThreshold
      }))
  );

  const todayText = dateKey();
  const preorderOrders = allActive.filter((order) => ["Preorder", "Mixed Order"].includes(order.orderType));
  const overduePreorders = preorderOrders.filter((order) => order.expectedArrival && order.expectedArrival < todayText && !["Delivered", "Completed", "Cancelled", "Returned", "Returned / Refunded"].includes(order.status));
  const supplierPending = preorderOrders.filter((order) => ["Pending Confirmation", "Deposit Paid"].includes(order.preorderStatus));
  const cargoInTransit = preorderOrders.filter((order) => ["China -> Myanmar Cargo", "China -> Muse", "Muse -> Yangon", "In Transit", "In Transit to Yangon"].includes(order.preorderStatus) || ["China -> Myanmar Cargo", "China -> Muse", "Muse -> Yangon", "In Transit", "In Transit to Yangon"].includes(order.items?.[0]?.cargoStatus));
  const arrivedItems = preorderOrders.reduce((sum, order) => sum + (order.items || []).filter((item) => ["Arrived", "Checking", "Ready for Customer"].includes(item.arrivalStatus)).length, 0);
  const partialArrived = preorderOrders.filter((order) => order.status === "Partially Arrived").length;
  const readyForDelivery = preorderOrders.filter((order) => ["Ready for Customer", "Customer Balance Pending", "Ready for Delivery"].includes(order.status) || order.items?.some((item) => item.arrivalStatus === "Ready for Customer")).length;
  const needsAttention = [
    { label: "orders waiting for preorder purchase", count: supplierPending.length },
    { label: "overdue preorders", count: overduePreorders.length },
    { label: "arrived orders with remaining balance", count: preorderOrders.filter((order) => order.balance > 0 && (order.status === "Arrived in Myanmar" || order.status === "Ready for Customer" || order.items?.some((item) => item.arrivalStatus === "Arrived"))).length },
    { label: "items arrived but customer not notified", count: preorderOrders.filter((order) => order.items?.some((item) => ["Arrived", "Ready for Customer"].includes(item.arrivalStatus) && !item.customerNotified)).length },
    { label: "cargo batches awaiting processing", count: db.cargoBatches.filter((batch) => batch.status !== "Completed").length }
  ];

  return {
    range,
    orders: orders.length,
    grossSales,
    discounts,
    refunds: refundAmount,
    netSales,
    salesRevenue: orderRevenue,
    paidAmount,
    totalCollected: paidAmount,
    remainingBalance,
    productCost,
    cargoCost,
    shopDeliveryCost,
    expenses: expenseTotal,
    profitBeforeExpenses,
    netProfit,
    statusCounts,
    alerts: {
      waitingForDeposit: allActive.filter((order) => order.paymentStatus === "Unpaid").length,
      unpaidBalances: orders.filter((order) => order.balance > 0).length,
      readyToPack: allActive.filter((order) => ["Arrived", "Arrived in Myanmar", "Ready for Customer", "To Pack"].includes(order.status) || order.packingStatus === "To Pack").length,
      waitingCargo: allActive.filter((order) => ["Ordered from Supplier", "Waiting for Supplier", "Supplier Shipped", "Ordered", "In Production", "Waiting"].includes(order.status)).length,
      arrivedNotPacked: allActive.filter((order) => ["Arrived", "Arrived in Myanmar"].includes(order.status) && order.packingStatus !== "Packed").length,
      pendingReturns: db.returns.filter((item) => item.status !== "Completed").length,
      lowStock: lowStock.length,
      overduePreorders: overduePreorders.length
    },
    preorder: {
      waiting: preorderOrders.filter((order) => ["Pending Confirmation", "Deposit Paid", "Waiting for Supplier"].includes(order.preorderStatus)).length,
      supplierOrdered: preorderOrders.filter((order) => ["Ordered from Supplier", "Waiting for Supplier", "Supplier Shipped"].includes(order.preorderStatus)).length,
      cargoInTransit: cargoInTransit.length,
      arrivedItems,
      partialArrived,
      readyForDelivery,
      overdue: overduePreorders.length
    },
    needsAttention,
    lowStock
  };
}

function computeStaffSales(db, options = {}) {
  refreshAllOrders(db);
  const range = rangeFromPreset(options.preset || "this-month", options.from, options.to);
  return db.users.map((user) => {
    const orders = db.orders.filter((order) => order.createdBy === user.id && inRange(order.orderDate, range.from, range.to));
    const active = orders.filter((order) => order.status !== "Cancelled");
    const payments = db.payments.filter((payment) => payment.receivedBy === user.id && inRange(payment.paymentDate, range.from, range.to));
    return {
      userId: user.id,
      name: user.name,
      role: user.role,
      ordersCreated: orders.length,
      totalSales: active.reduce((sum, order) => sum + order.total, 0),
      paidAmount: payments.reduce((sum, payment) => sum + payment.amount, 0),
      cancelledOrders: orders.filter((order) => order.status === "Cancelled").length,
      returnedOrders: orders.filter((order) => order.status === "Returned").length
    };
  });
}

function customerStats(db, customerId) {
  const orders = db.orders.filter((order) => order.customerId === customerId);
  const active = orders.filter((order) => order.status !== "Cancelled");
  const activePreorders = active.filter((order) => ["Preorder", "Mixed Order"].includes(order.orderType) && !["Delivered", "Completed", "Returned", "Returned / Refunded"].includes(order.status));
  return {
    totalOrders: orders.length,
    totalSpent: active.reduce((sum, order) => sum + order.total, 0),
    remainingBalance: active.reduce((sum, order) => sum + order.balance, 0),
    activePreorders: activePreorders.length,
    completedOrders: orders.filter((order) => ["Delivered", "Completed"].includes(order.status)).length,
    lastOrder: orders[0]?.orderDate || "",
    cancelledOrders: orders.filter((order) => order.status === "Cancelled").length,
    returnedOrders: orders.filter((order) => ["Returned", "Returned / Refunded"].includes(order.status)).length,
    deliveryHistory: orders
      .filter((order) => order.deliveryStatus === "Delivered")
      .slice(0, 5)
      .map((order) => ({ orderNumber: order.orderNumber, date: order.orderDate, method: order.deliveryMethod }))
  };
}

function decorateDbForClient(db, user) {
  refreshAllOrders(db);
  const customers = db.customers.map((customer) => ({ ...customer, stats: customerStats(db, customer.id) }));
  return {
    user: publicUser(user),
    settings: db.settings,
    suppliers: db.suppliers || [],
    products: db.products,
    customers,
    orders: db.orders,
    payments: db.payments,
    refunds: db.refunds,
    returns: db.returns,
    expenses: db.expenses,
    inventoryTransactions: db.inventoryTransactions,
    cargoBatches: db.cargoBatches,
    auditLogs: user.role === "Owner" ? db.auditLogs : db.auditLogs.filter((log) => log.userId === user.id),
    notifications: generateNotifications(db),
    reports: computeReports(db, { preset: "today" }),
    staffSales: user.role === "Owner" ? computeStaffSales(db) : computeStaffSales(db).filter((row) => row.userId === user.id)
  };
}

function generateNotifications(db) {
  refreshAllOrders(db);
  const dismissed = new Set(db.dismissedNotifications || []);
  const notifications = [];
  const todayText = dateKey();
  for (const order of activeOrders(db)) {
    if (order.balance > 0) {
      notifications.push({
        id: `balance_${order.id}`,
        type: "Payment",
        title: `${order.orderNumber} has remaining balance`,
        body: `${order.balance.toLocaleString()} MMK remains for ${findCustomer(db, order.customerId)?.name || "customer"}.`
      });
    }
    if (order.expectedArrival && order.expectedArrival < todayText && !["Delivered", "Completed", "Cancelled", "Returned", "Returned / Refunded"].includes(order.status)) {
      notifications.push({
        id: `overdue_${order.id}`,
        type: "Preorder",
        title: `${order.orderNumber} is delayed`,
        body: `Expected arrival was ${order.expectedArrival}.`
      });
    }
    if (["Pending Confirmation", "Deposit Paid"].includes(order.preorderStatus) && order.paymentStatus !== "Unpaid") {
      notifications.push({
        id: `supplier_${order.id}`,
        type: "Preorder",
        title: `${order.orderNumber} is ready for preorder purchase`,
        body: "Deposit is recorded. Continue the preorder tracking step."
      });
    }
    if ((order.status === "Arrived" || order.status === "Arrived in Myanmar" || order.packingStatus === "To Pack") && !order.customerNotified) {
      notifications.push({
        id: `pack_${order.id}`,
        type: "Packing",
        title: `${order.orderNumber} has arrived`,
        body: "Check the item, notify the customer, and collect any remaining balance."
      });
    }
    if (order.balance === 0 && ["Ready for Customer", "Ready for Delivery"].includes(order.status) && order.deliveryStatus !== "Delivered") {
      notifications.push({
        id: `delivery_${order.id}`,
        type: "Delivery",
        title: `${order.orderNumber} is ready for delivery`,
        body: `${order.deliveryMethod} order is fully paid.`
      });
    }
  }
  for (const batch of db.cargoBatches) {
    if (["Arrived at Muse", "Arrived in Yangon"].includes(batch.status)) {
      notifications.push({
        id: `batch_${batch.id}`,
        type: "Cargo",
        title: `Batch ${batch.batchId} has arrived`,
        body: batch.status
      });
    }
  }
  for (const product of db.products) {
    if (product.productType === "Preorder") continue;
    for (const variant of product.variants) {
      const available = variantAvailable(variant);
      if (available <= (variant.lowStockThreshold ?? db.settings.lowStockThreshold)) {
        notifications.push({
          id: `stock_${variant.id}`,
          type: "Inventory",
          title: `${product.name} / ${variant.color} / ${variant.size} has only ${available} left`,
          body: `SKU ${product.sku}`
        });
      }
    }
  }
  return notifications.filter((item) => !dismissed.has(item.id)).slice(0, 30);
}

function searchAll(db, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const results = [];
  for (const order of db.orders) {
    const customer = findCustomer(db, order.customerId);
    const haystack = [
      order.orderNumber,
      customer?.name,
      customer?.phone,
      order.trackingNumber,
      order.batchId,
      ...order.items.flatMap((item) => {
        const product = findProduct(db, item.productId);
        return [item.productName, item.sku, item.color, item.size, product?.supplierProductCode, product?.supplier];
      })
    ].join(" ").toLowerCase();
    if (haystack.includes(q)) {
      results.push({
        type: "Order",
        id: order.id,
        title: order.orderNumber,
        subtitle: `${customer?.name || ""} - ${order.status}`,
        amount: order.total
      });
    }
  }
  for (const product of db.products) {
    const haystack = [product.name, product.sku, product.category, product.supplier, product.supplierProductCode, product.supplierLink].join(" ").toLowerCase();
    if (haystack.includes(q)) {
      results.push({
        type: "Product",
        id: product.id,
        title: product.name,
        subtitle: `${product.sku} - ${product.category}`,
        amount: product.sellingPrice
      });
    }
  }
  for (const customer of db.customers) {
    const haystack = [customer.name, customer.phone, customer.contact, customer.address, customer.township].join(" ").toLowerCase();
    if (haystack.includes(q)) {
      results.push({
        type: "Customer",
        id: customer.id,
        title: customer.name,
        subtitle: `${customer.phone} - ${customer.township}`,
        amount: customerStats(db, customer.id).totalSpent
      });
    }
  }
  for (const batch of db.cargoBatches) {
    const haystack = [batch.batchId, batch.route, batch.status, batch.notes, ...(batch.orderIds || [])].join(" ").toLowerCase();
    if (haystack.includes(q)) {
      results.push({
        type: "Cargo",
        id: batch.id,
        title: batch.batchId,
        subtitle: `${batch.route} - ${batch.status}`,
        amount: batch.cargoFee
      });
    }
  }
  return results.slice(0, 25);
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
}

function exportRows(db, entity, options = {}) {
  refreshAllOrders(db);
  const range = rangeFromPreset(options.preset || "this-year", options.from, options.to);
  const hasDateFilter = Boolean(options.preset || options.from || options.to);
  const filteredOrders = applyOrderFilters(
    db,
    activeOrders(db).filter((order) => !hasDateFilter ? true : inRange(order.orderDate, range.from, range.to)),
    options
  );
  const filteredOrderIds = new Set(filteredOrders.map((order) => order.id));
  const hasOrderFilters = [
    "productId",
    "category",
    "customerId",
    "staffId",
    "orderStatus",
    "paymentStatus",
    "orderType",
    "cargoBatch",
    "deliveryMethod"
  ].some((key) => options[key]);
  if (entity === "orders") {
    return filteredOrders.map((order) => ({
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      customer: findCustomer(db, order.customerId)?.name || "",
      status: order.status,
      preorderStatus: order.preorderStatus,
      paymentStatus: order.paymentStatus,
      total: order.total,
      paid: order.paid,
      remainingBalance: order.balance,
      expectedArrival: order.expectedArrival,
      cargoBatch: order.batchId,
      profit: order.netProfit
    }));
  }
  if (entity === "products") {
    return db.products.flatMap((product) =>
      product.variants.map((variant) => ({
        sku: product.sku,
        product: product.name,
        category: product.category,
        type: product.productType,
        color: variant.color,
        size: variant.size,
        stockOnHand: variant.stockOnHand,
        reserved: variant.reserved,
        available: variantAvailable(variant),
        sold: variant.sold,
        purchaseCost: product.purchaseCost,
        sellingPrice: product.sellingPrice
      }))
    );
  }
  if (entity === "customers") {
    return db.customers.map((customer) => ({ ...customerStats(db, customer.id), name: customer.name, phone: customer.phone, township: customer.township }));
  }
  if (entity === "payments") return db.payments.filter((payment) => (!hasDateFilter || inRange(payment.paymentDate, range.from, range.to)) && (!hasOrderFilters || filteredOrderIds.has(payment.orderId)));
  if (entity === "expenses") return db.expenses.filter((expense) => !hasDateFilter || inRange(expense.date, range.from, range.to));
  if (entity === "inventory") return db.inventoryTransactions;
  if (entity === "profit") {
    return filteredOrders.map((order) => ({
      orderNumber: order.orderNumber,
      salesRevenue: order.total,
      totalCollected: order.paid,
      remainingBalance: order.balance,
      refunds: order.refunded,
      productCost: order.productCost,
      cargoCost: order.cargoCost,
      shopDeliveryCost: order.shopDeliveryCost,
      profit: order.netProfit
    }));
  }
  return [];
}

function normalizeProduct(product, db) {
  let changed = false;
  if (!Array.isArray(product.images)) {
    product.images = product.image ? [product.image] : [];
    changed = true;
  }
  if (!Array.isArray(product.variants)) {
    product.variants = [];
    changed = true;
  }
  for (const variant of product.variants) {
    if (!variant.productId) {
      variant.productId = product.id;
      changed = true;
    }
    for (const key of ["reserved", "sold", "returned", "damaged"]) {
      if (variant[key] === undefined) {
        variant[key] = 0;
        changed = true;
      }
    }
    if (variant.lowStockThreshold === undefined) {
      variant.lowStockThreshold = db.settings.lowStockThreshold;
      changed = true;
    }
    if (variant.active === undefined) {
      variant.active = true;
      changed = true;
    }
  }
  const sizes = unique(product.variants.map((variant) => variant.size));
  const colors = unique(product.variants.map((variant) => variant.color));
  const defaults = {
    supplierProductCode: "",
    supplierPrice: toInt(product.purchaseCost),
    estimatedProductCost: toInt(product.purchaseCost) + toInt(product.defaultCargoCost),
    defaultWaitingTime: db.settings.defaultWaitingTime,
    availableSizes: sizes,
    availableColors: colors,
    customerDescription: product.description || "",
    internalNotes: product.notes || "",
    defaultCargoCost: toInt(product.defaultCargoCost),
    active: product.active !== false
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (product[key] === undefined || product[key] === null) {
      product[key] = value;
      changed = true;
    }
  }
  if (!Array.isArray(product.costHistory) || !product.costHistory.length) {
    product.costHistory = [{ id: createId("cost"), cost: toInt(product.purchaseCost), date: dateKey(product.createdAt || undefined), note: "Initial cost" }];
    changed = true;
  }
  return changed;
}

function normalizeOrder(order, db) {
  let changed = false;
  if (!Array.isArray(order.timeline)) {
    order.timeline = [];
    changed = true;
  }
  if (!Array.isArray(order.items)) {
    order.items = [];
    changed = true;
  }
  if (!order.orderType) {
    order.orderType = "Preorder";
    changed = true;
  }
  if (!order.status) {
    order.status = "Pending Confirmation";
    changed = true;
  }
  if (!order.preorderStatus) {
    order.preorderStatus = order.status === "New" ? "Pending Confirmation" : order.status;
    changed = true;
  }
  if (!order.waitingTime) {
    order.waitingTime = db.settings.defaultWaitingTime;
    changed = true;
  }
  if (!order.expectedArrival) {
    order.expectedArrival = expectedArrivalDate(order.orderDate, order.waitingTime);
    changed = true;
  }
  if (order.customerNotified === undefined) {
    order.customerNotified = false;
    changed = true;
  }
  if (order.batchId === undefined) {
    order.batchId = "";
    changed = true;
  }
  for (const item of order.items) {
    const product = findProduct(db, item.productId);
    if (!item.supplierStatus) {
      item.supplierStatus = "Pending";
      changed = true;
    }
    if (!item.cargoStatus) {
      item.cargoStatus = "Waiting";
      changed = true;
    }
    if (!item.arrivalStatus) {
      item.arrivalStatus = "Waiting";
      changed = true;
    }
    if (!item.expectedArrival) {
      item.expectedArrival = expectedArrivalDate(order.orderDate, product?.defaultWaitingTime || order.waitingTime || db.settings.defaultWaitingTime);
      changed = true;
    }
    if (item.batchId === undefined) {
      item.batchId = order.batchId || "";
      changed = true;
    }
    if (item.customerNotified === undefined) {
      item.customerNotified = false;
      changed = true;
    }
    if (item.purchaseCost === undefined) {
      item.purchaseCost = toInt(product?.purchaseCost);
      changed = true;
    }
    if (item.cargoCost === undefined) {
      item.cargoCost = toInt(product?.defaultCargoCost);
      changed = true;
    }
  }
  const requiredDeposit = db.settings.defaultDepositPerItem * order.items.reduce((sum, item) => sum + toInt(item.quantity), 0);
  if (!order.requiredDeposit) {
    order.requiredDeposit = requiredDeposit;
    changed = true;
  }
  return changed;
}

function normalizeDb(db) {
  let changed = false;
  db.settings = db.settings || {};
  const settingDefaults = {
    defaultDepositPerItem: 10000,
    defaultWaitingTime: "4 Weeks & Above",
    lowStockThreshold: 3,
    allowOverpayment: false,
    gateRule: "All Prepaid",
    paymentMethods: ["KPay", "WavePay", "Bank Transfer", "Cash", "Other"],
    deliveryMethods: ["Deli", "Royal Express", "Other Delivery", "Pickup", "Gate"],
    productCategories: ["Tops", "Pants", "Bags", "Accessories"],
    customerTags: ["New Customer", "Regular Customer", "VIP", "Preorder Customer", "Instock Customer", "Problem Order", "High Value Customer"],
    staffPermissions: []
  };
  for (const [key, value] of Object.entries(settingDefaults)) {
    if (db.settings[key] === undefined) {
      db.settings[key] = value;
      changed = true;
    }
  }
  const listSettings = {
    orderStatuses: ORDER_STATUSES,
    packingStatuses: PACKING_STATUSES,
    deliveryStatuses: DELIVERY_STATUSES,
    preorderStatuses: PREORDER_STATUSES,
    itemPreorderStatuses: ITEM_PREORDER_STATUSES,
    cargoStatuses: CARGO_STATUSES,
    cargoRoutes: CARGO_ROUTES,
    expenseCategories: ["Cargo", "Delivery", "Packaging", "Marketing", "Advertising", "Platform Fees", "Supplier", "Supplier Related", "Refund", "Other"]
  };
  for (const [key, values] of Object.entries(listSettings)) {
    const merged = mergeUnique(values, db.settings[key]);
    if (JSON.stringify(db.settings[key] || []) !== JSON.stringify(merged)) {
      db.settings[key] = merged;
      changed = true;
    }
  }
  for (const key of ["users", "customers", "products", "orders", "payments", "refunds", "returns", "expenses", "inventoryTransactions", "cargoBatches", "auditLogs", "dismissedNotifications", "orderStatusHistory", "suppliers"]) {
    if (!Array.isArray(db[key])) {
      db[key] = [];
      changed = true;
    }
  }
  for (const product of db.products) {
    if (normalizeProduct(product, db)) changed = true;
  }
  for (const customer of db.customers) {
    if (!customer.customerCode) {
      customer.customerCode = nextCustomerCode(db);
      changed = true;
    }
    if (customer.customerVisibleNotes === undefined) {
      customer.customerVisibleNotes = "";
      changed = true;
    }
    if (customer.internalNotes === undefined) {
      customer.internalNotes = customer.notes || "";
      changed = true;
    }
  }
  for (const order of db.orders) {
    if (normalizeOrder(order, db)) changed = true;
  }
  for (const batch of db.cargoBatches) {
    if (!Array.isArray(batch.orderIds)) {
      batch.orderIds = [];
      changed = true;
    }
    if (!Array.isArray(batch.productIds)) {
      batch.productIds = [];
      changed = true;
    }
    if (batch.otherExpenses === undefined) {
      batch.otherExpenses = 0;
      changed = true;
    }
    if (!batch.route) {
      batch.route = "China -> Muse -> Yangon";
      changed = true;
    }
  }
  const suppliers = unique(db.products.map((product) => product.supplier)).map((name) => {
    const product = db.products.find((item) => item.supplier === name);
    return {
      id: `supplier_${crypto.createHash("sha1").update(name).digest("hex").slice(0, 10)}`,
      name,
      platform: product?.supplierLink ? "China Marketplace" : "",
      supplierLink: product?.supplierLink || "",
      contact: "",
      note: product?.internalNotes || product?.notes || "",
      productCost: toInt(product?.purchaseCost),
      supplierStatus: "Active"
    };
  });
  if (JSON.stringify(db.suppliers || []) !== JSON.stringify(suppliers)) {
    db.suppliers = suppliers;
    changed = true;
  }
  return changed;
}

let persistQueue = Promise.resolve();

async function ensureDb() {
  await mysqlStore.migrate();
  const db = await mysqlStore.loadDb(createBaseDb);
  const migrated = normalizeDb(db);
  refreshAllOrders(db);
  if (migrated || !(db.users || []).length) {
    await mysqlStore.saveDb(db);
  }
  return db;
}

function saveDb(db) {
  persistQueue = persistQueue.then(() => mysqlStore.saveDb(db));
  return persistQueue;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function getToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return "";
}

function requireAuth(db, req) {
  const token = getToken(req);
  const userId = sessions.get(token);
  const user = userId ? findUser(db, userId) : null;
  assertRule(user && user.active !== false, "Authentication required", 401);
  return user;
}

function routeMatch(pathname, pattern) {
  const pathParts = pathname.split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);
  if (pathParts.length !== patternParts.length) return null;
  const params = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    const pathPart = pathParts[index];
    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart);
    } else if (patternPart !== pathPart) {
      return null;
    }
  }
  return params;
}

async function handleApi(req, res, db) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  const method = req.method || "GET";

  if (method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, time: nowIso() });
  }

  if (method === "POST" && pathname === "/api/auth/setup") {
  const body = await parseBody(req);

  const owner = createOwnerAccount(db, {
    name: body.name,
    email: body.email,
    password: body.password
  });

  saveDb(db);

  return sendJson(res, 201, {
    user: publicUser(owner)
  });
}

  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await parseBody(req);
    const user = db.users.find((item) => item.email.toLowerCase() === String(body.email || "").toLowerCase() && item.active !== false);
    assertRule(user && verifyPassword(body.password, user.passwordHash), "Invalid email or password", 401);
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, user.id);
    addAudit(db, user, "Logged in", "user", user.id, user.email);
    saveDb(db);
    return sendJson(res, 200, { token, user: publicUser(user) });
  }

  const user = requireAuth(db, req);

  if (method === "POST" && pathname === "/api/auth/logout") {
    sessions.delete(getToken(req));
    return sendJson(res, 200, { ok: true });
  }

  if (method === "GET" && pathname === "/api/auth/me") {
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (method === "GET" && pathname === "/api/app") {
    return sendJson(res, 200, decorateDbForClient(db, user));
  }

  if (method === "GET" && pathname === "/api/products") {
    return sendJson(res, 200, { products: db.products });
  }
  if (method === "POST" && pathname === "/api/products") {
    const product = createProduct(db, await parseBody(req), user);
    saveDb(db);
    return sendJson(res, 201, { product });
  }
  let params = routeMatch(pathname, "/api/products/:id");
  if (params && method === "PUT") {
    const product = updateProduct(db, params.id, await parseBody(req), user);
    saveDb(db);
    return sendJson(res, 200, { product });
  }
  if (params && method === "DELETE") {
    assertRule(user.role === "Owner", "Only owner can delete products", 403);
    const product = findProduct(db, params.id);
    assertRule(product, "Product not found", 404);
    product.active = false;
    product.updatedAt = nowIso();
    addAudit(db, user, "Product soft deleted", "product", product.id, product.name);
    saveDb(db);
    return sendJson(res, 200, { product });
  }
  params = routeMatch(pathname, "/api/products/:id/stock");
  if (params && method === "POST") {
    const product = adjustStock(db, params.id, await parseBody(req), user);
    saveDb(db);
    return sendJson(res, 200, { product });
  }

  if (method === "GET" && pathname === "/api/customers") {
    return sendJson(res, 200, { customers: db.customers.map((customer) => ({ ...customer, stats: customerStats(db, customer.id) })) });
  }
  if (method === "POST" && pathname === "/api/customers") {
    assertRule(can(user, "customers:manage") || user.role === "Owner", "You do not have permission to manage customers", 403);
    const customer = createOrUpdateCustomer(db, await parseBody(req), user);
    saveDb(db);
    return sendJson(res, 201, { customer: { ...customer, stats: customerStats(db, customer.id) } });
  }
  params = routeMatch(pathname, "/api/customers/:id");
  if (params && method === "PUT") {
    assertRule(can(user, "customers:manage") || user.role === "Owner", "You do not have permission to manage customers", 403);
    const customer = updateCustomer(db, params.id, await parseBody(req), user);
    saveDb(db);
    return sendJson(res, 200, { customer: { ...customer, stats: customerStats(db, customer.id) } });
  }

  if (method === "GET" && pathname === "/api/orders") {
    return sendJson(res, 200, { orders: db.orders });
  }
  if (method === "POST" && pathname === "/api/orders") {
    const order = createOrder(db, await parseBody(req), user);
    saveDb(db);
    return sendJson(res, 201, { order });
  }
  params = routeMatch(pathname, "/api/orders/:id");
  if (params && method === "PUT") {
    const order = updateOrder(db, params.id, await parseBody(req), user);
    saveDb(db);
    return sendJson(res, 200, { order });
  }
  params = routeMatch(pathname, "/api/orders/:id/cancel");
  if (params && method === "POST") {
    const order = cancelOrder(db, params.id, (await parseBody(req)).reason, user);
    saveDb(db);
    return sendJson(res, 200, { order });
  }
  params = routeMatch(pathname, "/api/orders/:id/payments");
  if (params && method === "POST") {
    const order = addPayment(db, params.id, await parseBody(req), user);
    saveDb(db);
    return sendJson(res, 201, { order });
  }
  params = routeMatch(pathname, "/api/orders/:id/refunds");
  if (params && method === "POST") {
    const order = addRefund(db, params.id, await parseBody(req), user);
    saveDb(db);
    return sendJson(res, 201, { order });
  }
  params = routeMatch(pathname, "/api/orders/:id/returns");
  if (params && method === "POST") {
    const order = recordReturn(db, params.id, await parseBody(req), user);
    saveDb(db);
    return sendJson(res, 201, { order });
  }
  params = routeMatch(pathname, "/api/orders/:id/status");
  if (params && method === "POST") {
    const order = changeOrderStatus(db, params.id, await parseBody(req), user);
    saveDb(db);
    return sendJson(res, 200, { order });
  }

  if (method === "GET" && pathname === "/api/inventory") {
    return sendJson(res, 200, { inventoryTransactions: db.inventoryTransactions });
  }

  if (method === "GET" && pathname === "/api/expenses") {
    assertRule(user.role === "Owner", "Only owner can view expenses", 403);
    return sendJson(res, 200, { expenses: db.expenses });
  }
  if (method === "POST" && pathname === "/api/expenses") {
    const expense = createExpense(db, await parseBody(req), user);
    saveDb(db);
    return sendJson(res, 201, { expense });
  }

  if (method === "GET" && pathname === "/api/cargo-batches") {
    return sendJson(res, 200, { cargoBatches: db.cargoBatches });
  }
  if (method === "POST" && pathname === "/api/cargo-batches") {
    const batch = createCargoBatch(db, await parseBody(req), user);
    saveDb(db);
    return sendJson(res, 201, { batch });
  }
  params = routeMatch(pathname, "/api/cargo-batches/:id");
  if (params && method === "PUT") {
    const batch = db.cargoBatches.find((item) => item.id === params.id);
    assertRule(batch, "Cargo batch not found", 404);
    const body = await parseBody(req);
    for (const key of ["batchId", "route", "date", "arrivalDate", "status", "notes"]) {
      if (Object.prototype.hasOwnProperty.call(body, key)) batch[key] = body[key];
    }
    if (Object.prototype.hasOwnProperty.call(body, "chinaMuseCargoFee")) {
      batch.chinaMuseCargoFee = toInt(body.chinaMuseCargoFee);
    }

    batch.museYangonCargoFee = getMuseYangonGroupFee(batch.batchId);

    batch.cargoFee =
      toInt(batch.chinaMuseCargoFee) +
      toInt(batch.museYangonCargoFee);
    if (Object.prototype.hasOwnProperty.call(body, "otherExpenses")) batch.otherExpenses = toInt(body.otherExpenses);
    if (Array.isArray(body.productIds)) batch.productIds = body.productIds;
    if (Array.isArray(body.orderIds)) {
      batch.orderIds = body.orderIds;
      for (const orderId of body.orderIds) {
        const order = db.orders.find((item) => item.id === orderId);
        if (!order) continue;
        order.batchId = batch.batchId;
        if (batch.status && batch.status !== "Preparing") {
          order.preorderStatus = batch.status === "Completed" ? order.preorderStatus : "China -> Myanmar Cargo";
          if ((db.settings.orderStatuses || ORDER_STATUSES).includes(order.preorderStatus)) order.status = order.preorderStatus;
        }
        for (const item of order.items) {
          item.batchId = batch.batchId;
          item.cargoStatus = batch.status || item.cargoStatus;
        }
      }
    }
    allocateCargoFeeToBatch(db, batch);
    addAudit(db, user, "Cargo batch edited", "cargo_batch", batch.id, batch.batchId);
    saveDb(db);
    return sendJson(res, 200, { batch });
  }

  if (method === "GET" && pathname === "/api/reports/summary") {
    const report = computeReports(db, {
      preset: url.searchParams.get("preset") || "today",
      from: url.searchParams.get("from") || "",
      to: url.searchParams.get("to") || "",
      productId: url.searchParams.get("productId") || "",
      category: url.searchParams.get("category") || "",
      customerId: url.searchParams.get("customerId") || "",
      staffId: url.searchParams.get("staffId") || "",
      orderStatus: url.searchParams.get("orderStatus") || "",
      paymentStatus: url.searchParams.get("paymentStatus") || "",
      orderType: url.searchParams.get("orderType") || "",
      cargoBatch: url.searchParams.get("cargoBatch") || "",
      deliveryMethod: url.searchParams.get("deliveryMethod") || ""
    });
    return sendJson(res, 200, { report });
  }
  if (method === "GET" && pathname === "/api/reports/staff") {
    const rows = computeStaffSales(db, {
      preset: url.searchParams.get("preset") || "this-month",
      from: url.searchParams.get("from") || "",
      to: url.searchParams.get("to") || ""
    });
    return sendJson(res, 200, { staffSales: user.role === "Owner" ? rows : rows.filter((row) => row.userId === user.id) });
  }

  if (method === "GET" && pathname === "/api/search") {
    return sendJson(res, 200, { results: searchAll(db, url.searchParams.get("q")) });
  }

  if (method === "GET" && pathname === "/api/audit") {
    return sendJson(res, 200, { auditLogs: user.role === "Owner" ? db.auditLogs : db.auditLogs.filter((log) => log.userId === user.id) });
  }

  if (method === "GET" && pathname === "/api/notifications") {
    return sendJson(res, 200, { notifications: generateNotifications(db) });
  }
  params = routeMatch(pathname, "/api/notifications/:id/dismiss");
  if (params && method === "POST") {
    db.dismissedNotifications = Array.from(new Set([...(db.dismissedNotifications || []), params.id]));
    saveDb(db);
    return sendJson(res, 200, { notifications: generateNotifications(db) });
  }

  if (method === "GET" && pathname === "/api/settings") {
    return sendJson(res, 200, { settings: db.settings });
  }
  if (method === "PUT" && pathname === "/api/settings") {
    assertRule(user.role === "Owner", "Only owner can update settings", 403);
    const body = await parseBody(req);
    db.settings = { ...db.settings, ...body };
    addAudit(db, user, "Settings updated", "settings", "settings", "Store settings changed");
    saveDb(db);
    return sendJson(res, 200, { settings: db.settings });
  }

  params = routeMatch(pathname, "/api/export/:entity");
  if (params && method === "GET") {
    const csv = toCsv(exportRows(db, params.entity, Object.fromEntries(url.searchParams.entries())));
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tofus-${params.entity}.csv"`
    });
    return res.end(csv);
  }

  return sendJson(res, 404, { error: "API route not found" });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendText(res, 403, "Forbidden");
  fs.readFile(filePath, (error, content) => {
    if (error) return sendText(res, 404, "Not found");
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml"
    };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(content);
  });
}

async function createServer() {
  const db = await ensureDb();

  return http.createServer(async (req, res) => {
    try {
      if ((req.url || "").startsWith("/api/")) {
        await handleApi(req, res, db);
      } else {
        serveStatic(req, res);
      }
    } catch (error) {
      const status = error.status || 500;
      sendJson(res, status, { error: error.message || "Server error" });
    }
  });
}

if (require.main === module) {
  createServer().then((server) => {
    server.listen(PORT, () => {
      console.log(`Tofu's Closet POS running at http://localhost:${PORT}`);
    });
  }).catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}

module.exports = {
  createBaseDb,
  createOrder,
  updateOrder,
  createProduct,
  updateProduct,
  cancelOrder,
  addPayment,
  addRefund,
  changeOrderStatus,
  createCargoBatch,
  createExpense,
  recordReturn,
  calculateOrderFinancials,
  allocateCargoFeeToBatch,
  computeReports,
  computeStaffSales,
  findVariant,
  variantAvailable,
  hashPassword,
  verifyPassword
};

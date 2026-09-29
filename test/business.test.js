const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createBaseDb,
  createOrder,
  updateOrder,
  createProduct,
  updateProduct,
  cancelOrder,
  addPayment,
  changeOrderStatus,
  createCargoBatch,
  recordReturn,
  computeReports,
  findVariant,
  variantAvailable
} = require("../server");

function owner(db) {
  return db.users.find((user) => user.role === "Owner");
}

test("creating, editing, and cancelling an order recalculates reserved inventory", () => {
  const db = createBaseDb();
  const user = owner(db);
  const blackM = findVariant(db, "v_baby_black_m").variant;
  const blackL = findVariant(db, "v_baby_black_l").variant;

  const order = createOrder(db, {
    customerId: "c_may",
    orderType: "Instock",
    items: [{ variantId: "v_baby_black_m", quantity: 2, unitPrice: 30000 }]
  }, user);

  assert.equal(blackM.reserved, 2);
  assert.equal(variantAvailable(blackM), 6);
  assert.equal(order.total, 60000);

  updateOrder(db, order.id, {
    items: [{ variantId: "v_baby_black_l", quantity: 1, unitPrice: 30000 }]
  }, user);

  assert.equal(blackM.reserved, 0);
  assert.equal(blackL.reserved, 1);
  assert.equal(variantAvailable(blackL), 2);

  cancelOrder(db, order.id, "Customer cancelled before fulfillment", user);

  assert.equal(blackL.reserved, 0);
  assert.equal(db.orders[0].status, "Cancelled");
  assert.equal(computeReports(db, { preset: "today" }).orders, 0);
});

test("payments update paid amount, balance, and payment status", () => {
  const db = createBaseDb();
  const user = owner(db);
  const order = createOrder(db, {
    customerId: "c_su",
    orderType: "Instock",
    items: [{ variantId: "v_tank_black_free", quantity: 2, unitPrice: 19000 }],
    initialPayment: 10000
  }, user);

  assert.equal(order.paid, 10000);
  assert.equal(order.balance, 28000);
  assert.equal(order.paymentStatus, "Deposit Paid");

  const paid = addPayment(db, order.id, { amount: 28000, method: "Cash" }, user);

  assert.equal(paid.paid, 38000);
  assert.equal(paid.balance, 0);
  assert.equal(paid.paymentStatus, "Fully Paid");
});

test("delivery finalizes stock and a resellable return restores stock with refund reporting", () => {
  const db = createBaseDb();
  const user = owner(db);
  const variant = findVariant(db, "v_tank_white_free").variant;
  const startingStock = variant.stockOnHand;

  const order = createOrder(db, {
    customerId: "c_may",
    orderType: "Instock",
    items: [{ variantId: "v_tank_white_free", quantity: 1, unitPrice: 19000 }],
    initialPayment: 19000
  }, user);

  changeOrderStatus(db, order.id, { status: "Delivered", deliveryStatus: "Delivered", packingStatus: "Packed" }, user);

  assert.equal(variant.stockOnHand, startingStock - 1);
  assert.equal(variant.sold, 1);
  assert.equal(variant.reserved, 0);

  recordReturn(db, order.id, {
    reason: "Customer returned item",
    refundAmount: 9000,
    refundMethod: "KPay",
    items: [{ orderItemId: order.items[0].id, quantity: 1, condition: "Resellable" }]
  }, user);

  assert.equal(variant.stockOnHand, startingStock);
  assert.equal(variant.returned, 1);
  assert.equal(db.refunds[0].amount, 9000);

  const report = computeReports(db, { preset: "today" });
  assert.equal(report.refunds, 9000);
  assert.equal(report.productCost, 8000);
  assert.equal(report.cargoCost, 1000);
});

test("profit uses historical item cost instead of later product cost", () => {
  const db = createBaseDb();
  const user = owner(db);
  const order = createOrder(db, {
    customerId: "c_may",
    orderType: "Instock",
    items: [{ variantId: "v_baby_white_s", quantity: 1, unitPrice: 30000 }]
  }, user);

  const product = db.products.find((item) => item.id === "p_baby_tee");
  product.purchaseCost = 99999;

  const report = computeReports(db, { preset: "today" });
  assert.equal(order.items[0].purchaseCost, 12000);
  assert.equal(report.productCost, 12000);
});

test("invalid initial payment does not leave a reserved order behind", () => {
  const db = createBaseDb();
  const user = owner(db);
  const variant = findVariant(db, "v_tank_white_free").variant;

  assert.throws(() => {
    createOrder(db, {
      customerId: "c_may",
      orderType: "Instock",
      items: [{ variantId: "v_tank_white_free", quantity: 1, unitPrice: 5000 }],
      initialPayment: 10000
    }, user);
  }, /Initial payment cannot exceed order total/);

  assert.equal(db.orders.length, 0);
  assert.equal(variant.reserved, 0);
});

test("failed order edit keeps the original reservation intact", () => {
  const db = createBaseDb();
  const user = owner(db);
  const original = findVariant(db, "v_tank_black_free").variant;
  const unavailable = findVariant(db, "v_jean_black_32").variant;

  const order = createOrder(db, {
    customerId: "c_may",
    orderType: "Instock",
    items: [{ variantId: "v_tank_black_free", quantity: 1, unitPrice: 19000 }]
  }, user);

  assert.throws(() => {
    updateOrder(db, order.id, {
      items: [{ variantId: "v_jean_black_32", quantity: 99, unitPrice: 55000 }]
    }, user);
  }, /does not have enough available stock/);

  assert.equal(original.reserved, 1);
  assert.equal(unavailable.reserved, 0);
  assert.equal(order.items[0].variantId, "v_tank_black_free");
});

test("custom report filters use remaining balance terminology", () => {
  const db = createBaseDb();
  const user = owner(db);
  const january = createOrder(db, {
    customerId: "c_may",
    orderDate: "2026-01-10",
    orderType: "Preorder",
    deliveryMethod: "Deli",
    items: [{ variantId: "v_cute_pink_s", quantity: 1, unitPrice: 34000 }]
  }, user);
  createOrder(db, {
    customerId: "c_su",
    orderDate: "2026-02-10",
    orderType: "Preorder",
    deliveryMethod: "Gate",
    items: [{ variantId: "v_pink_bag_free", quantity: 1, unitPrice: 49000 }]
  }, user);

  addPayment(db, january.id, { amount: 10000, method: "KPay", paymentDate: "2026-01-11" }, user);

  const report = computeReports(db, {
    preset: "custom",
    from: "2026-01-01",
    to: "2026-01-31",
    orderType: "Preorder",
    deliveryMethod: "Deli",
    paymentStatus: "Deposit Paid"
  });

  assert.equal(report.orders, 1);
  assert.equal(report.totalCollected, 10000);
  assert.equal(report.remainingBalance, 24000);
  assert.equal(Object.prototype.hasOwnProperty.call(report, "outstanding"), false);
});

test("preorder product metadata and cost history are preserved", () => {
  const db = createBaseDb();
  const user = owner(db);
  const product = createProduct(db, {
    name: "Ribbon Cardigan",
    sku: "TC-RIB-CDG",
    category: "Tops",
    supplier: "Hangzhou Knitwear",
    supplierLink: "https://example.com/ribbon-cardigan",
    supplierProductCode: "HZ-RIB-220",
    supplierPrice: 36,
    purchaseCost: 18000,
    sellingPrice: 42000,
    estimatedProductCost: 20500,
    defaultWaitingTime: "5 Weeks+",
    customerDescription: "Soft ribbon cardigan for preorder.",
    internalNotes: "Check knit color before supplier order.",
    productType: "Preorder",
    variants: [{ color: "Cream", size: "Free", stockOnHand: 0, lowStockThreshold: 1 }]
  }, user);

  assert.equal(product.supplierProductCode, "HZ-RIB-220");
  assert.equal(product.customerDescription, "Soft ribbon cardigan for preorder.");
  assert.equal(product.internalNotes, "Check knit color before supplier order.");
  assert.equal(product.costHistory.length, 1);

  updateProduct(db, product.id, { purchaseCost: 19000 }, user);

  assert.equal(product.purchaseCost, 19000);
  assert.equal(product.costHistory.length, 2);
  assert.equal(product.costHistory[0].cost, 19000);
});

test("new customers keep visible and internal notes separately", () => {
  const db = createBaseDb();
  const user = owner(db);
  createOrder(db, {
    customer: {
      name: "Nandar",
      phone: "09 321 654 987",
      customerVisibleNotes: "Prefers Royal Express.",
      internalNotes: "Usually orders size M.",
      notes: "Messenger replies at night."
    },
    orderType: "Preorder",
    items: [{ variantId: "v_cute_pink_m", quantity: 1, unitPrice: 34000 }]
  }, user);

  const customer = db.customers.find((item) => item.phone === "09 321 654 987");
  assert.equal(customer.customerVisibleNotes, "Prefers Royal Express.");
  assert.equal(customer.internalNotes, "Usually orders size M.");
});

test("partial arrival updates only the arrived item and keeps the order partial", () => {
  const db = createBaseDb();
  const user = owner(db);
  const order = createOrder(db, {
    customerId: "c_may",
    orderType: "Mixed Order",
    items: [
      { variantId: "v_long_cream_m", quantity: 1, unitPrice: 42000 },
      { variantId: "v_cute_blue_m", quantity: 1, unitPrice: 34000 }
    ]
  }, user);

  changeOrderStatus(db, order.id, {
    itemArrivals: [{ itemId: order.items[0].id, arrivalStatus: "Arrived" }]
  }, user);

  assert.equal(order.status, "Partially Arrived");
  assert.equal(order.items[0].arrivalStatus, "Arrived");
  assert.equal(order.items[1].arrivalStatus, "Waiting");
});

test("cargo batches assign selected preorder orders", () => {
  const db = createBaseDb();
  const user = owner(db);
  const order = createOrder(db, {
    customerId: "c_ei",
    orderType: "Preorder",
    items: [{ variantId: "v_pink_bag_free", quantity: 1, unitPrice: 49000 }]
  }, user);

  const batch = createCargoBatch(db, {
    batchId: "B009",
    route: "China -> Muse",
    status: "In Transit",
    orderIds: [order.id],
    cargoFee: 25000
  }, user);

  assert.equal(batch.orderIds[0], order.id);
  assert.equal(order.batchId, "B009");
  assert.equal(order.items[0].batchId, "B009");
  assert.equal(order.preorderStatus, "China -> Myanmar Cargo");
});

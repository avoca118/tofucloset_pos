"use strict";

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const crypto = require("crypto");

const MIGRATIONS_DIR = path.join(__dirname, "..", "database", "migrations");

function mysqlConfig() {
  return {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "tofus_closet_pos",
    charset: "utf8mb4",
    multipleStatements: true,
    dateStrings: true
  };
}

let pool;

function getPool() {
  if (!pool) {
    const { database, ...rest } = mysqlConfig();
    pool = mysql.createPool({
      ...rest,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: false
    });
  }
  return pool;
}

async function withTransaction(work) {
  const conn = await getPool().getConnection();
  await conn.beginTransaction();
  try {
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

function splitSql(sql) {
  return sql
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter((statement) => statement && !statement.startsWith("--"));
}

async function ensureDatabase() {
  const { database, ...rest } = mysqlConfig();
  const conn = await mysql.createConnection(rest);
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conn.query(`ALTER DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await conn.end();
  }
}

async function migrate() {
  await ensureDatabase();
  const conn = await getPool().getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        filename VARCHAR(191) NOT NULL,
        applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_schema_migrations_filename (filename)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const [appliedRows] = await conn.query("SELECT filename FROM schema_migrations");
    const applied = new Set(appliedRows.map((row) => row.filename));
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      for (const statement of splitSql(sql)) {
        await conn.query(statement);
      }
      await conn.query("INSERT INTO schema_migrations (filename) VALUES (?)", [file]);
    }
  } finally {
    conn.release();
  }
}

async function resetDatabase() {
  const { database, ...rest } = mysqlConfig();
  const conn = await mysql.createConnection(rest);
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await conn.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await conn.end();
  }
  if (pool) {
    await pool.end();
    pool = null;
  }
  await migrate();
}

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toFixed(2) : "0.00";
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toIso(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text)) {
    return new Date(text.replace(" ", "T") + "Z").toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return text;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function toDateTime(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 23).replace("T", " ");
}

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function userRef(id) {
  if (!id || id === "system") return null;
  return id;
}

async function insertRows(conn, table, columns, rows) {
  if (!rows.length) return;
  const placeholders = rows.map(() => `(${columns.map(() => "?").join(",")})`).join(",");
  const values = rows.flat();
  await conn.query(`INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders}`, values);
}

const SNAPSHOT_TABLES = [
  "inventory_transactions",
  "audit_logs",
  "dismissed_notifications",
  "order_status_history",
  "order_timeline",
  "cargo_items",
  "return_items",
  "returns",
  "refunds",
  "payments",
  "expenses",
  "order_items",
  "orders",
  "product_cost_history",
  "product_variants",
  "products",
  "suppliers",
  "cargo_batches",
  "customers",
  "users",
  "settings"
];

async function saveDb(db) {
  await withTransaction(async (conn) => {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of SNAPSHOT_TABLES) {
      await conn.query(`DELETE FROM ${table}`);
    }

    const settingsRows = Object.entries(db.settings || {}).map(([key, value]) => [
      key,
      JSON.stringify(value),
      toDateTime(new Date())
    ]);
    await insertRows(conn, "settings", ["setting_key", "setting_value", "updated_at"], settingsRows);

    await insertRows(
      conn,
      "users",
      ["id", "name", "email", "password_hash", "role", "status", "permissions", "created_at", "updated_at"],
      (db.users || []).map((user) => [
        user.id,
        user.name,
        user.email,
        user.passwordHash,
        user.role,
        user.active === false ? "inactive" : "active",
        JSON.stringify(user.permissions || []),
        toDateTime(user.createdAt) || toDateTime(new Date()),
        toDateTime(user.updatedAt) || toDateTime(new Date())
      ])
    );

    await insertRows(
      conn,
      "customers",
      [
        "id",
        "customer_code",
        "name",
        "phone",
        "email",
        "contact",
        "address",
        "township",
        "delivery_method",
        "notes",
        "customer_visible_notes",
        "internal_notes",
        "tags",
        "created_at",
        "updated_at"
      ],
      (db.customers || []).map((customer) => [
        customer.id,
        customer.customerCode || customer.id,
        customer.name,
        customer.phone,
        customer.email || null,
        customer.contact || null,
        customer.address || null,
        customer.township || null,
        customer.deliveryMethod || null,
        customer.notes || null,
        customer.customerVisibleNotes || null,
        customer.internalNotes || null,
        JSON.stringify(customer.tags || []),
        toDateTime(customer.createdAt) || toDateTime(new Date()),
        toDateTime(customer.updatedAt) || toDateTime(new Date())
      ])
    );

    await insertRows(
      conn,
      "products",
      [
        "id",
        "product_code",
        "sku",
        "name",
        "description",
        "category",
        "supplier",
        "product_type",
        "cost_price",
        "selling_price",
        "discount_price",
        "supplier_link",
        "supplier_product_code",
        "supplier_price",
        "estimated_product_cost",
        "default_waiting_time",
        "default_cargo_cost",
        "customer_description",
        "notes",
        "internal_notes",
        "available_sizes",
        "available_colors",
        "images",
        "status",
        "created_at",
        "updated_at"
      ],
      (db.products || []).map((product) => [
        product.id,
        product.productCode || product.sku,
        product.sku,
        product.name,
        product.description || null,
        product.category || null,
        product.supplier || null,
        product.productType || "Preorder",
        money(product.purchaseCost),
        money(product.sellingPrice),
        money(product.discountPrice),
        product.supplierLink || null,
        product.supplierProductCode || null,
        money(product.supplierPrice),
        money(product.estimatedProductCost),
        product.defaultWaitingTime || null,
        money(product.defaultCargoCost),
        product.customerDescription || null,
        product.notes || null,
        product.internalNotes || null,
        JSON.stringify(product.availableSizes || []),
        JSON.stringify(product.availableColors || []),
        JSON.stringify(product.images || []),
        product.active === false ? "inactive" : "active",
        toDateTime(product.createdAt) || toDateTime(new Date()),
        toDateTime(product.updatedAt) || toDateTime(new Date())
      ])
    );

    const variantRows = [];
    const costRows = [];
    for (const product of db.products || []) {
      for (const variant of product.variants || []) {
        variantRows.push([
          variant.id,
          product.id,
          variant.sku || null,
          variant.size || "Free",
          variant.color || "Default",
          variant.costPrice == null ? null : money(variant.costPrice),
          variant.sellingPrice == null ? null : money(variant.sellingPrice),
          toNumber(variant.stockOnHand),
          toNumber(variant.reserved),
          toNumber(variant.sold),
          toNumber(variant.returned),
          toNumber(variant.damaged),
          toNumber(variant.lowStockThreshold || 3),
          variant.active === false ? "inactive" : "active",
          toDateTime(variant.createdAt) || toDateTime(product.createdAt) || toDateTime(new Date()),
          toDateTime(variant.updatedAt) || toDateTime(product.updatedAt) || toDateTime(new Date())
        ]);
      }
      for (const cost of product.costHistory || []) {
        costRows.push([
          cost.id,
          product.id,
          money(cost.cost),
          toDate(cost.date) || toDate(new Date()),
          cost.note || null,
          toDateTime(cost.createdAt) || toDateTime(new Date())
        ]);
      }
    }
    await insertRows(
      conn,
      "product_variants",
      [
        "id",
        "product_id",
        "sku",
        "size",
        "color",
        "cost_price",
        "selling_price",
        "stock_quantity",
        "reserved_quantity",
        "sold_quantity",
        "returned_quantity",
        "damaged_quantity",
        "low_stock_threshold",
        "status",
        "created_at",
        "updated_at"
      ],
      variantRows
    );
    await insertRows(
      conn,
      "product_cost_history",
      ["id", "product_id", "cost", "cost_date", "note", "created_at"],
      costRows
    );

    await insertRows(
      conn,
      "suppliers",
      ["id", "name", "platform", "supplier_link", "contact", "note", "product_cost", "supplier_status", "created_at", "updated_at"],
      (db.suppliers || []).map((supplier) => [
        supplier.id,
        supplier.name,
        supplier.platform || null,
        supplier.supplierLink || null,
        supplier.contact || null,
        supplier.note || null,
        money(supplier.productCost),
        supplier.supplierStatus || "Active",
        toDateTime(supplier.createdAt) || toDateTime(new Date()),
        toDateTime(supplier.updatedAt) || toDateTime(new Date())
      ])
    );

    await insertRows(
      conn,
      "cargo_batches",
      ["id", "batch_id", "route", "cargo_fee", "china_muse_cargo_fee", "muse_yangon_cargo_fee", "other_expenses", "status", "batch_date", "arrival_date", "notes", "created_at", "updated_at"],
      (db.cargoBatches || []).map((batch) => [
        batch.id,
        batch.batchId,
        batch.route,
        money(batch.cargoFee),
        money(batch.chinaMuseCargoFee),
        money(batch.museYangonCargoFee),
        money(batch.otherExpenses),
        batch.status,
        toDate(batch.date),
        toDate(batch.arrivalDate),
        batch.notes || null,
        toDateTime(batch.createdAt) || toDateTime(new Date()),
        toDateTime(batch.updatedAt) || toDateTime(new Date())
      ])
    );

    await insertRows(
      conn,
      "orders",
      [
        "id",
        "order_number",
        "customer_id",
        "created_by",
        "order_type",
        "order_date",
        "status",
        "preorder_status",
        "packing_status",
        "delivery_status",
        "delivery_method",
        "tracking_number",
        "waiting_time",
        "expected_arrival",
        "batch_id",
        "customer_notified",
        "customer_notes",
        "internal_notes",
        "stock_state",
        "subtotal",
        "discount",
        "delivery_fee",
        "shop_delivery_cost",
        "allocated_expense",
        "total",
        "paid_amount",
        "refunded_amount",
        "final_paid_amount",
        "balance",
        "required_deposit",
        "product_cost",
        "cargo_cost",
        "net_profit",
        "payment_status",
        "packed_by",
        "packed_by_name",
        "packed_at",
        "cancellation_reason",
        "cancelled_by",
        "cancelled_by_name",
        "cancelled_at",
        "notes",
        "created_at",
        "updated_at"
      ],
      (db.orders || []).map((order) => [
        order.id,
        order.orderNumber,
        order.customerId,
        userRef(order.createdBy),
        order.orderType,
        toDate(order.orderDate),
        order.status,
        order.preorderStatus || null,
        order.packingStatus || null,
        order.deliveryStatus || null,
        order.deliveryMethod || null,
        order.trackingNumber || null,
        order.waitingTime || null,
        toDate(order.expectedArrival),
        order.batchId || null,
        order.customerNotified ? 1 : 0,
        order.customerNotes || null,
        order.internalNotes || null,
        order.stockState || "draft",
        money(order.subtotal),
        money(order.discount),
        money(order.deliveryFee),
        money(order.shopDeliveryCost),
        money(order.allocatedExpense),
        money(order.total),
        money(order.paid),
        money(order.refunded),
        money(order.finalPaidAmount),
        money(order.balance),
        money(order.requiredDeposit),
        money(order.productCost),
        money(order.cargoCost),
        money(order.netProfit),
        order.paymentStatus || null,
        userRef(order.packedBy),
        order.packedByName || null,
        toDateTime(order.packedAt),
        order.cancellation?.reason || null,
        userRef(order.cancellation?.cancelledBy),
        order.cancellation?.cancelledByName || null,
        toDateTime(order.cancellation?.cancelledAt),
        order.notes || null,
        toDateTime(order.createdAt) || toDateTime(new Date()),
        toDateTime(order.updatedAt) || toDateTime(new Date())
      ])
    );

    const itemRows = [];
    const timelineRows = [];
    for (const order of db.orders || []) {
      for (const item of order.items || []) {
        const quantity = toNumber(item.quantity);
        const unitPrice = toNumber(item.unitPrice);
        const discount = toNumber(item.discount);
        itemRows.push([
          item.id,
          order.id,
          item.productId,
          item.variantId,
          item.productName,
          item.sku || null,
          item.size || null,
          item.color || null,
          quantity,
          money(unitPrice),
          money(item.purchaseCost),
          money(item.cargoCost),
          money(discount),
          money(Math.max(quantity * unitPrice - discount, 0)),
          item.supplierStatus || null,
          item.cargoStatus || null,
          item.arrivalStatus || null,
          toDate(item.expectedArrival),
          item.batchId || null,
          item.customerNotified ? 1 : 0,
          toDateTime(item.createdAt) || toDateTime(order.createdAt) || toDateTime(new Date())
        ]);
      }
      for (const event of order.timeline || []) {
        timelineRows.push([
          event.id,
          order.id,
          userRef(event.userId),
          event.userName || null,
          event.title,
          event.note || null,
          toDateTime(event.createdAt) || toDateTime(new Date())
        ]);
      }
    }
    await insertRows(
      conn,
      "order_items",
      [
        "id",
        "order_id",
        "product_id",
        "variant_id",
        "product_name_snapshot",
        "sku",
        "size",
        "color",
        "quantity",
        "unit_price",
        "cost_price",
        "cargo_cost",
        "discount",
        "subtotal",
        "supplier_status",
        "cargo_status",
        "arrival_status",
        "expected_arrival",
        "batch_id",
        "customer_notified",
        "created_at"
      ],
      itemRows
    );
    await insertRows(
      conn,
      "order_timeline",
      ["id", "order_id", "user_id", "user_name", "title", "note", "created_at"],
      timelineRows
    );
    await insertRows(
      conn,
      "order_status_history",
      ["id", "order_id", "old_status", "new_status", "changed_by", "changed_at", "note"],
      (db.orderStatusHistory || []).map((row) => [
        row.id,
        row.orderId,
        row.oldStatus || null,
        row.newStatus,
        userRef(row.changedBy),
        toDateTime(row.changedAt) || toDateTime(new Date()),
        row.note || null
      ])
    );

    await insertRows(
      conn,
      "payments",
      [
        "id",
        "order_id",
        "customer_id",
        "amount",
        "payment_method",
        "payment_type",
        "payment_date",
        "reference",
        "received_by",
        "received_by_name",
        "notes",
        "created_at"
      ],
      (db.payments || []).map((payment) => [
        payment.id,
        payment.orderId,
        payment.customerId || null,
        money(payment.amount),
        payment.method || "KPay",
        payment.paymentType || "payment",
        toDate(payment.paymentDate),
        payment.reference || null,
        userRef(payment.receivedBy),
        payment.receivedByName || null,
        payment.note || null,
        toDateTime(payment.createdAt) || toDateTime(new Date())
      ])
    );

    await insertRows(
      conn,
      "refunds",
      ["id", "order_id", "customer_id", "amount", "method", "reason", "refund_date", "processed_by", "processed_by_name", "created_at"],
      (db.refunds || []).map((refund) => [
        refund.id,
        refund.orderId,
        refund.customerId || null,
        money(refund.amount),
        refund.method || "KPay",
        refund.reason || null,
        toDate(refund.refundDate),
        userRef(refund.processedBy),
        refund.processedByName || null,
        toDateTime(refund.createdAt) || toDateTime(new Date())
      ])
    );

    await insertRows(
      conn,
      "returns",
      ["id", "order_id", "customer_id", "reason", "status", "processed_by", "processed_by_name", "return_date", "created_at"],
      (db.returns || []).map((record) => [
        record.id,
        record.orderId,
        record.customerId || null,
        record.reason || null,
        record.status || "Processed",
        userRef(record.processedBy),
        record.processedByName || null,
        toDate(record.returnDate),
        toDateTime(record.createdAt) || toDateTime(new Date())
      ])
    );

    const returnItemRows = [];
    for (const record of db.returns || []) {
      for (const item of record.items || []) {
        returnItemRows.push([
          item.id,
          record.id,
          item.orderItemId || null,
          item.productName || null,
          item.variantId || null,
          item.color || null,
          item.size || null,
          toNumber(item.quantity),
          item.condition || "Resellable",
          toDateTime(item.createdAt) || toDateTime(record.createdAt) || toDateTime(new Date())
        ]);
      }
    }
    await insertRows(
      conn,
      "return_items",
      ["id", "return_id", "order_item_id", "product_name", "variant_id", "color", "size", "quantity", "`condition`", "created_at"],
      returnItemRows
    );

    const cargoItemRows = [];
    for (const batch of db.cargoBatches || []) {
      const orderIds = batch.orderIds || [];
      if (orderIds.length) {
        for (const orderId of orderIds) {
          const order = (db.orders || []).find((item) => item.id === orderId);
          const items = order?.items || [null];
          for (const item of items) {
            cargoItemRows.push([
              `ci_${crypto.randomUUID()}`,
              batch.id,
              orderId,
              item?.id || null,
              item?.productId || null,
              money(item ? item.cargoCost : 0),
              item?.cargoStatus || batch.status || null,
              toDateTime(batch.createdAt) || toDateTime(new Date())
            ]);
          }
        }
      } else {
        for (const productId of batch.productIds || []) {
          cargoItemRows.push([
            `${batch.id}_${productId}`,
            batch.id,
            null,
            null,
            productId,
            money(0),
            batch.status || null,
            toDateTime(batch.createdAt) || toDateTime(new Date())
          ]);
        }
      }
    }
    await insertRows(
      conn,
      "cargo_items",
      ["id", "cargo_batch_id", "order_id", "order_item_id", "product_id", "cargo_fee", "status", "created_at"],
      cargoItemRows
    );

    await insertRows(
      conn,
      "expenses",
      [
        "id",
        "category",
        "amount",
        "expense_date",
        "description",
        "payment_method",
        "added_by",
        "added_by_name",
        "order_id",
        "batch_id",
        "notes",
        "created_at",
        "updated_at"
      ],
      (db.expenses || []).map((expense) => [
        expense.id,
        expense.category || "Other",
        money(expense.amount),
        toDate(expense.date),
        expense.description || null,
        expense.paymentMethod || null,
        userRef(expense.addedBy),
        expense.addedByName || null,
        expense.orderId || null,
        expense.batchId || null,
        expense.note || null,
        toDateTime(expense.createdAt) || toDateTime(new Date()),
        toDateTime(expense.updatedAt) || toDateTime(new Date())
      ])
    );

    await insertRows(
      conn,
      "inventory_transactions",
      [
        "id",
        "product_id",
        "variant_id",
        "product_name",
        "variant_label",
        "transaction_type",
        "quantity",
        "reference_type",
        "reference_id",
        "staff_id",
        "staff_name",
        "notes",
        "created_at"
      ],
      (db.inventoryTransactions || []).map((row) => [
        row.id,
        row.productId || null,
        row.variantId || null,
        row.productName || null,
        row.variantLabel || null,
        row.action || row.transactionType,
        toNumber(row.quantity),
        row.relatedOrderId ? "order" : row.referenceType || null,
        row.relatedOrderId || row.referenceId || null,
        userRef(row.staffId),
        row.staffName || null,
        row.note || null,
        toDateTime(row.date || row.createdAt) || toDateTime(new Date())
      ])
    );

    await insertRows(
      conn,
      "audit_logs",
      ["id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "created_at"],
      (db.auditLogs || []).map((row) => [
        row.id,
        userRef(row.userId),
        row.userName || null,
        row.action,
        row.entityType || null,
        row.entityId || null,
        row.details || null,
        toDateTime(row.createdAt) || toDateTime(new Date())
      ])
    );

    await insertRows(
      conn,
      "dismissed_notifications",
      ["id", "dismissed_at"],
      (db.dismissedNotifications || []).map((id) => [id, toDateTime(new Date())])
    );

    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  });
}

async function loadDb(createEmptyDb) {
  const conn = getPool();
  const [[userCount]] = await conn.query("SELECT COUNT(*) AS count FROM users");
  const [[customerCount]] = await conn.query("SELECT COUNT(*) AS count FROM customers");
  const [[productCount]] = await conn.query("SELECT COUNT(*) AS count FROM products");
  const [[orderCount]] = await conn.query("SELECT COUNT(*) AS count FROM orders");
  const [[settingsCount]] = await conn.query("SELECT COUNT(*) AS count FROM settings");
  const emptyBusiness =
  Number(userCount.count) === 0 &&
  Number(customerCount.count) === 0 &&
  Number(productCount.count) === 
  0 &&
  Number(orderCount.count) === 0;

  if (emptyBusiness) {
    return createEmptyDb();
  }

  const db = createEmptyDb();
  const [settingRows] = await conn.query("SELECT setting_key, setting_value FROM settings");
  for (const row of settingRows) {
    db.settings[row.setting_key] = parseJson(row.setting_value, row.setting_value);
  }

  const [users] = await conn.query("SELECT * FROM users ORDER BY created_at DESC");
  db.users = users.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    permissions: parseJson(row.permissions, []),
    active: row.status === "active",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  }));

  const [customers] = await conn.query("SELECT * FROM customers ORDER BY created_at DESC");
  db.customers = customers.map((row) => ({
    id: row.id,
    customerCode: row.customer_code,
    name: row.name,
    phone: row.phone,
    email: row.email || "",
    contact: row.contact || "",
    address: row.address || "",
    township: row.township || "",
    deliveryMethod: row.delivery_method || "Deli",
    notes: row.notes || "",
    customerVisibleNotes: row.customer_visible_notes || "",
    internalNotes: row.internal_notes || "",
    tags: parseJson(row.tags, []),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  }));

  const [products] = await conn.query("SELECT * FROM products ORDER BY created_at DESC");
  const [variants] = await conn.query("SELECT * FROM product_variants");
  const [costs] = await conn.query("SELECT * FROM product_cost_history ORDER BY created_at DESC");
  const variantsByProduct = new Map();
  for (const row of variants) {
    const list = variantsByProduct.get(row.product_id) || [];
    list.push({
      id: row.id,
      productId: row.product_id,
      sku: row.sku || "",
      color: row.color,
      size: row.size,
      stockOnHand: toNumber(row.stock_quantity),
      reserved: toNumber(row.reserved_quantity),
      sold: toNumber(row.sold_quantity),
      returned: toNumber(row.returned_quantity),
      damaged: toNumber(row.damaged_quantity),
      lowStockThreshold: toNumber(row.low_stock_threshold),
      costPrice: row.cost_price == null ? undefined : toNumber(row.cost_price),
      sellingPrice: row.selling_price == null ? undefined : toNumber(row.selling_price),
      active: row.status === "active"
    });
    variantsByProduct.set(row.product_id, list);
  }
  const costsByProduct = new Map();
  for (const row of costs) {
    const list = costsByProduct.get(row.product_id) || [];
    list.push({
      id: row.id,
      cost: toNumber(row.cost),
      date: toDate(row.cost_date),
      note: row.note || ""
    });
    costsByProduct.set(row.product_id, list);
  }
  db.products = products.map((row) => ({
    id: row.id,
    productCode: row.product_code,
    sku: row.sku,
    name: row.name,
    images: parseJson(row.images, []),
    category: row.category || "",
    supplier: row.supplier || "",
    productType: row.product_type,
    description: row.description || "",
    purchaseCost: toNumber(row.cost_price),
    sellingPrice: toNumber(row.selling_price),
    discountPrice: toNumber(row.discount_price),
    supplierLink: row.supplier_link || "",
    supplierProductCode: row.supplier_product_code || "",
    supplierPrice: toNumber(row.supplier_price),
    estimatedProductCost: toNumber(row.estimated_product_cost),
    defaultWaitingTime: row.default_waiting_time || "",
    availableSizes: parseJson(row.available_sizes, []),
    availableColors: parseJson(row.available_colors, []),
    customerDescription: row.customer_description || "",
    notes: row.notes || "",
    internalNotes: row.internal_notes || "",
    defaultCargoCost: toNumber(row.default_cargo_cost),
    active: row.status === "active",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    variants: variantsByProduct.get(row.id) || [],
    costHistory: costsByProduct.get(row.id) || []
  }));

  const [suppliers] = await conn.query("SELECT * FROM suppliers");
  db.suppliers = suppliers.map((row) => ({
    id: row.id,
    name: row.name,
    platform: row.platform || "",
    supplierLink: row.supplier_link || "",
    contact: row.contact || "",
    note: row.note || "",
    productCost: toNumber(row.product_cost),
    supplierStatus: row.supplier_status
  }));

  const [batches] = await conn.query("SELECT * FROM cargo_batches ORDER BY created_at DESC");
  const [cargoItems] = await conn.query("SELECT * FROM cargo_items");
  const cargoByBatch = new Map();
  for (const row of cargoItems) {
    const list = cargoByBatch.get(row.cargo_batch_id) || [];
    list.push(row);
    cargoByBatch.set(row.cargo_batch_id, list);
  }
  db.cargoBatches = batches.map((row) => {
    const items = cargoByBatch.get(row.id) || [];
    return {
      id: row.id,
      batchId: row.batch_id,
      route: row.route,
      cargoFee: toNumber(row.cargo_fee),
      chinaMuseCargoFee: toNumber(row.china_muse_cargo_fee),
      museYangonCargoFee: toNumber(row.muse_yangon_cargo_fee),
      otherExpenses: toNumber(row.other_expenses),
      date: toDate(row.batch_date) || "",
      arrivalDate: toDate(row.arrival_date) || "",
      status: row.status,
      orderIds: [...new Set(items.map((item) => item.order_id).filter(Boolean))],
      productIds: [...new Set(items.map((item) => item.product_id).filter(Boolean))],
      notes: row.notes || "",
      createdAt: toIso(row.created_at)
    };
  });

  const [orders] = await conn.query("SELECT * FROM orders ORDER BY created_at DESC");
  const [items] = await conn.query("SELECT * FROM order_items");
  const [timeline] = await conn.query("SELECT * FROM order_timeline ORDER BY created_at DESC");
  const itemsByOrder = new Map();
  for (const row of items) {
    const list = itemsByOrder.get(row.order_id) || [];
    list.push({
      id: row.id,
      productId: row.product_id,
      variantId: row.variant_id,
      sku: row.sku || "",
      productName: row.product_name_snapshot,
      color: row.color || "",
      size: row.size || "",
      quantity: toNumber(row.quantity),
      unitPrice: toNumber(row.unit_price),
      discount: toNumber(row.discount),
      purchaseCost: toNumber(row.cost_price),
      cargoCost: toNumber(row.cargo_cost),
      supplierStatus: row.supplier_status || "Pending",
      cargoStatus: row.cargo_status || "Waiting",
      arrivalStatus: row.arrival_status || "Waiting",
      expectedArrival: toDate(row.expected_arrival) || "",
      batchId: row.batch_id || "",
      customerNotified: Boolean(row.customer_notified)
    });
    itemsByOrder.set(row.order_id, list);
  }
  const timelineByOrder = new Map();
  for (const row of timeline) {
    const list = timelineByOrder.get(row.order_id) || [];
    list.push({
      id: row.id,
      userId: row.user_id || "system",
      userName: row.user_name || "System",
      title: row.title,
      note: row.note || "",
      createdAt: toIso(row.created_at)
    });
    timelineByOrder.set(row.order_id, list);
  }
  db.orders = orders.map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    orderDate: toDate(row.order_date) || "",
    customerId: row.customer_id,
    createdBy: row.created_by || "",
    orderType: row.order_type,
    status: row.status,
    preorderStatus: row.preorder_status || "",
    packingStatus: row.packing_status || "",
    deliveryStatus: row.delivery_status || "",
    deliveryMethod: row.delivery_method || "",
    deliveryFee: toNumber(row.delivery_fee),
    shopDeliveryCost: toNumber(row.shop_delivery_cost),
    trackingNumber: row.tracking_number || "",
    waitingTime: row.waiting_time || "",
    expectedArrival: toDate(row.expected_arrival) || "",
    requiredDeposit: toNumber(row.required_deposit),
    batchId: row.batch_id || "",
    customerNotified: Boolean(row.customer_notified),
    customerNotes: row.customer_notes || "",
    internalNotes: row.internal_notes || "",
    cancellation: row.cancelled_at
      ? {
          reason: row.cancellation_reason || "",
          cancelledBy: row.cancelled_by || "",
          cancelledByName: row.cancelled_by_name || "",
          cancelledAt: toIso(row.cancelled_at)
        }
      : null,
    packedBy: row.packed_by || "",
    packedByName: row.packed_by_name || "",
    packedAt: row.packed_at ? toIso(row.packed_at) : "",
    timeline: timelineByOrder.get(row.id) || [],
    items: itemsByOrder.get(row.id) || [],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    stockState: row.stock_state || "draft",
    subtotal: toNumber(row.subtotal),
    discount: toNumber(row.discount),
    total: toNumber(row.total),
    paid: toNumber(row.paid_amount),
    refunded: toNumber(row.refunded_amount),
    finalPaidAmount: toNumber(row.final_paid_amount),
    balance: toNumber(row.balance),
    remainingBalance: toNumber(row.balance),
    productCost: toNumber(row.product_cost),
    cargoCost: toNumber(row.cargo_cost),
    allocatedExpense: toNumber(row.allocated_expense),
    netProfit: toNumber(row.net_profit),
    paymentStatus: row.payment_status || ""
  }));

  const [history] = await conn.query("SELECT * FROM order_status_history ORDER BY changed_at DESC");
  db.orderStatusHistory = history.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    oldStatus: row.old_status || "",
    newStatus: row.new_status,
    changedBy: row.changed_by || "system",
    changedAt: toIso(row.changed_at),
    note: row.note || ""
  }));

  const [payments] = await conn.query("SELECT * FROM payments ORDER BY created_at DESC");
  db.payments = payments.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    customerId: row.customer_id || "",
    amount: toNumber(row.amount),
    method: row.payment_method,
    paymentType: row.payment_type,
    paymentDate: toDate(row.payment_date) || "",
    reference: row.reference || "",
    receivedBy: row.received_by || "",
    receivedByName: row.received_by_name || "",
    note: row.notes || "",
    createdAt: toIso(row.created_at)
  }));

  const [refunds] = await conn.query("SELECT * FROM refunds ORDER BY created_at DESC");
  db.refunds = refunds.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    customerId: row.customer_id || "",
    amount: toNumber(row.amount),
    method: row.method,
    reason: row.reason || "",
    refundDate: toDate(row.refund_date) || "",
    processedBy: row.processed_by || "",
    processedByName: row.processed_by_name || "",
    createdAt: toIso(row.created_at)
  }));

  const [returns] = await conn.query("SELECT * FROM returns ORDER BY created_at DESC");
  const [returnItems] = await conn.query("SELECT * FROM return_items");
  const returnItemsById = new Map();
  for (const row of returnItems) {
    const list = returnItemsById.get(row.return_id) || [];
    list.push({
      id: row.id,
      orderItemId: row.order_item_id || "",
      productName: row.product_name || "",
      variantId: row.variant_id || "",
      color: row.color || "",
      size: row.size || "",
      quantity: toNumber(row.quantity),
      condition: row.condition
    });
    returnItemsById.set(row.return_id, list);
  }
  db.returns = returns.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    customerId: row.customer_id || "",
    reason: row.reason || "",
    status: row.status,
    processedBy: row.processed_by || "",
    processedByName: row.processed_by_name || "",
    returnDate: toDate(row.return_date) || "",
    createdAt: toIso(row.created_at),
    items: returnItemsById.get(row.id) || []
  }));

  const [expenses] = await conn.query("SELECT * FROM expenses ORDER BY created_at DESC");
  db.expenses = expenses.map((row) => ({
    id: row.id,
    category: row.category,
    amount: toNumber(row.amount),
    date: toDate(row.expense_date) || "",
    description: row.description || "",
    paymentMethod: row.payment_method || "",
    addedBy: row.added_by || "",
    addedByName: row.added_by_name || "",
    orderId: row.order_id || "",
    batchId: row.batch_id || "",
    note: row.notes || "",
    createdAt: toIso(row.created_at)
  }));

  const [inventory] = await conn.query("SELECT * FROM inventory_transactions ORDER BY created_at DESC");
  db.inventoryTransactions = inventory.map((row) => ({
    id: row.id,
    date: toIso(row.created_at),
    productId: row.product_id || "",
    productName: row.product_name || "",
    variantId: row.variant_id || "",
    variantLabel: row.variant_label || "",
    quantity: toNumber(row.quantity),
    action: row.transaction_type,
    relatedOrderId: row.reference_type === "order" ? row.reference_id || "" : "",
    staffId: row.staff_id || "system",
    staffName: row.staff_name || "System",
    note: row.notes || ""
  }));

  const [audit] = await conn.query("SELECT * FROM audit_logs ORDER BY created_at DESC");
  db.auditLogs = audit.map((row) => ({
    id: row.id,
    userId: row.user_id || "system",
    userName: row.user_name || "System",
    action: row.action,
    entityType: row.entity_type || "",
    entityId: row.entity_id || "",
    details: row.details || "",
    createdAt: toIso(row.created_at)
  }));

  const [dismissed] = await conn.query("SELECT id FROM dismissed_notifications");
  db.dismissedNotifications = dismissed.map((row) => row.id);
  return db;
}

async function ping() {
  const [rows] = await getPool().query("SELECT VERSION() AS version");
  return rows[0]?.version || "";
}

async function tableCounts() {
  const tables = [
    "users",
    "customers",
    "products",
    "product_variants",
    "orders",
    "order_items",
    "payments",
    "refunds",
    "returns",
    "return_items",
    "cargo_batches",
    "cargo_items",
    "expenses",
    "order_status_history",
    "inventory_transactions",
    "audit_logs"
  ];
  const counts = {};
  for (const table of tables) {
    const [[row]] = await getPool().query(`SELECT COUNT(*) AS count FROM ${table}`);
    counts[table] = Number(row.count);
  }
  return counts;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  mysqlConfig,
  getPool,
  migrate,
  resetDatabase,
  saveDb,
  loadDb,
  ping,
  tableCounts,
  closePool,
  withTransaction
};

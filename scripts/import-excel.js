const XLSX = require("xlsx");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
require("dotenv").config();

const FILE = "/Users/avocado/Downloads/Online Shopping (19_6_26).xlsx";

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function value(v) {
  return v === undefined || v === null ? null : v;
}

function dateOnly(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);

  const s = String(v).trim();
  const parts = s.split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return `${y.length === 2 ? `20${y}` : y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return s.slice(0, 10);
}

function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const workbook = XLSX.readFile(FILE, { cellDates: true });

  const sheet1 = XLSX.utils.sheet_to_json(
    workbook.Sheets["Sheet1"],
    { defval: null }
  );

  const sheet2 = XLSX.utils.sheet_to_json(
    workbook.Sheets["Sheet2"],
    { defval: null }
  );

  const batches = XLSX.utils.sheet_to_json(
    workbook.Sheets["Purchase Batches"],
    { defval: null }
  );

  const shipments = XLSX.utils.sheet_to_json(
    workbook.Sheets["Muse → Yangon"],
    { defval: null }
  );

  const deliveries = XLSX.utils.sheet_to_json(
    workbook.Sheets["Delivery Payments"],
    { defval: null }
  );

  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "tofus_closet_pos",
  });

  await db.beginTransaction();

  try {
    const [ownerRows] = await db.query(
      "SELECT id FROM users ORDER BY id LIMIT 1"
    );

    const defaultUser = ownerRows[0]?.id || null;

    const customers = new Map();
    const products = new Map();
    const variants = new Map();
    const orders = new Map();

    // -------------------------
    // CUSTOMERS
    // -------------------------
    for (const row of sheet1) {
      const orderId = row["Order ID"];
      if (orderId == null) continue;

      const customerName = String(row["Customer"] || `Customer ${orderId}`).trim();
      const phone = String(row["Phone"] || "").trim() || `NO-PHONE-${orderId}`;

      const key = `${customerName.toLowerCase()}|${phone}`;

      if (!customers.has(key)) {
        const customerId = id("cus");

        await db.query(
          `
          INSERT INTO customers
          (id, customer_code, name, phone, address, delivery_method)
          VALUES (?, ?, ?, ?, ?, ?)
          `,
          [
            customerId,
            `CUS-${String(customers.size + 1).padStart(4, "0")}`,
            customerName,
            phone,
            value(row["Address"]),
            "Deli",
          ]
        );

        customers.set(key, customerId);
      }
    }

    // -------------------------
    // PRODUCTS + VARIANTS
    // -------------------------
    for (const row of sheet2) {
      const productName = String(row["Product ID"] || "").trim();
      if (!productName) continue;

      const productKey = productName.toLowerCase();

      if (!products.has(productKey)) {
        const productId = id("prod");
        const sku = `SKU-${String(products.size + 1).padStart(5, "0")}`;

        await db.query(
          `
          INSERT INTO products
          (
            id,
            product_code,
            sku,
            name,
            product_type,
            cost_price,
            selling_price,
            status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
          `,
          [
            productId,
            `P-${String(products.size + 1).padStart(5, "0")}`,
            sku,
            productName,
            "Preorder",
            money(row["Cost"]),
            money(row["Unit Price"]),
          ]
        );

        products.set(productKey, productId);
      }

      const productId = products.get(productKey);

      const size = String(row["Size"] || "Free");
      const color = String(row["Color"] || "Default");

      const variantKey = `${productKey}|${size}|${color}`;

      if (!variants.has(variantKey)) {
        const variantId = id("var");

        await db.query(
          `
          INSERT INTO product_variants
          (
            id,
            product_id,
            sku,
            size,
            color,
            cost_price,
            selling_price
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [
            variantId,
            productId,
            `${String(productId).slice(0, 20)}-${size}-${color}`.slice(0, 96),
            size,
            color,
            money(row["Cost"]),
            money(row["Unit Price"]),
          ]
        );

        variants.set(variantKey, variantId);
      }
    }

    // -------------------------
    // ORDERS
    // -------------------------
    for (const row of sheet1) {
      const excelOrderId = row["Order ID"];
      if (excelOrderId == null || orders.has(String(excelOrderId))) continue;

      const customerName = String(row["Customer"] || `Customer ${excelOrderId}`).trim();
      const phone = String(row["Phone"] || "").trim() || `NO-PHONE-${excelOrderId}`;
      const customerKey = `${customerName.toLowerCase()}|${phone}`;

      const customerId = customers.get(customerKey);

      const orderId = id("ord");
      const orderNumber = `ORD-${String(excelOrderId).padStart(4, "0")}`;

      const total = money(row["Total"]);
      const deposit = money(row["Deposit"]);
      const balance = money(row["Remaining Balance"]);

      await db.query(
        `
        INSERT INTO orders
        (
          id,
          order_number,
          customer_id,
          created_by,
          order_type,
          order_date,
          status,
          delivery_method,
          subtotal,
          total,
          paid_amount,
          final_paid_amount,
          balance,
          required_deposit,
          net_profit,
          payment_status
        )
        VALUES (?, ?, ?, ?, 'Preorder', ?, ?, 'Deli', ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          orderId,
          orderNumber,
          customerId,
          defaultUser,
          dateOnly(row["Date"]) || new Date().toISOString().slice(0, 10),
          row["Status"] || "Pending",
          total,
          total,
          deposit,
          deposit,
          balance,
          deposit,
          money(row["Profit"]),
          balance <= 0 ? "Paid" : "Partial",
        ]
      );

      orders.set(String(excelOrderId), orderId);

      if (deposit > 0) {
        await db.query(
          `
          INSERT INTO payments
          (
            id,
            order_id,
            customer_id,
            amount,
            payment_method,
            payment_type,
            payment_date,
            notes
          )
          VALUES (?, ?, ?, ?, 'KPay', 'payment', ?, 'Imported from Excel')
          `,
          [
            id("pay"),
            orderId,
            customerId,
            deposit,
            dateOnly(row["Date"]) || new Date().toISOString().slice(0, 10),
          ]
        );
      }
    }

    // -------------------------
    // ORDER ITEMS
    // -------------------------
    for (const row of sheet2) {
      const excelOrderId = String(row["Order ID"]);
      const orderId = orders.get(excelOrderId);

      if (!orderId) continue;

      const productName = String(row["Product ID"] || "").trim();
      const productKey = productName.toLowerCase();
      const productId = products.get(productKey);

      const size = String(row["Size"] || "Free");
      const color = String(row["Color"] || "Default");

      const variantId = variants.get(
        `${productKey}|${size}|${color}`
      );

      await db.query(
        `
        INSERT INTO order_items
        (
          id,
          order_id,
          product_id,
          variant_id,
          product_name_snapshot,
          size,
          color,
          quantity,
          unit_price,
          cost_price,
          cargo_cost,
          subtotal,
          batch_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          id("item"),
          orderId,
          productId,
          variantId,
          productName,
          size,
          color,
          Number(row["Qty"]) || 1,
          money(row["Unit Price"]),
          money(row["Cost"]),
          money(row["China→Muse"]),
          money(row["Subtotal"]),
          row["Batch ID"] || null,
        ]
      );
    }

    // -------------------------
    // CARGO BATCHES
    // -------------------------
    for (const row of batches) {
      const batchId = String(row["Batch ID"] || "").trim();
      if (!batchId) continue;

      await db.query(
        `
        INSERT IGNORE INTO cargo_batches
        (
          id,
          batch_id,
          route,
          cargo_fee,
          status,
          batch_date,
          notes
        )
        VALUES (?, ?, 'China → Muse', ?, 'Arrived', ?, ?)
        `,
        [
          id("cargo"),
          batchId,
          money(row["China → Muse Cargo Rate"]),
          dateOnly(row["Purchase Date"]),
          row["Notes"] || null,
        ]
      );
    }

    await db.commit();

    console.log("");
    console.log("=================================");
    console.log("Excel import completed.");
    console.log(`Customers : ${customers.size}`);
    console.log(`Products  : ${products.size}`);
    console.log(`Orders    : ${orders.size}`);
    console.log(`Items     : ${sheet2.length}`);
    console.log(`Batches   : ${batches.length}`);
    console.log("=================================");
  } catch (error) {
    await db.rollback();
    console.error("IMPORT FAILED");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();


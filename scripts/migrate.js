#!/usr/bin/env node
"use strict";

require("dotenv").config();
const store = require("../lib/mysql-store");

async function main() {
  const reset = process.argv.includes("--reset");
  if (reset) {
    await store.resetDatabase();
    console.log(`Dropped and recreated empty database ${store.mysqlConfig().database}`);
  } else {
    await store.migrate();
    console.log(`Applied MySQL migrations to ${store.mysqlConfig().database}`);
  }
  const version = await store.ping();
  const counts = await store.tableCounts();
  console.log(`MySQL ${version}`);
  console.log(counts);
  await store.closePool();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

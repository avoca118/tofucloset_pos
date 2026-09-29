const mysqlStore = require("../lib/mysql-store");
const { createBaseDb } = require("../server");

async function main() {
  try {
    console.log("Loading MySQL database...");

    const db = await mysqlStore.loadDb(createBaseDb);

    console.log("Database loaded successfully.");
    console.log(JSON.stringify(db, null, 2));
  } catch (error) {
    console.error("Failed to load database:");
    console.error(error);
    process.exit(1);
  } finally {
    await mysqlStore.closePool();
  }
}

main();
#!/usr/bin/env node

/**
 * Script to clear all data from PowerReading table
 */

const { PrismaClient } = require("@prisma/client");

async function clearPowerReadings() {
  const prisma = new PrismaClient();

  try {
    console.log("🗑️  Clearing PowerReading table...\n");

    // Get current count before deletion
    const currentCount = await prisma.powerReading.count();
    console.log(`📊 Current PowerReading records: ${currentCount}`);

    if (currentCount === 0) {
      console.log("✅ Table is already empty, nothing to clear.");
      return;
    }

    // Confirm deletion
    console.log(
      `⚠️  This will delete ALL ${currentCount} power reading records.`
    );
    console.log("   This action cannot be undone!");

    // Delete all records
    console.log("\n🗑️  Deleting all PowerReading records...");
    const deleteResult = await prisma.powerReading.deleteMany({});

    console.log(`✅ Successfully deleted ${deleteResult.count} records`);

    // Verify deletion
    const finalCount = await prisma.powerReading.count();
    console.log(`📊 Final PowerReading records: ${finalCount}`);

    if (finalCount === 0) {
      console.log("\n🎉 PowerReading table cleared successfully!");
      console.log("   The table structure remains intact.");
      console.log("   You can now start fresh data collection.");
    } else {
      console.log(
        `\n⚠️  Warning: ${finalCount} records still remain in the table.`
      );
    }
  } catch (error) {
    console.error("❌ Error clearing PowerReading table:", error.message);

    if (error.code === "P2002") {
      console.log("💡 This might be a foreign key constraint issue.");
    } else if (error.code === "P2025") {
      console.log("💡 Table might be empty or not exist.");
    }

    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log("\n🔌 Database connection closed.");
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force") || args.includes("-f");

  if (!force) {
    console.log("🚨 DANGER: This will delete ALL PowerReading data!");
    console.log("");
    console.log("To proceed, run:");
    console.log("  node clear-power-readings.js --force");
    console.log("");
    console.log("Or use the npm script:");
    console.log("  npm run clear:readings");
    console.log("");
    process.exit(0);
  }

  await clearPowerReadings();
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

module.exports = { clearPowerReadings };

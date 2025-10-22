const { PrismaClient } = require('@prisma/client');
const Papa = require('papaparse');
const fs = require('fs');

const prisma = new PrismaClient();

async function importPowerReadingsUpsert() {
  try {
    // Read the CSV file
    const csvFile = fs.readFileSync('power_readings.csv', 'utf8');
    
    // Parse the CSV
    const { data } = Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });

    console.log(`Found ${data.length} power readings to import`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      try {
        await prisma.powerReading.upsert({
          where: { id: row.id },
          update: {
            stationId: row.stationId,
            timestamp: row.timestamp ? new Date(row.timestamp) : new Date(),
            activePower1: row.activePower1 ?? null,
            activePower2: row.activePower2 ?? null,
            activePower3: row.activePower3 ?? null,
            activePower4: row.activePower4 ?? null,
            activePower5: row.activePower5 ?? null,
            activePower6: row.activePower6 ?? null,
            muxPower1: row.muxPower1 ?? null,
            muxPower2: row.muxPower2 ?? null,
            muxPower3: row.muxPower3 ?? null,
            muxPower4: row.muxPower4 ?? null,
            createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
          },
          create: {
            id: row.id,
            stationId: row.stationId,
            timestamp: row.timestamp ? new Date(row.timestamp) : new Date(),
            activePower1: row.activePower1 ?? null,
            activePower2: row.activePower2 ?? null,
            activePower3: row.activePower3 ?? null,
            activePower4: row.activePower4 ?? null,
            activePower5: row.activePower5 ?? null,
            activePower6: row.activePower6 ?? null,
            muxPower1: row.muxPower1 ?? null,
            muxPower2: row.muxPower2 ?? null,
            muxPower3: row.muxPower3 ?? null,
            muxPower4: row.muxPower4 ?? null,
            createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
          },
        });
        
        successCount++;
        
        // Show progress every 100 records
        if ((i + 1) % 100 === 0) {
          console.log(`Progress: ${i + 1}/${data.length} (${Math.round((i + 1) / data.length * 100)}%)`);
        }
      } catch (error) {
        errorCount++;
        console.error(`✗ Failed to import reading ${row.id}:`, error.message);
      }
    }

    console.log(`\n=== Import Summary ===`);
    console.log(`Successfully imported: ${successCount}`);
    console.log(`Failed: ${errorCount}`);
    console.log(`Total: ${data.length}`);

  } catch (error) {
    console.error('Error importing power readings:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the import
importPowerReadingsUpsert();
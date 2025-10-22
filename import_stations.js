const { PrismaClient } = require('@prisma/client');
const Papa = require('papaparse');
const fs = require('fs');

const prisma = new PrismaClient();

async function importStations() {
  try {
    // Read the CSV file
    const csvFile = fs.readFileSync('stations.csv', 'utf8');
    
    // Parse the CSV
    const { data } = Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false, // Keep as strings initially
    });

    console.log(`Found ${data.length} stations to import`);

    // Import each station
    let successCount = 0;
    let errorCount = 0;

    for (const row of data) {
      try {
        await prisma.station.create({
          data: {
            id: row.id,
            name: row.name,
            uuid: row.uuid || null,
            ipAddress: row.ipAddress || null,
            scene: row.scene || null,
            createdAt: row.createdAt ? new Date(parseInt(row.createdAt)) : new Date(),
            updatedAt: row.updatedAt ? new Date(parseInt(row.updatedAt)) : new Date(),
          },
        });
        successCount++;
        console.log(`✓ Imported station: ${row.name || row.id}`);
      } catch (error) {
        errorCount++;
        console.error(`✗ Failed to import station ${row.name || row.id}:`, error.message);
      }
    }

    console.log(`\n=== Import Summary ===`);
    console.log(`Successfully imported: ${successCount}`);
    console.log(`Failed: ${errorCount}`);
    console.log(`Total: ${data.length}`);

  } catch (error) {
    console.error('Error importing stations:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the import
importStations();
#!/usr/bin/env node

/**
 * Import monitored object IDs from CSV file into database
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

class MonitoredObjectImporter {
    constructor() {
        this.prisma = new PrismaClient();
        this.csvPath = path.join(process.cwd(), 'monitorObjectId.csv');
    }

    /**
     * Parse CSV file and return structured data
     */
    parseCsvFile() {
        try {
            const csvContent = fs.readFileSync(this.csvPath, 'utf-8');
            const lines = csvContent.trim().split('\n');
            
            if (lines.length < 2) {
                throw new Error('CSV file must have at least header and one data row');
            }

            // Parse header
            const headers = lines[0].split(',').map(h => h.trim());
            console.log('📋 CSV Headers:', headers);

            // Parse data rows
            const stations = [];
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                
                if (values.length !== headers.length) {
                    console.warn(`⚠️  Row ${i + 1} has ${values.length} values but expected ${headers.length}, skipping...`);
                    continue;
                }

                const stationData = {
                    name: values[0],
                    objects: {}
                };

                // Map each object type to its ID
                for (let j = 1; j < headers.length; j++) {
                    const objectType = headers[j];
                    const objectId = values[j];
                    
                    // Only add if objectId is not empty
                    if (objectId && objectId !== '') {
                        const parsedId = parseInt(objectId);
                        if (!isNaN(parsedId)) {
                            stationData.objects[objectType] = parsedId;
                        }
                    }
                }

                stations.push(stationData);
            }

            console.log(`📊 Parsed ${stations.length} stations from CSV`);
            return stations;

        } catch (error) {
            console.error('❌ Error parsing CSV file:', error.message);
            throw error;
        }
    }

    /**
     * Import data into database
     */
    async importToDatabase(stations) {
        try {
            console.log('💾 Starting database import...');

            let totalImported = 0;
            let stationsProcessed = 0;

            for (const stationData of stations) {
                try {
                    // Find or create station
                    let station = await this.prisma.station.findUnique({
                        where: { name: stationData.name }
                    });

                    if (!station) {
                        console.log(`🏗️  Creating new station: ${stationData.name}`);
                        station = await this.prisma.station.create({
                            data: {
                                name: stationData.name,
                                ipAddress: null, // Will be set separately
                                scene: null      // Will be set separately
                            }
                        });
                    }

                    // Clear existing monitored objects for this station
                    await this.prisma.stationMonitoredObject.deleteMany({
                        where: { stationId: station.id }
                    });

                    // Insert new monitored objects
                    const objectsToCreate = Object.entries(stationData.objects).map(([objectType, objectId]) => ({
                        stationId: station.id,
                        objectType,
                        objectId
                    }));

                    if (objectsToCreate.length > 0) {
                        await this.prisma.stationMonitoredObject.createMany({
                            data: objectsToCreate
                        });

                        console.log(`✅ ${stationData.name}: imported ${objectsToCreate.length} monitored objects`);
                        totalImported += objectsToCreate.length;
                    } else {
                        console.log(`⚠️  ${stationData.name}: no valid monitored objects found`);
                    }

                    stationsProcessed++;

                } catch (error) {
                    console.error(`❌ Error processing station ${stationData.name}:`, error.message);
                }
            }

            console.log(`\n📊 Import Summary:`);
            console.log(`   - Stations processed: ${stationsProcessed}/${stations.length}`);
            console.log(`   - Total objects imported: ${totalImported}`);

        } catch (error) {
            console.error('❌ Database import failed:', error.message);
            throw error;
        }
    }

    /**
     * Verify imported data
     */
    async verifyImport() {
        try {
            console.log('\n🔍 Verifying imported data...');

            const stations = await this.prisma.station.findMany({
                include: {
                    monitoredObjects: true
                },
                orderBy: { name: 'asc' }
            });

            console.log(`\n📋 Verification Results:`);
            stations.forEach(station => {
                const objectCount = station.monitoredObjects.length;
                console.log(`   ${station.name}: ${objectCount} monitored objects`);
                
                if (objectCount > 0) {
                    const objectTypes = station.monitoredObjects.map(obj => obj.objectType).join(', ');
                    console.log(`      Types: ${objectTypes}`);
                }
            });

        } catch (error) {
            console.error('❌ Verification failed:', error.message);
        }
    }

    /**
     * Main execution
     */
    async run() {
        try {
            console.log('🚀 Starting Monitored Objects Import\n');

            // Check if CSV file exists
            if (!fs.existsSync(this.csvPath)) {
                throw new Error(`CSV file not found: ${this.csvPath}`);
            }

            // Parse CSV
            const stations = this.parseCsvFile();

            // Import to database
            await this.importToDatabase(stations);

            // Verify import
            await this.verifyImport();

            console.log('\n✅ Import completed successfully!');

        } catch (error) {
            console.error('\n❌ Import failed:', error.message);
            process.exit(1);
        } finally {
            await this.prisma.$disconnect();
        }
    }
}

// Command line interface
async function main() {
    const command = process.argv[2];

    const importer = new MonitoredObjectImporter();

    switch (command) {
        case 'import':
            await importer.run();
            break;
        case 'verify':
            await importer.verifyImport();
            await importer.prisma.$disconnect();
            break;
        default:
            console.log('📖 Usage:');
            console.log('  node src/utils/import-monitored-objects.js import  - Import CSV data');
            console.log('  node src/utils/import-monitored-objects.js verify  - Verify imported data');
            process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = MonitoredObjectImporter;
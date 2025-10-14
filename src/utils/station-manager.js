const DatabaseService = require('../database/DatabaseService');

/**
 * Station Manager Utility
 * Provides command-line interface for managing stations in the database
 */
class StationManager {
    constructor() {
        this.db = new DatabaseService();
    }

    async connect() {
        await this.db.connect();
    }

    async disconnect() {
        await this.db.disconnect();
    }

    // List all stations
    async listStations() {
        try {
            const stations = await this.db.getAllStations();
            
            if (stations.length === 0) {
                console.log('📡 No stations found in database');
                return;
            }

            console.log(`📡 Found ${stations.length} stations:\n`);
            console.log('ID'.padEnd(25) + 'Name'.padEnd(15) + 'UUID'.padEnd(40) + 'IP Address'.padEnd(25) + 'Readings');
            console.log('─'.repeat(120));
            
            stations.forEach(station => {
                console.log(
                    station.id.padEnd(25) +
                    station.name.padEnd(15) +
                    station.uuid.padEnd(40) +
                    station.ipAddress.padEnd(25) +
                    station._count.powerReadings.toString()
                );
            });

        } catch (error) {
            console.error('❌ Failed to list stations:', error.message);
        }
    }

    // Add a new station
    async addStation(name, uuid, ipAddress, scene) {
        try {
            const stationData = { name, uuid, ipAddress, scene };
            const station = await this.db.createStation(stationData);
            
            console.log('✅ Station added successfully:');
            console.log(`   ID: ${station.id}`);
            console.log(`   Name: ${station.name}`);
            console.log(`   UUID: ${station.uuid}`);
            console.log(`   IP: ${station.ipAddress}`);
            console.log(`   Scene: ${station.scene}`);

        } catch (error) {
            console.error('❌ Failed to add station:', error.message);
        }
    }

    // Update a station
    async updateStation(stationId, updateData) {
        try {
            const station = await this.db.updateStation(stationId, updateData);
            
            console.log('✅ Station updated successfully:');
            console.log(`   ID: ${station.id}`);
            console.log(`   Name: ${station.name}`);
            console.log(`   UUID: ${station.uuid}`);
            console.log(`   IP: ${station.ipAddress}`);
            console.log(`   Scene: ${station.scene}`);

        } catch (error) {
            console.error('❌ Failed to update station:', error.message);
        }
    }

    // Delete a station
    async deleteStation(stationId) {
        try {
            const station = await this.db.deleteStation(stationId);
            
            console.log('✅ Station deleted successfully:');
            console.log(`   Name: ${station.name}`);
            console.log(`   UUID: ${station.uuid}`);

        } catch (error) {
            console.error('❌ Failed to delete station:', error.message);
        }
    }

    // Find station by name
    async findStation(name) {
        try {
            const station = await this.db.getStationByName(name);
            
            if (!station) {
                console.log(`📡 Station "${name}" not found`);
                return;
            }

            console.log('📡 Station found:');
            console.log(`   ID: ${station.id}`);
            console.log(`   Name: ${station.name}`);
            console.log(`   UUID: ${station.uuid}`);
            console.log(`   IP: ${station.ipAddress}`);
            console.log(`   Scene: ${station.scene}`);
            console.log(`   Power Readings: ${station._count.powerReadings}`);
            console.log(`   Created: ${station.createdAt.toLocaleString('th-TH')}`);
            console.log(`   Updated: ${station.updatedAt.toLocaleString('th-TH')}`);

        } catch (error) {
            console.error('❌ Failed to find station:', error.message);
        }
    }

    // Seed default stations
    async seedDefaultStations() {
        const defaultStations = [
            {
                name: "แพร่",
                uuid: "361c85bd-d02f-4408-b6a4-b6d17dad82a4",
                ip: "ws://10.8.1.5/ws",
                scene: "d0cf3a77-e9dd-4419-bec0-b54ecad3e541"
            },
            {
                name: "น่าน",
                uuid: "ce4767d5-1a3f-4645-a323-a310170d911e",
                ip: "ws://10.8.2.5/ws",
                scene: "d0cf3a77-e9dd-4419-bec0-b54ecad3e541"
            },
            {
                name: "ชุมพร",
                uuid: "aad9190a-77b7-4d4b-906a-b96a51bed09f",
                ip: "ws://10.3.1.5/ws",
                scene: "d0cf3a77-e9dd-4419-bec0-b54ecad3e541"
            }
        ];

        try {
            console.log('🌱 Seeding default stations...');
            
            for (const stationConfig of defaultStations) {
                const station = await this.db.findOrCreateStation(stationConfig);
                console.log(`   ✅ ${station.name}`);
            }
            
            console.log('🌱 Default stations seeded successfully');

        } catch (error) {
            console.error('❌ Failed to seed default stations:', error.message);
        }
    }

    // Show help
    showHelp() {
        console.log('📡 Station Manager - Command Line Interface\n');
        console.log('Usage: node src/utils/station-manager.js <command> [arguments]\n');
        console.log('Commands:');
        console.log('  list                                    - List all stations');
        console.log('  add <name> <uuid> <ip> <scene>         - Add a new station');
        console.log('  find <name>                            - Find station by name');
        console.log('  update <id> <field> <value>            - Update station field');
        console.log('  delete <id>                            - Delete station by ID');
        console.log('  seed                                   - Seed default stations');
        console.log('  help                                   - Show this help\n');
        console.log('Examples:');
        console.log('  node src/utils/station-manager.js list');
        console.log('  node src/utils/station-manager.js add "เชียงใหม่" "uuid-123" "ws://10.4.1.5/ws" "scene-456"');
        console.log('  node src/utils/station-manager.js find "แพร่"');
        console.log('  node src/utils/station-manager.js seed');
    }
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === 'help') {
        const manager = new StationManager();
        manager.showHelp();
        return;
    }

    const manager = new StationManager();
    
    try {
        await manager.connect();

        switch (command) {
            case 'list':
                await manager.listStations();
                break;

            case 'add':
                if (args.length < 5) {
                    console.error('❌ Usage: add <name> <uuid> <ip> <scene>');
                    break;
                }
                await manager.addStation(args[1], args[2], args[3], args[4]);
                break;

            case 'find':
                if (args.length < 2) {
                    console.error('❌ Usage: find <name>');
                    break;
                }
                await manager.findStation(args[1]);
                break;

            case 'update':
                if (args.length < 4) {
                    console.error('❌ Usage: update <id> <field> <value>');
                    break;
                }
                const updateData = { [args[2]]: args[3] };
                await manager.updateStation(args[1], updateData);
                break;

            case 'delete':
                if (args.length < 2) {
                    console.error('❌ Usage: delete <id>');
                    break;
                }
                await manager.deleteStation(args[1]);
                break;

            case 'seed':
                await manager.seedDefaultStations();
                break;

            default:
                console.error(`❌ Unknown command: ${command}`);
                manager.showHelp();
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await manager.disconnect();
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = StationManager;
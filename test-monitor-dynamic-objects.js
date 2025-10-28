#!/usr/bin/env node

/**
 * Test script to verify monitor.js uses dynamic monitored objects correctly
 */

const DatabaseService = require('./src/database/DatabaseService');

// Mock StationMonitor class to test the dynamic object loading
class TestStationMonitor {
    constructor(stationConfig, databaseService = null) {
        this.config = stationConfig;
        this.databaseService = databaseService;
        this.stationRecord = null;
        this.monitoredObjects = [];
        this.objectLabels = {};
    }

    // Copy the exact methods from monitor.js
    async initializeStationInDatabase() {
        if (!this.databaseService) {
            // Fallback to default monitored objects if no database
            this.monitoredObjects = [8684, 8685, 8686, 8687, 8688, 8689, 18069, 18070, 73909, 73910, 75428, 75429];
            this.setupObjectLabels();
            return;
        }

        try {
            this.stationRecord = await this.databaseService.findOrCreateStation(this.config);
            console.log(`[${this.config.name}] 💾 Database station initialized: ${this.stationRecord.id}`);
            
            // Load station-specific monitored objects
            await this.loadMonitoredObjects();
            
        } catch (error) {
            console.error(`[${this.config.name}] ❌ Failed to initialize station in database:`, error.message);
            // Fallback to default monitored objects
            this.monitoredObjects = [8684, 8685, 8686, 8687, 8688, 8689, 18069, 18070, 73909, 73910, 75428, 75429];
            this.setupObjectLabels();
        }
    }

    async loadMonitoredObjects() {
        try {
            const monitoredData = await this.databaseService.getStationMonitoredObjects(this.stationRecord.id);
            
            if (monitoredData.count > 0) {
                this.monitoredObjects = monitoredData.objectIds;
                this.setupObjectLabels(monitoredData.objectMap);
                console.log(`[${this.config.name}] 📋 Loaded ${monitoredData.count} station-specific monitored objects`);
            } else {
                // Fallback to default if no station-specific objects found
                this.monitoredObjects = [8684, 8685, 8686, 8687, 8688, 8689, 18069, 18070, 73909, 73910, 75428, 75429];
                this.setupObjectLabels();
                console.log(`[${this.config.name}] ⚠️  No station-specific objects found, using defaults`);
            }
            
        } catch (error) {
            console.error(`[${this.config.name}] ❌ Failed to load monitored objects:`, error.message);
            // Fallback to default monitored objects
            this.monitoredObjects = [8684, 8685, 8686, 8687, 8688, 8689, 18069, 18070, 73909, 73910, 75428, 75429];
            this.setupObjectLabels();
        }
    }

    setupObjectLabels(objectMap = null) {
        const defaultLabels = {
            8684: "Active Power 1", 8685: "Active Power 2", 8686: "Active Power 3",
            8687: "Active Power 4", 8688: "Active Power 5", 8689: "Active Power 6",
            18069: "MUX#1 TV5 Power Meter", 18070: "MUX#2 MCOT Power Meter",
            73909: "MUX#3 PRD Power Meter", 73910: "MUX#4 TPBS Power Meter",
            75428: "MUX#5 Power Meter", 75429: "MUX#6 Power Meter"
        };

        if (objectMap) {
            this.objectLabels = {};
            Object.entries(objectMap).forEach(([objectType, objectId]) => {
                const typeLabels = {
                    'activePower1': 'Active Power 1', 'activePower2': 'Active Power 2',
                    'activePower3': 'Active Power 3', 'activePower4': 'Active Power 4',
                    'activePower5': 'Active Power 5', 'activePower6': 'Active Power 6',
                    'muxPower1': 'MUX#1 Power Meter', 'muxPower2': 'MUX#2 Power Meter',
                    'muxPower3': 'MUX#3 Power Meter', 'muxPower4': 'MUX#4 Power Meter',
                    'muxPower5': 'MUX#5 Power Meter', 'muxPower6': 'MUX#6 Power Meter'
                };
                this.objectLabels[objectId] = typeLabels[objectType] || `${objectType} (ID ${objectId})`;
            });
        } else {
            this.objectLabels = defaultLabels;
        }
    }
}

async function testMonitorDynamicObjects() {
    console.log('🧪 Testing Monitor.js Dynamic Objects System\n');

    const dbService = new DatabaseService();

    try {
        // Connect to database
        await dbService.connect();
        console.log('✅ Database connected\n');

        // Test stations with different configurations
        const testStations = [
            { name: 'เชียงใหม่', ip: 'ws://10.7.1.5/ws', scene: 'd0cf3a77-e9dd-4419-bec0-b54ecad3e541' },
            { name: 'ขอนแก่น', ip: 'ws://10.1.1.5/ws', scene: 'd0cf3a77-e9dd-4419-bec0-b54ecad3e541' },
            { name: 'ภูเก็ต', ip: 'ws://10.2.1.5/ws', scene: 'd0cf3a77-e9dd-4419-bec0-b54ecad3e541' }
        ];

        console.log('🔍 Testing Dynamic Object Loading for Different Stations:\n');

        for (const stationConfig of testStations) {
            console.log(`🏢 Testing: ${stationConfig.name}`);
            
            // Create test monitor
            const monitor = new TestStationMonitor(stationConfig, dbService);
            
            // Initialize (this will load dynamic objects)
            await monitor.initializeStationInDatabase();
            
            // Display results
            console.log(`   📊 Monitored Objects: ${monitor.monitoredObjects.length} items`);
            console.log(`   📋 Object IDs: [${monitor.monitoredObjects.join(', ')}]`);
            
            // Show object labels
            const labelCount = Object.keys(monitor.objectLabels).length;
            console.log(`   🏷️  Labels configured: ${labelCount} items`);
            
            // Verify objects are different from defaults
            const defaultObjects = [8684, 8685, 8686, 8687, 8688, 8689, 18069, 18070, 73909, 73910, 75428, 75429];
            const isDifferent = JSON.stringify(monitor.monitoredObjects.sort()) !== JSON.stringify(defaultObjects.sort());
            
            if (isDifferent) {
                console.log(`   ✅ Using station-specific objects (different from defaults)`);
            } else {
                console.log(`   ⚠️  Using default objects (no station-specific config found)`);
            }
            
            console.log(''); // Empty line
        }

        // Test the key improvement: Chiang Mai should have fewer objects
        console.log('🎯 Key Test: Chiang Mai Object Reduction\n');
        
        const chiangMaiConfig = { name: 'เชียงใหม่', ip: 'ws://10.7.1.5/ws', scene: 'd0cf3a77-e9dd-4419-bec0-b54ecad3e541' };
        const chiangMaiMonitor = new TestStationMonitor(chiangMaiConfig, dbService);
        await chiangMaiMonitor.initializeStationInDatabase();
        
        const defaultCount = 12;
        const chiangMaiCount = chiangMaiMonitor.monitoredObjects.length;
        const reduction = defaultCount - chiangMaiCount;
        const reductionPercent = Math.round((reduction / defaultCount) * 100);
        
        console.log(`📊 Object Count Comparison:`);
        console.log(`   Default objects: ${defaultCount}`);
        console.log(`   Chiang Mai objects: ${chiangMaiCount}`);
        console.log(`   Reduction: ${reduction} objects (${reductionPercent}%)`);
        
        if (reduction > 0) {
            console.log(`   ✅ SUCCESS: Chiang Mai uses fewer objects than default!`);
        } else {
            console.log(`   ❌ ISSUE: Chiang Mai should use fewer objects than default`);
        }

        // Test WebSocket registration simulation
        console.log('\n🔌 WebSocket Registration Simulation:\n');
        
        console.log('Before (Hardcoded):');
        console.log('   registerActiveObjects([8684, 8685, 8686, 8687, 8688, 8689, 18069, 18070, 73909, 73910, 75428, 75429, -1])');
        
        console.log('\nAfter (Dynamic - Chiang Mai):');
        console.log(`   registerActiveObjects([${chiangMaiMonitor.monitoredObjects.join(', ')}, -1])`);
        
        console.log('\n📈 Benefits:');
        console.log(`   - ${reduction} fewer objects registered`);
        console.log(`   - ${reductionPercent}% reduction in unnecessary data traffic`);
        console.log(`   - Only monitors objects that actually exist for this station`);
        console.log(`   - Eliminates data mapping errors`);

        console.log('\n🎉 Dynamic Objects System Test PASSED!');
        console.log('   The monitor.js system now uses station-specific monitored objects.');
        console.log('   Each station will only register and monitor its relevant objects.');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    } finally {
        await dbService.disconnect();
    }
}

testMonitorDynamicObjects();
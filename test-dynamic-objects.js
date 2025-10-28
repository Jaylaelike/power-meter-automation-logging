#!/usr/bin/env node

/**
 * Test script to verify dynamic monitored objects loading
 */

const DatabaseService = require('./src/database/DatabaseService');

async function testDynamicObjects() {
    console.log('🧪 Testing Dynamic Monitored Objects\n');

    const dbService = new DatabaseService();

    try {
        // Connect to database
        await dbService.connect();
        console.log('✅ Database connected\n');

        // Get all stations
        const stations = await dbService.getAllStations();
        console.log(`📊 Found ${stations.length} stations in database\n`);

        // Test each station's monitored objects
        for (const station of stations) {
            console.log(`🏢 Testing station: ${station.name}`);
            
            try {
                const monitoredData = await dbService.getStationMonitoredObjects(station.id);
                
                if (monitoredData.count > 0) {
                    console.log(`   ✅ Found ${monitoredData.count} monitored objects`);
                    console.log(`   📋 Object IDs: [${monitoredData.objectIds.join(', ')}]`);
                    
                    // Show object mapping
                    const objectTypes = Object.keys(monitoredData.objectMap);
                    console.log(`   🏷️  Object types: ${objectTypes.join(', ')}`);
                } else {
                    console.log(`   ⚠️  No monitored objects found - will use defaults`);
                }
                
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
            }
            
            console.log(''); // Empty line
        }

        // Test specific station by name (example)
        console.log('🔍 Testing specific station lookup...');
        try {
            const testStationName = 'เชียงใหม่'; // Test with Chiang Mai
            const monitoredData = await dbService.getMonitoredObjectsByStationName(testStationName);
            
            console.log(`✅ ${testStationName} has ${monitoredData.count} monitored objects`);
            console.log(`📋 Object IDs: [${monitoredData.objectIds.join(', ')}]`);
            
        } catch (error) {
            console.log(`⚠️  Could not find test station: ${error.message}`);
        }

        console.log('\n🎉 Dynamic objects test completed!');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    } finally {
        await dbService.disconnect();
    }
}

testDynamicObjects();
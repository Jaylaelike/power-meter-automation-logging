#!/usr/bin/env node

/**
 * Test script to verify Chiang Mai station uses correct monitored objects
 */

const DatabaseService = require('./src/database/DatabaseService');

async function testChiangMaiObjects() {
    console.log('🧪 Testing Chiang Mai Station Monitored Objects\n');

    const dbService = new DatabaseService();

    try {
        // Connect to database
        await dbService.connect();
        console.log('✅ Database connected\n');

        // Test Chiang Mai station specifically
        const stationName = 'เชียงใหม่';
        console.log(`🏢 Testing station: ${stationName}`);
        
        const monitoredData = await dbService.getMonitoredObjectsByStationName(stationName);
        
        console.log(`📊 Station Details:`);
        console.log(`   - Station ID: ${monitoredData.stationId}`);
        console.log(`   - Object Count: ${monitoredData.count}`);
        console.log(`   - Object IDs: [${monitoredData.objectIds.join(', ')}]`);
        
        console.log(`\n📋 Object Mapping:`);
        Object.entries(monitoredData.objectMap).forEach(([objectType, objectId]) => {
            console.log(`   - ${objectType}: ${objectId}`);
        });

        // Verify expected objects for Chiang Mai
        const expectedObjects = {
            'activePower1': 8684,
            'activePower3': 8686,
            'activePower4': 8687,
            'muxPower1': 18069,
            'muxPower3': 73909,
            'muxPower4': 73910
        };

        console.log(`\n🔍 Verification:`);
        let allCorrect = true;
        
        Object.entries(expectedObjects).forEach(([objectType, expectedId]) => {
            const actualId = monitoredData.objectMap[objectType];
            const isCorrect = actualId === expectedId;
            
            console.log(`   ${isCorrect ? '✅' : '❌'} ${objectType}: expected ${expectedId}, got ${actualId || 'undefined'}`);
            
            if (!isCorrect) {
                allCorrect = false;
            }
        });

        // Check for unexpected objects
        Object.entries(monitoredData.objectMap).forEach(([objectType, objectId]) => {
            if (!expectedObjects.hasOwnProperty(objectType)) {
                console.log(`   ⚠️  Unexpected object: ${objectType}: ${objectId}`);
            }
        });

        console.log(`\n📊 Test Result: ${allCorrect ? '✅ PASSED' : '❌ FAILED'}`);
        
        if (allCorrect) {
            console.log('\n🎉 Chiang Mai station has correct monitored objects!');
            console.log('   The system will now use these specific IDs instead of defaults.');
            console.log('   This solves the data mapping issue for ws://10.7.1.5/ws');
        } else {
            console.log('\n❌ Chiang Mai station configuration needs attention.');
        }

        // Show comparison with default objects
        const defaultObjects = [8684, 8685, 8686, 8687, 8688, 8689, 18069, 18070, 73909, 73910, 75428, 75429];
        const chiangMaiObjects = monitoredData.objectIds;
        
        console.log(`\n📈 Comparison:`);
        console.log(`   Default objects (${defaultObjects.length}): [${defaultObjects.join(', ')}]`);
        console.log(`   Chiang Mai objects (${chiangMaiObjects.length}): [${chiangMaiObjects.join(', ')}]`);
        
        const reduction = defaultObjects.length - chiangMaiObjects.length;
        console.log(`   📉 Reduction: ${reduction} objects (${Math.round(reduction/defaultObjects.length*100)}% fewer)`);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    } finally {
        await dbService.disconnect();
    }
}

testChiangMaiObjects();
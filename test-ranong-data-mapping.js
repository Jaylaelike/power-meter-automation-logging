#!/usr/bin/env node

/**
 * Test script to verify ระนอง station data mapping works correctly
 */

const DatabaseService = require('./src/database/DatabaseService');

async function testRanongDataMapping() {
    console.log('🧪 Testing ระนอง Station Data Mapping\n');

    const dbService = new DatabaseService();

    try {
        // Connect to database
        await dbService.connect();
        console.log('✅ Database connected\n');

        // Test the transformPowerData method with ระนอง data
        const ranongData = {
            '8684': 6499.40,  // Active Power 1
            '8685': 2997.60,  // Active Power 2
            '8687': 3027.10,  // Active Power 4
            '8688': 558.30,   // Active Power 5
            '18069': 588308.00, // MUX#1 Power Meter
            '18070': 277650.30, // MUX#2 Power Meter
            '73910': 274402.20, // MUX#4 Power Meter
            '224272': 37118.60  // MUX#5 Power Meter (ระนอง specific ID)
        };

        console.log('📊 Input Data (ระนอง):');
        Object.entries(ranongData).forEach(([id, value]) => {
            console.log(`   ID ${id}: ${value}`);
        });

        // Transform the data
        const transformedData = dbService.transformPowerData(ranongData);

        console.log('\n🔄 Transformed Data for Database:');
        Object.entries(transformedData).forEach(([field, value]) => {
            console.log(`   ${field}: ${value}`);
        });

        // Verify the mapping
        console.log('\n🔍 Verification:');
        
        const expectedMappings = {
            'activePower1': 6499.40,
            'activePower2': 2997.60,
            'activePower4': 3027.10,
            'activePower5': 558.30,
            'muxPower1': 588308.00,
            'muxPower2': 277650.30,
            'muxPower4': 274402.20,
            'muxPower5': 37118.60  // This should now work with ID 224272
        };

        let allCorrect = true;
        Object.entries(expectedMappings).forEach(([field, expectedValue]) => {
            const actualValue = transformedData[field];
            const isCorrect = actualValue === expectedValue;
            
            console.log(`   ${isCorrect ? '✅' : '❌'} ${field}: expected ${expectedValue}, got ${actualValue || 'null'}`);
            
            if (!isCorrect) {
                allCorrect = false;
            }
        });

        // Check for missing fields
        const missingFields = [];
        Object.keys(expectedMappings).forEach(field => {
            if (transformedData[field] === undefined || transformedData[field] === null) {
                missingFields.push(field);
            }
        });

        console.log(`\n📊 Test Result: ${allCorrect ? '✅ PASSED' : '❌ FAILED'}`);
        
        if (allCorrect) {
            console.log('\n🎉 ระนอง data mapping is working correctly!');
            console.log('   All MUX Power Meter values will now be saved to database.');
            console.log('   The issue with missing muxPower5 (ID 224272) is resolved.');
        } else {
            console.log('\n❌ ระนอง data mapping has issues:');
            if (missingFields.length > 0) {
                console.log(`   Missing fields: ${missingFields.join(', ')}`);
            }
        }

        // Test other stations with alternative IDs
        console.log('\n🔍 Testing Other Stations with Alternative IDs:');
        
        const testCases = [
            { station: 'สกลนคร', id: '18053', field: 'muxPower6', value: 22996.40 },
            { station: 'ร้อยเอ็ด', id: '75432', field: 'muxPower5', value: 42857.50 },
            { station: 'ภูเก็ต', id: '75483', field: 'muxPower5', value: 75483.00 },
            { station: 'ภูเก็ต', id: '75484', field: 'muxPower6', value: 75484.00 }
        ];

        testCases.forEach(testCase => {
            const testData = { [testCase.id]: testCase.value };
            const result = dbService.transformPowerData(testData);
            const isCorrect = result[testCase.field] === testCase.value;
            
            console.log(`   ${isCorrect ? '✅' : '❌'} ${testCase.station} ID ${testCase.id} → ${testCase.field}: ${result[testCase.field] || 'null'}`);
        });

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    } finally {
        await dbService.disconnect();
    }
}

testRanongDataMapping();
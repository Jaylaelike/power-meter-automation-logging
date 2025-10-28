#!/usr/bin/env node

/**
 * Migration script to update database schema and import monitored objects
 */

const { execSync } = require('child_process');
const path = require('path');

async function runMigration() {
    console.log('🚀 Starting Monitored Objects Migration\n');

    try {
        // Step 1: Generate Prisma client with new schema
        console.log('1️⃣  Generating Prisma client...');
        execSync('npx prisma generate', { stdio: 'inherit' });
        console.log('✅ Prisma client generated\n');

        // Step 2: Push schema changes to database
        console.log('2️⃣  Pushing schema changes to database...');
        execSync('npx prisma db push', { stdio: 'inherit' });
        console.log('✅ Schema updated\n');

        // Step 3: Import monitored objects from CSV
        console.log('3️⃣  Importing monitored objects from CSV...');
        execSync('npm run objects:import', { stdio: 'inherit' });
        console.log('✅ Monitored objects imported\n');

        // Step 4: Verify import
        console.log('4️⃣  Verifying import...');
        execSync('npm run objects:verify', { stdio: 'inherit' });
        console.log('✅ Import verified\n');

        console.log('🎉 Migration completed successfully!');
        console.log('\n📋 Next steps:');
        console.log('   1. Test the system: node monitor.js simultaneous');
        console.log('   2. Check that stations use their specific monitored objects');
        console.log('   3. Verify data is being collected correctly');

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.log('\n🔧 Troubleshooting:');
        console.log('   1. Make sure the database is accessible');
        console.log('   2. Check that monitorObjectId.csv exists and is properly formatted');
        console.log('   3. Verify Prisma schema is valid');
        process.exit(1);
    }
}

runMigration();
#!/usr/bin/env node

/**
 * Test script to verify chaigmai.js can start without syntax errors
 */

const { spawn } = require('child_process');

async function testChiangMaiStartup() {
    console.log('🧪 Testing Chiang Mai Startup (chaigmai.js)\n');

    return new Promise((resolve) => {
        console.log('🚀 Starting chaigmai.js process...');
        
        const process = spawn('node', ['chaigmai.js'], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let hasOutput = false;
        let hasError = false;
        let errorOutput = '';

        // Capture stdout
        process.stdout.on('data', (data) => {
            const output = data.toString().trim();
            if (output) {
                console.log(`✅ Output: ${output}`);
                hasOutput = true;
            }
        });

        // Capture stderr
        process.stderr.on('data', (data) => {
            const error = data.toString().trim();
            if (error) {
                console.error(`❌ Error: ${error}`);
                errorOutput += error + '\n';
                hasError = true;
            }
        });

        // Handle process events
        process.on('error', (error) => {
            console.error(`❌ Process error: ${error.message}`);
            hasError = true;
        });

        process.on('close', (code) => {
            console.log(`\n📊 Process exited with code: ${code}`);
        });

        // Kill process after 10 seconds
        setTimeout(() => {
            console.log('\n⏹️  Stopping test process...');
            process.kill('SIGTERM');
            
            setTimeout(() => {
                console.log('\n📋 Test Results:');
                console.log(`   - Process started: ✅`);
                console.log(`   - Has output: ${hasOutput ? '✅' : '❌'}`);
                console.log(`   - Has syntax errors: ${hasError ? '❌' : '✅'}`);
                
                if (hasError) {
                    console.log('\n❌ Errors detected:');
                    console.log(errorOutput);
                    console.log('\n🔧 The syntax error in chaigmai.js needs to be fixed.');
                } else {
                    console.log('\n✅ Chiang Mai startup test PASSED!');
                    console.log('   - No syntax errors detected');
                    console.log('   - Process starts successfully');
                    console.log('   - Ready for integration with monitor.js');
                }
                
                resolve(!hasError);
            }, 1000);
        }, 10000);
    });
}

testChiangMaiStartup().then(success => {
    process.exit(success ? 0 : 1);
});
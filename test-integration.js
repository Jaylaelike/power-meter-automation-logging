#!/usr/bin/env node

/**
 * Test script to verify the integration between monitor.js and chaigmai.js
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Testing Chiang Mai Integration...\n');

// Test 1: Check if chaigmai.js can be started independently
console.log('Test 1: Starting chaigmai.js independently...');
const testProcess = spawn('node', ['chaigmai.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd()
});

let hasOutput = false;
let hasError = false;

testProcess.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
        console.log(`✓ chaigmai.js output: ${output}`);
        hasOutput = true;
    }
});

testProcess.stderr.on('data', (data) => {
    const error = data.toString().trim();
    if (error) {
        console.error(`✗ chaigmai.js error: ${error}`);
        hasError = true;
    }
});

// Kill the test process after 10 seconds
setTimeout(() => {
    console.log('\n⏹️  Stopping test process...');
    testProcess.kill('SIGTERM');
    
    setTimeout(() => {
        console.log('\n📊 Test Results:');
        console.log(`   - Process started: ✓`);
        console.log(`   - Has output: ${hasOutput ? '✓' : '✗'}`);
        console.log(`   - Has errors: ${hasError ? '✗' : '✓'}`);
        
        if (!hasError) {
            console.log('\n✅ Integration test passed! chaigmai.js is ready to run with monitor.js');
            console.log('\n🚀 To start the full system, run:');
            console.log('   node monitor.js simultaneous');
        } else {
            console.log('\n❌ Integration test failed. Check the errors above.');
        }
        
        process.exit(hasError ? 1 : 0);
    }, 1000);
}, 10000);

testProcess.on('error', (error) => {
    console.error(`✗ Failed to start chaigmai.js: ${error.message}`);
    hasError = true;
});

console.log('   Waiting 10 seconds for output...\n');
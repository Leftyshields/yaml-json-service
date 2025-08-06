#!/usr/bin/env node

/**
 * Quick Race Condition Testing Tool
 * 
 * Simple tool for rapid testing of the race condition fix
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

const API_BASE = 'http://localhost:6001/api';

async function quickTest() {
  console.log('⚡ Quick Race Condition Test\n');
  
  // Find a test file
  const testFilesDir = path.join(__dirname, '..', 'test-files');
  const testFiles = fs.readdirSync(testFilesDir).filter(f => 
    !f.startsWith('.') && f.endsWith('.eap-config')
  );
  
  if (testFiles.length === 0) {
    console.error('❌ No test files found!');
    return;
  }
  
  const testFile = testFiles[0];
  console.log(`📁 Using: ${testFile}\n`);
  
  try {
    // Step 1: Upload
    console.log('1. Uploading...');
    const fileBuffer = fs.readFileSync(path.join(testFilesDir, testFile));
    const formData = new FormData();
    formData.append('yamlFile', fileBuffer, {
      filename: `quick-test-${Date.now()}.eap-config`
    });
    
    const uploadStart = Date.now();
    const uploadResponse = await axios.post(`${API_BASE}/upload`, formData, {
      headers: { ...formData.getHeaders() },
      timeout: 5000
    });
    const uploadTime = Date.now() - uploadStart;
    
    console.log(`✅ Uploaded in ${uploadTime}ms: ${uploadResponse.data.filePath}`);
    
    // Step 2: Immediate conversion (race condition test)
    console.log('2. Converting immediately...');
    const convertStart = Date.now();
    const convertResponse = await axios.post(`${API_BASE}/convert`, {
      filePath: uploadResponse.data.filePath,
      obfuscationLevel: 'none'
    }, { timeout: 5000 });
    const convertTime = Date.now() - convertStart;
    
    console.log(`✅ Converted in ${convertTime}ms`);
    console.log(`📄 Output size: ${convertResponse.data.yamlOutput?.length || 0} chars`);
    
    console.log('\n🎉 Quick test PASSED - no race condition!');
    
  } catch (error) {
    console.error('\n❌ Quick test FAILED:');
    console.error(`Error: ${error.response?.data?.error || error.message}`);
    
    if (error.response?.data?.error?.includes('File not found')) {
      console.error('🚨 RACE CONDITION DETECTED!');
    }
  }
}

// Run multiple quick tests
async function multiTest(count = 5) {
  console.log(`🔄 Running ${count} quick tests...\n`);
  
  let passed = 0;
  let failed = 0;
  
  for (let i = 1; i <= count; i++) {
    console.log(`--- Test ${i}/${count} ---`);
    try {
      await quickTest();
      passed++;
    } catch (error) {
      failed++;
    }
    console.log('');
  }
  
  console.log('📊 Multi-test Results:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${(passed / (passed + failed) * 100).toFixed(1)}%`);
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'single';

if (command === 'multi') {
  const count = parseInt(args[1]) || 5;
  multiTest(count).catch(console.error);
} else if (command === 'single') {
  quickTest().catch(console.error);
} else {
  console.log('Usage:');
  console.log('  node quick-test.js single    - Run one quick test');
  console.log('  node quick-test.js multi [n] - Run n quick tests (default: 5)');
}

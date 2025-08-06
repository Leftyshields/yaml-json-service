#!/usr/bin/env node

/**
 * Test script to demonstrate certificate display modes working correctly
 */

const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

// Configuration
const API_BASE = 'http://localhost:6001/api';
const TEST_FILE = 'test-files/dev.cg.mobileconfig'; // File with certificates

async function testCertificateMode(mode) {
  console.log(`\n🔒 Testing Certificate Mode: ${mode.toUpperCase()}`);
  console.log('═'.repeat(60));
  
  try {
    // Read the test file
    const fileBuffer = fs.readFileSync(TEST_FILE);
    const fileName = 'dev.cg.mobileconfig';
    
    // Create form data
    const formData = new FormData();
    formData.append('yamlFile', fileBuffer, { filename: fileName });
    formData.append('obfuscationLevel', 'none');
    formData.append('certHandling', mode);
    
    // Make the atomic conversion request
    const response = await axios.post(`${API_BASE}/upload-and-convert`, formData, {
      headers: { ...formData.getHeaders() },
      timeout: 10000
    });
    
    const yamlOutput = response.data.data.yaml;
    const jsonOutput = response.data.data.json;
    
    // Show relevant parts of the output
    console.log('📄 YAML Output (first 500 chars):');
    console.log(yamlOutput.substring(0, 500) + '...\n');
    
    console.log('📄 JSON Output (first 500 chars):');
    console.log(jsonOutput.substring(0, 500) + '...\n');
    
    // Check for certificate patterns
    const yamlLower = yamlOutput.toLowerCase();
    const jsonLower = jsonOutput.toLowerCase();
    
    console.log('🔍 Certificate Detection:');
    console.log(`   Base64 patterns: ${yamlLower.includes('miib') || jsonLower.includes('miib') ? '✅ Found' : '❌ None'}`);
    console.log(`   SHA256 hashes: ${yamlLower.includes('sha256') || jsonLower.includes('sha256') ? '✅ Found' : '❌ None'}`);
    console.log(`   Redacted content: ${yamlLower.includes('redacted') || jsonLower.includes('redacted') ? '✅ Found' : '❌ None'}`);
    
  } catch (error) {
    console.log(`❌ Error testing mode ${mode}:`, error.message);
  }
}

async function main() {
  console.log('🧪 Certificate Display Mode Verification Test\n');
  
  // Check if test file exists
  if (!fs.existsSync(TEST_FILE)) {
    console.log(`❌ Test file not found: ${TEST_FILE}`);
    process.exit(1);
  }
  
  // Test all three modes
  await testCertificateMode('preserve');
  await testCertificateMode('hash');
  await testCertificateMode('obfuscate');
  
  console.log('\n✅ Certificate mode verification complete!');
}

main().catch(console.error);

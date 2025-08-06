#!/usr/bin/env node

/**
 * Race Condition Simulator and Local Testing Tool
 * 
 * This tool helps test the race condition fix locally by:
 * 1. Simulating high-frequency uploads and conversions
 * 2. Testing different file types and sizes
 * 3. Simulating production-like timing conditions
 * 4. Stress testing with concurrent operations
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');
const { performance } = require('perf_hooks');

const API_BASE = 'http://localhost:6001/api';
const TEST_FILES_DIR = path.join(__dirname, '..', 'test-files');

// Configuration
const CONFIG = {
  // Number of concurrent uploads to simulate
  CONCURRENT_UPLOADS: 10,
  
  // Delay between upload and conversion (ms) - set to 0 to maximize race condition chance
  UPLOAD_CONVERSION_DELAY: 0,
  
  // Number of rapid conversions per file
  RAPID_CONVERSIONS: 5,
  
  // Timeout for requests (ms)
  REQUEST_TIMEOUT: 10000,
  
  // Simulate slow filesystem (add artificial delays)
  SIMULATE_SLOW_FS: false,
  SLOW_FS_DELAY: 50
};

class RaceConditionTester {
  constructor() {
    this.results = {
      totalTests: 0,
      successes: 0,
      failures: 0,
      raceConditionErrors: 0,
      averageUploadTime: 0,
      averageConversionTime: 0,
      errors: []
    };
  }

  async getTestFiles() {
    try {
      const files = fs.readdirSync(TEST_FILES_DIR);
      return files.filter(file => 
        !file.startsWith('.') && 
        fs.statSync(path.join(TEST_FILES_DIR, file)).isFile()
      );
    } catch (error) {
      console.error('❌ Error reading test files:', error.message);
      return [];
    }
  }

  async uploadFile(filePath, testId) {
    const startTime = performance.now();
    
    try {
      const fileBuffer = fs.readFileSync(path.join(TEST_FILES_DIR, filePath));
      const formData = new FormData();
      
      // Create unique filename for this test
      const uniqueFilename = `test-${testId}-${Date.now()}-${filePath}`;
      
      formData.append('yamlFile', fileBuffer, {
        filename: uniqueFilename,
        contentType: this.getContentType(filePath)
      });

      if (CONFIG.SIMULATE_SLOW_FS) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.SLOW_FS_DELAY));
      }

      const response = await axios.post(`${API_BASE}/upload`, formData, {
        headers: { ...formData.getHeaders() },
        timeout: CONFIG.REQUEST_TIMEOUT
      });

      const uploadTime = performance.now() - startTime;
      this.results.averageUploadTime += uploadTime;

      console.log(`✅ Upload ${testId}: ${filePath} → ${response.data.filePath} (${uploadTime.toFixed(2)}ms)`);
      
      return {
        success: true,
        filePath: response.data.filePath,
        originalFile: filePath,
        uploadTime,
        testId
      };
      
    } catch (error) {
      const uploadTime = performance.now() - startTime;
      console.error(`❌ Upload ${testId} failed: ${error.response?.data?.error || error.message}`);
      
      this.results.failures++;
      this.results.errors.push({
        type: 'upload',
        testId,
        file: filePath,
        error: error.response?.data || error.message,
        time: uploadTime
      });
      
      return { success: false, error: error.message, testId };
    }
  }

  async convertFile(uploadResult, conversionId = 1) {
    if (!uploadResult.success) return { success: false, reason: 'Upload failed' };

    const startTime = performance.now();
    
    try {
      // Add configurable delay to test race conditions
      if (CONFIG.UPLOAD_CONVERSION_DELAY > 0) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.UPLOAD_CONVERSION_DELAY));
      }

      const response = await axios.post(`${API_BASE}/convert`, {
        filePath: uploadResult.filePath,
        obfuscationLevel: conversionId % 2 === 0 ? 'none' : 'mask',
        certHandling: conversionId % 3 === 0 ? 'preserve' : 'obfuscate'
      }, {
        timeout: CONFIG.REQUEST_TIMEOUT
      });

      const conversionTime = performance.now() - startTime;
      this.results.averageConversionTime += conversionTime;
      this.results.successes++;

      console.log(`✅ Convert ${uploadResult.testId}-${conversionId}: ${uploadResult.filePath} (${conversionTime.toFixed(2)}ms)`);
      
      return {
        success: true,
        conversionTime,
        hasOutput: !!response.data.yamlOutput,
        outputSize: response.data.yamlOutput?.length || 0
      };
      
    } catch (error) {
      const conversionTime = performance.now() - startTime;
      this.results.failures++;
      
      const isRaceCondition = error.response?.data?.error?.includes('File not found on server');
      if (isRaceCondition) {
        this.results.raceConditionErrors++;
        console.error(`🚨 RACE CONDITION ${uploadResult.testId}-${conversionId}: ${error.response.data.error}`);
      } else {
        console.error(`❌ Convert ${uploadResult.testId}-${conversionId} failed: ${error.response?.data?.error || error.message}`);
      }
      
      this.results.errors.push({
        type: 'conversion',
        testId: uploadResult.testId,
        conversionId,
        file: uploadResult.filePath,
        error: error.response?.data || error.message,
        isRaceCondition,
        time: conversionTime
      });
      
      return { success: false, error: error.message, isRaceCondition };
    }
  }

  getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const contentTypes = {
      '.xml': 'application/xml',
      '.yaml': 'application/x-yaml',
      '.yml': 'application/x-yaml',
      '.json': 'application/json',
      '.mobileconfig': 'application/x-apple-aspen-config',
      '.eap-config': 'application/xml',
      '.txt': 'text/plain',
      '.conf': 'text/plain',
      '.cfg': 'text/plain'
    };
    return contentTypes[ext] || 'application/octet-stream';
  }

  async runConcurrentTest() {
    console.log('🏁 Starting Concurrent Upload/Conversion Test...\n');
    
    const testFiles = await this.getTestFiles();
    if (testFiles.length === 0) {
      console.error('❌ No test files found!');
      return;
    }

    console.log(`📁 Found ${testFiles.length} test files`);
    console.log(`🔧 Config: ${CONFIG.CONCURRENT_UPLOADS} concurrent uploads, ${CONFIG.RAPID_CONVERSIONS} conversions each\n`);

    const allPromises = [];
    let testCounter = 1;

    // Create concurrent upload promises
    for (let i = 0; i < CONFIG.CONCURRENT_UPLOADS; i++) {
      const testFile = testFiles[i % testFiles.length];
      const testId = testCounter++;
      
      const testPromise = this.runSingleTest(testFile, testId);
      allPromises.push(testPromise);
    }

    const startTime = performance.now();
    await Promise.all(allPromises);
    const totalTime = performance.now() - startTime;

    this.printResults(totalTime);
  }

  async runSingleTest(testFile, testId) {
    try {
      // Step 1: Upload
      const uploadResult = await this.uploadFile(testFile, testId);
      this.results.totalTests++;

      if (!uploadResult.success) {
        return;
      }

      // Step 2: Multiple rapid conversions to stress test
      const conversionPromises = [];
      for (let i = 1; i <= CONFIG.RAPID_CONVERSIONS; i++) {
        conversionPromises.push(this.convertFile(uploadResult, i));
      }

      await Promise.all(conversionPromises);
      
    } catch (error) {
      console.error(`💥 Test ${testId} crashed:`, error.message);
      this.results.errors.push({
        type: 'crash',
        testId,
        file: testFile,
        error: error.message
      });
    }
  }

  async runStressTest() {
    console.log('💪 Starting Stress Test - Maximum Load Simulation...\n');
    
    // Override config for stress test
    const originalConfig = { ...CONFIG };
    CONFIG.CONCURRENT_UPLOADS = 20;
    CONFIG.RAPID_CONVERSIONS = 10;
    CONFIG.UPLOAD_CONVERSION_DELAY = 0; // No delay - maximum race condition chance
    CONFIG.SIMULATE_SLOW_FS = true;
    CONFIG.SLOW_FS_DELAY = 25;

    await this.runConcurrentTest();
    
    // Restore original config
    Object.assign(CONFIG, originalConfig);
  }

  printResults(totalTime) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(60));
    
    const totalOperations = this.results.totalTests * (CONFIG.RAPID_CONVERSIONS + 1); // +1 for upload
    const successRate = (this.results.successes / (this.results.successes + this.results.failures)) * 100;
    
    console.log(`🔢 Total Operations: ${totalOperations}`);
    console.log(`✅ Successful: ${this.results.successes}`);
    console.log(`❌ Failed: ${this.results.failures}`);
    console.log(`📈 Success Rate: ${successRate.toFixed(2)}%`);
    console.log(`⏱️  Total Time: ${totalTime.toFixed(2)}ms`);
    console.log(`📁 Files Tested: ${this.results.totalTests}`);
    
    if (this.results.raceConditionErrors > 0) {
      console.log(`🚨 RACE CONDITIONS DETECTED: ${this.results.raceConditionErrors}`);
      console.log('   This indicates the race condition fix may need improvement!');
    } else {
      console.log('✅ NO RACE CONDITIONS DETECTED - Fix is working!');
    }
    
    if (this.results.successes > 0) {
      console.log(`⚡ Avg Upload Time: ${(this.results.averageUploadTime / this.results.totalTests).toFixed(2)}ms`);
      console.log(`⚡ Avg Conversion Time: ${(this.results.averageConversionTime / this.results.successes).toFixed(2)}ms`);
    }
    
    if (this.results.errors.length > 0) {
      console.log('\n🔍 ERROR BREAKDOWN:');
      const errorsByType = this.results.errors.reduce((acc, error) => {
        const key = error.isRaceCondition ? 'race-condition' : error.type;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      
      Object.entries(errorsByType).forEach(([type, count]) => {
        console.log(`   ${type}: ${count}`);
      });
    }
    
    console.log('='.repeat(60));
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'test';
  
  const tester = new RaceConditionTester();
  
  console.log('🧪 Race Condition Local Testing Tool\n');
  
  switch (command) {
    case 'test':
    case 'concurrent':
      await tester.runConcurrentTest();
      break;
      
    case 'stress':
      await tester.runStressTest();
      break;
      
    case 'help':
      console.log('Usage:');
      console.log('  node race-condition-simulator.js [command]');
      console.log('');
      console.log('Commands:');
      console.log('  test, concurrent   - Run concurrent upload/conversion test (default)');
      console.log('  stress            - Run maximum load stress test');
      console.log('  help              - Show this help');
      console.log('');
      console.log('Configuration can be modified at the top of this file.');
      break;
      
    default:
      console.log(`❌ Unknown command: ${command}`);
      console.log('Run with "help" for usage information.');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { RaceConditionTester, CONFIG };

#!/usr/bin/env node

/**
 * Production Environment Simulator
 * 
 * This tool simulates production conditions locally by:
 * 1. Setting production-like environment variables
 * 2. Enabling rate limiting and load simulation
 * 3. Using production paths and configurations
 * 4. Adding network latency and server load simulation
 */

const { spawn } = require('child_process');
const path = require('path');

class ProductionSimulator {
  constructor() {
    this.originalEnv = { ...process.env };
    this.processes = [];
  }

  setupProductionEnvironment() {
    console.log('🏭 Setting up production-like environment...\n');
    
    // Production environment variables
    const productionEnv = {
      ...this.originalEnv,
      NODE_ENV: 'production',
      FUNCTION_TARGET: 'true', // Forces use of /tmp directory
      SIMULATE_NETWORK_LATENCY: 'true',
      SIMULATE_SERVER_LOAD: 'true',
      SIMULATE_MEMORY_PRESSURE: 'true',
      RATE_LIMIT_TYPE: 'aggressive',
      PORT: '6001'
    };

    console.log('🔧 Production Environment Variables:');
    console.log('   NODE_ENV=production');
    console.log('   FUNCTION_TARGET=true (forces /tmp uploads)');
    console.log('   SIMULATE_NETWORK_LATENCY=true');
    console.log('   SIMULATE_SERVER_LOAD=true');
    console.log('   SIMULATE_MEMORY_PRESSURE=true');
    console.log('   RATE_LIMIT_TYPE=aggressive');
    console.log('');

    return productionEnv;
  }

  async startProductionBackend() {
    console.log('🚀 Starting backend with production simulation...\n');
    
    const env = this.setupProductionEnvironment();
    
    const backendProcess = spawn('node', ['src/app.js'], {
      env,
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });

    backendProcess.on('error', (error) => {
      console.error('❌ Backend process error:', error.message);
    });

    backendProcess.on('exit', (code) => {
      console.log(`🛑 Backend process exited with code ${code}`);
    });

    this.processes.push(backendProcess);
    
    // Wait for backend to start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('✅ Production backend is running on http://localhost:6001');
    console.log('');
    
    return backendProcess;
  }

  async startProductionFrontend() {
    console.log('🎨 Starting frontend for production testing...\n');
    
    const frontendProcess = spawn('npm', ['run', 'dev'], {
      cwd: path.join(__dirname, '..', 'public'),
      stdio: 'inherit'
    });

    frontendProcess.on('error', (error) => {
      console.error('❌ Frontend process error:', error.message);
    });

    frontendProcess.on('exit', (code) => {
      console.log(`🛑 Frontend process exited with code ${code}`);
    });

    this.processes.push(frontendProcess);
    
    // Wait for frontend to start
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('✅ Frontend is running on http://localhost:5173');
    console.log('');
    
    return frontendProcess;
  }

  async runProductionTest() {
    console.log('🧪 Running production simulation test...\n');
    
    try {
      // Start services
      await this.startProductionBackend();
      await this.startProductionFrontend();
      
      console.log('🎯 Production environment is ready for testing!');
      console.log('');
      console.log('📋 What to test:');
      console.log('   1. Open http://localhost:5173 in your browser');
      console.log('   2. Upload files rapidly to trigger rate limits');
      console.log('   3. Try multiple conversions simultaneously');
      console.log('   4. Monitor the console for production-like behavior');
      console.log('');
      console.log('🔧 Running race condition tests automatically...');
      console.log('');
      
      // Wait a bit more for services to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Run automated race condition tests
      const { RaceConditionTester } = require('./race-condition-simulator');
      const tester = new RaceConditionTester();
      
      console.log('🏁 Starting production race condition simulation...');
      await tester.runStressTest();
      
    } catch (error) {
      console.error('❌ Production simulation failed:', error.message);
    }
  }

  cleanup() {
    console.log('\n🧹 Cleaning up production simulation...');
    
    this.processes.forEach((process, index) => {
      if (process && !process.killed) {
        console.log(`   Stopping process ${index + 1}...`);
        process.kill('SIGTERM');
      }
    });
    
    // Restore original environment
    Object.keys(process.env).forEach(key => {
      if (!(key in this.originalEnv)) {
        delete process.env[key];
      }
    });
    
    Object.assign(process.env, this.originalEnv);
    
    console.log('✅ Cleanup complete');
  }
}

// Load Testing Functions
async function runLoadTest() {
  console.log('💪 Starting Load Test...\n');
  
  const axios = require('axios');
  const FormData = require('form-data');
  const fs = require('fs');
  
  const API_BASE = 'http://localhost:6001/api';
  const results = {
    requests: 0,
    successes: 0,
    failures: 0,
    rateLimited: 0,
    raceConditions: 0
  };
  
  // Create a test file
  const testContent = JSON.stringify({ test: 'data', timestamp: Date.now() });
  const testFilePath = '/tmp/load-test.json';
  fs.writeFileSync(testFilePath, testContent);
  
  console.log('🔥 Sending rapid requests to test rate limiting...');
  
  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(makeTestRequest(i, testFilePath, results));
  }
  
  await Promise.allSettled(promises);
  
  console.log('\n📊 Load Test Results:');
  console.log(`   Total Requests: ${results.requests}`);
  console.log(`   Successes: ${results.successes}`);
  console.log(`   Failures: ${results.failures}`);
  console.log(`   Rate Limited: ${results.rateLimited}`);
  console.log(`   Race Conditions: ${results.raceConditions}`);
  
  // Cleanup
  try {
    fs.unlinkSync(testFilePath);
  } catch (error) {
    // Ignore cleanup errors
  }
}

async function makeTestRequest(index, filePath, results) {
  try {
    results.requests++;
    
    const fileBuffer = fs.readFileSync(filePath);
    const formData = new FormData();
    formData.append('yamlFile', fileBuffer, {
      filename: `load-test-${index}-${Date.now()}.json`,
      contentType: 'application/json'
    });
    
    const response = await axios.post(`${API_BASE}/upload`, formData, {
      headers: { ...formData.getHeaders() },
      timeout: 5000
    });
    
    results.successes++;
    console.log(`✅ Request ${index}: Upload successful`);
    
    // Try immediate conversion
    const convertResponse = await axios.post(`${API_BASE}/convert`, {
      filePath: response.data.filePath,
      obfuscationLevel: 'none'
    }, { timeout: 5000 });
    
    console.log(`✅ Request ${index}: Conversion successful`);
    
  } catch (error) {
    results.failures++;
    
    if (error.response?.status === 429) {
      results.rateLimited++;
      console.log(`⏰ Request ${index}: Rate limited`);
    } else if (error.response?.data?.error?.includes('File not found')) {
      results.raceConditions++;
      console.log(`🚨 Request ${index}: Race condition detected!`);
    } else {
      console.log(`❌ Request ${index}: ${error.response?.data?.error || error.message}`);
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'simulate';
  
  const simulator = new ProductionSimulator();
  
  // Handle cleanup on exit
  process.on('SIGINT', () => {
    simulator.cleanup();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    simulator.cleanup();
    process.exit(0);
  });
  
  console.log('🏭 Production Environment Simulator\n');
  
  switch (command) {
    case 'simulate':
    case 'prod':
      await simulator.runProductionTest();
      break;
      
    case 'load':
      await runLoadTest();
      break;
      
    case 'help':
      console.log('Usage:');
      console.log('  node production-simulator.js [command]');
      console.log('');
      console.log('Commands:');
      console.log('  simulate, prod    - Start full production simulation (default)');
      console.log('  load             - Run load test against running server');
      console.log('  help             - Show this help');
      console.log('');
      console.log('The production simulation will:');
      console.log('  - Set production environment variables');
      console.log('  - Enable rate limiting and load simulation');
      console.log('  - Use /tmp directory for uploads (like production)');
      console.log('  - Add network latency and server load simulation');
      console.log('  - Run automated race condition tests');
      break;
      
    default:
      console.log(`❌ Unknown command: ${command}`);
      console.log('Run with "help" for usage information.');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Production simulator crashed:', error.message);
    process.exit(1);
  });
}

module.exports = { ProductionSimulator };

# Testing Tools for Race Condition and Production Simulation

This directory contains comprehensive testing tools to help you test race conditions, rate limiting, and production-like conditions locally.

## 🧪 Available Testing Tools

### 1. Quick Test (`quick-test.js`)
Simple, fast testing for basic race condition verification.

```bash
# Run a single quick test
node test-tools/quick-test.js single

# Run multiple tests
node test-tools/quick-test.js multi 10
```

**What it tests:**
- Upload → immediate conversion (primary race condition scenario)
- Basic functionality verification
- Response timing

### 2. Race Condition Simulator (`race-condition-simulator.js`)
Comprehensive testing tool for race conditions under various conditions.

```bash
# Standard concurrent test
node test-tools/race-condition-simulator.js test

# Maximum stress test
node test-tools/race-condition-simulator.js stress

# Help
node test-tools/race-condition-simulator.js help
```

**Features:**
- Configurable concurrent uploads (default: 10)
- Multiple rapid conversions per file (default: 5)
- Configurable delays and timing
- Comprehensive statistics and error reporting
- Race condition detection

**Configuration** (edit the CONFIG object in the file):
```javascript
const CONFIG = {
  CONCURRENT_UPLOADS: 10,        // Number of simultaneous uploads
  UPLOAD_CONVERSION_DELAY: 0,    // Delay between upload and conversion (ms)
  RAPID_CONVERSIONS: 5,          // Conversions per uploaded file
  REQUEST_TIMEOUT: 10000,        // Request timeout (ms)
  SIMULATE_SLOW_FS: false,       // Add filesystem delays
  SLOW_FS_DELAY: 50             // Filesystem delay (ms)
};
```

### 3. Production Simulator (`production-simulator.js`)
Simulates production environment conditions locally.

```bash
# Full production simulation
node test-tools/production-simulator.js simulate

# Load testing only
node test-tools/production-simulator.js load

# Help
node test-tools/production-simulator.js help
```

**What it simulates:**
- Production environment variables (`NODE_ENV=production`)
- Production upload directory (`/tmp/` instead of `src/config/uploads/`)
- Network latency (100-300ms)
- Server load simulation
- Memory pressure
- Rate limiting

## 🚀 Quick Start Testing

### Test the Race Condition Fix
```bash
# 1. Ensure your development server is running
./dev-start.sh

# 2. Run a quick test
node test-tools/quick-test.js single

# 3. Run comprehensive tests
node test-tools/race-condition-simulator.js test

# 4. Run stress test
node test-tools/race-condition-simulator.js stress
```

### Test Rate Limiting
```bash
# 1. Start production simulation (includes rate limiting)
node test-tools/production-simulator.js simulate

# 2. In another terminal, run load tests
node test-tools/production-simulator.js load
```

## 📊 Understanding Test Results

### Race Condition Simulator Output
```
📊 TEST RESULTS SUMMARY
====================================
🔢 Total Operations: 55
✅ Successful: 50
❌ Failed: 5
📈 Success Rate: 90.91%
⏱️  Total Time: 2451.23ms
📁 Files Tested: 10
✅ NO RACE CONDITIONS DETECTED - Fix is working!
⚡ Avg Upload Time: 89.23ms
⚡ Avg Conversion Time: 145.67ms
```

### Key Metrics:
- **Success Rate**: Should be >95% for a working fix
- **Race Conditions Detected**: Should be 0 with the fix applied
- **Average Times**: Upload ~50-200ms, Conversion ~100-500ms

### Error Types:
- **race-condition**: File not found errors (should be 0)
- **upload**: File upload failures
- **conversion**: File conversion failures
- **crash**: Unexpected errors

## 🔧 Environment Variables for Testing

Set these in your shell to enable various simulation modes:

```bash
# Production simulation
export NODE_ENV=production
export FUNCTION_TARGET=true

# Load simulation
export SIMULATE_NETWORK_LATENCY=true
export SIMULATE_SERVER_LOAD=true
export SIMULATE_MEMORY_PRESSURE=true

# Rate limiting
export RATE_LIMIT_TYPE=aggressive  # or moderate, lenient
```

## 🐛 Troubleshooting

### Common Issues

1. **"No test files found"**
   - Ensure you have files in the `test-files/` directory
   - Check that files have proper extensions (.eap-config, .xml, etc.)

2. **Connection refused errors**
   - Make sure the development server is running (`./dev-start.sh`)
   - Check that port 6001 is available

3. **High failure rates**
   - Check server logs: `./dev-logs.sh backend`
   - Reduce concurrent load in CONFIG
   - Check for rate limiting

4. **Race conditions still detected**
   - Verify the fix is applied (check git status)
   - Restart the development server
   - Try with UPLOAD_CONVERSION_DELAY set to 0

### Debug Mode
Add debug logging to any test:
```javascript
console.log('[DEBUG]', 'Your debug message');
```

## 📁 Test Files

The tests use files from `../test-files/`. Supported formats:
- `.eap-config` - EAP configuration files
- `.xml` - XML files
- `.mobileconfig` - Mobile configuration files  
- `.json` - JSON files
- `.yaml/.yml` - YAML files

## 🎯 Recommended Testing Workflow

1. **Quick Verification**: `node test-tools/quick-test.js single`
2. **Concurrent Testing**: `node test-tools/race-condition-simulator.js test`
3. **Stress Testing**: `node test-tools/race-condition-simulator.js stress`
4. **Production Simulation**: `node test-tools/production-simulator.js simulate`
5. **Rate Limit Testing**: `node test-tools/production-simulator.js load`

## 📈 Performance Expectations

### Development Environment:
- Upload: 20-100ms
- Conversion: 50-300ms
- Success Rate: >98%

### Production Simulation:
- Upload: 100-500ms (with latency simulation)
- Conversion: 200-800ms (with server load simulation)
- Success Rate: >95%
- Rate limiting should trigger with >30 requests/minute

### Stress Test:
- Concurrent uploads: 20
- Rapid conversions: 10 per file
- Total operations: 220
- Expected race conditions: 0
- Success rate: >90%

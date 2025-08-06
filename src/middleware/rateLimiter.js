/**
 * Rate Limiting Middleware for Testing
 * 
 * This middleware helps simulate production conditions locally by:
 * 1. Limiting requests per IP/session
 * 2. Adding artificial delays to simulate network latency
 * 3. Simulating server load conditions
 */

const rateLimit = require('express-rate-limit');

// Configuration for different rate limiting scenarios
const RATE_LIMIT_CONFIGS = {
  // Aggressive rate limiting for testing race conditions
  aggressive: {
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '60 seconds'
    },
    standardHeaders: true,
    legacyHeaders: false,
  },
  
  // Moderate rate limiting similar to production
  moderate: {
    windowMs: 60 * 1000, // 1 minute  
    max: 30, // 30 requests per minute
    message: {
      error: 'Rate limit exceeded. Please wait before making more requests.',
      retryAfter: '60 seconds'
    },
    standardHeaders: true,
    legacyHeaders: false,
  },
  
  // Lenient rate limiting for development
  lenient: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: {
      error: 'Rate limit exceeded.',
      retryAfter: '60 seconds'
    },
    standardHeaders: true,
    legacyHeaders: false,
  }
};

// Upload-specific rate limiting (more restrictive for large file operations)
const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 uploads per minute
  message: {
    error: 'Too many file uploads. Please wait before uploading more files.',
    retryAfter: '60 seconds',
    tip: 'File uploads are limited to prevent server overload.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count both successful and failed requests
});

// Conversion-specific rate limiting
const conversionRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 conversions per minute
  message: {
    error: 'Too many conversion requests. Please wait before converting more files.',
    retryAfter: '60 seconds'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Network latency simulation middleware
function simulateNetworkLatency(minDelay = 50, maxDelay = 200) {
  return (req, res, next) => {
    if (process.env.SIMULATE_NETWORK_LATENCY === 'true') {
      const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
      console.log(`[LATENCY SIMULATION] Adding ${delay}ms delay to ${req.method} ${req.path}`);
      setTimeout(next, delay);
    } else {
      next();
    }
  };
}

// Server load simulation middleware
function simulateServerLoad() {
  return (req, res, next) => {
    if (process.env.SIMULATE_SERVER_LOAD === 'true') {
      // Simulate CPU-intensive operation
      const iterations = Math.floor(Math.random() * 1000000) + 500000;
      const startTime = Date.now();
      
      // Busy wait to simulate CPU load
      let counter = 0;
      while (counter < iterations) {
        counter++;
      }
      
      const loadTime = Date.now() - startTime;
      console.log(`[LOAD SIMULATION] Simulated ${loadTime}ms server load for ${req.method} ${req.path}`);
    }
    next();
  };
}

// Memory pressure simulation
function simulateMemoryPressure() {
  return (req, res, next) => {
    if (process.env.SIMULATE_MEMORY_PRESSURE === 'true') {
      // Allocate and immediately release memory to simulate GC pressure
      const arrays = [];
      for (let i = 0; i < 100; i++) {
        arrays.push(new Array(10000).fill(Math.random()));
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        console.log(`[MEMORY SIMULATION] Triggered GC for ${req.method} ${req.path}`);
      }
    }
    next();
  };
}

// Combined production simulation middleware
function productionSimulation() {
  return [
    simulateNetworkLatency(100, 300), // Higher latency for production-like conditions
    simulateServerLoad(),
    simulateMemoryPressure()
  ];
}

// Rate limiter factory
function createRateLimiter(type = 'moderate') {
  const config = RATE_LIMIT_CONFIGS[type];
  if (!config) {
    throw new Error(`Unknown rate limit type: ${type}. Available: ${Object.keys(RATE_LIMIT_CONFIGS).join(', ')}`);
  }
  
  return rateLimit(config);
}

// Custom rate limiter for testing race conditions
function raceConditionRateLimiter() {
  return rateLimit({
    windowMs: 10 * 1000, // 10 seconds
    max: 100, // Allow many requests quickly
    message: {
      error: 'Race condition test rate limit exceeded.',
      retryAfter: '10 seconds'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for test endpoints
      return req.path.includes('/test-') || req.path.includes('/health');
    }
  });
}

module.exports = {
  // Rate limiters
  createRateLimiter,
  uploadRateLimit,
  conversionRateLimit,
  raceConditionRateLimiter,
  
  // Simulation middleware
  simulateNetworkLatency,
  simulateServerLoad,
  simulateMemoryPressure,
  productionSimulation,
  
  // Constants
  RATE_LIMIT_CONFIGS
};

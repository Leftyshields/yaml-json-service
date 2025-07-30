const { onRequest } = require('firebase-functions/v2/https');
const app = require('./src/app');

// Export the Express app as a Firebase function with increased resources
exports.app = onRequest({
  timeoutSeconds: 300,  // 5 minutes
  memory: '1GiB',       // Increased to 1GB
  maxInstances: 10,
  cors: true            // Explicit CORS support
}, app);

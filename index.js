const functions = require('firebase-functions');
const app = require('./src/app');

// Export the Express app as a Firebase function
exports.app = functions.https.onRequest(app);

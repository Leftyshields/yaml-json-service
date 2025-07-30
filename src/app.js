const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const yamlRoutes = require('./routes/yaml.routes');
const multer = require('multer');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();
// Configurable storage backend: 'disk' for local/multer, 'gcs' for Firebase Storage, 'firestore' for Firestore DB
const STORAGE_BACKEND = process.env.STORAGE_BACKEND || 'disk';
let bucket;
let firestoreDB;

// Safely initialize Firebase Admin SDK only once
if (STORAGE_BACKEND === 'gcs' || STORAGE_BACKEND === 'firestore') {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      storageBucket: process.env.GCS_BUCKET
    });
  }
  
  if (STORAGE_BACKEND === 'gcs') {
    bucket = admin.storage().bucket();
  } else {
    firestoreDB = admin.firestore();
  }
}

// Initialize express app
const app = express();

// Add JSON and URL-encoded body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the React frontend app built with Vite
// For Digital Ocean deployment, these files are copied to ./public by the Dockerfile
app.use(express.static(path.join(__dirname, '..', 'public')));

// Fallback for SPA routing - this allows React Router to handle routes
app.use((req, res, next) => {
  // Skip API routes and direct file requests
  if (req.path.startsWith('/api') || 
      req.path === '/health' || 
      req.path.includes('.')) {
    return next();
  }
  
  // For all other routes, serve the index.html
  const indexPath = path.join(__dirname, '..', 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  next();
});

// Health check endpoint for Docker and monitoring
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Configure multer for memory storage (for Cloud Run and Firebase)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// UPLOAD ROUTE: Uses Multer for reliable file handling in serverless environments
app.post('/api/upload', upload.single('yamlFile'), (req, res) => {
  // Set CORS headers for the response
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, X-Upload-Client, X-File-Size, X-File-Name, X-File-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  console.log('[UPLOAD] Request received with headers:', JSON.stringify(req.headers));

  // Check if file exists in the request
  if (!req.file) {
    console.error('[UPLOAD] No file found in request');
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const fileData = req.file;
    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}-${fileData.originalname}`;
    
    console.log(`[UPLOAD] Processing file: ${fileData.originalname}`);
    console.log(`[UPLOAD] File size: ${fileData.size} bytes`);
    console.log(`[UPLOAD] File type: ${fileData.mimetype}`);
    console.log(`[UPLOAD] Saving file to ${STORAGE_BACKEND}...`);
    
    // Save the file based on selected storage backend
    if (STORAGE_BACKEND === 'gcs') {
      // For Google Cloud Storage
      bucket.file(uniqueFileName).save(fileData.buffer, { 
        contentType: fileData.mimetype,
        metadata: {
          originalName: fileData.originalname,
          size: fileData.size
        }
      })
      .then(() => {
        console.log(`[UPLOAD] Successfully saved ${uniqueFileName} to GCS.`);
        return res.status(200).json({ 
          success: true, 
          message: 'File uploaded successfully', 
          filePath: uniqueFileName, 
          fileName: fileData.originalname 
        });
      })
      .catch((err) => {
        console.error('[UPLOAD] Error saving to GCS:', err);
        return res.status(500).json({ 
          error: 'Failed to save file to Google Cloud Storage',
          details: err.message 
        });
      });
    } else {
      // For local filesystem
      const uploadDir = process.env.FUNCTION_TARGET ? '/tmp' : path.join(__dirname, 'config', 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      const filePath = path.join(uploadDir, uniqueFileName);
      fs.writeFileSync(filePath, fileData.buffer);
      console.log(`[UPLOAD] Successfully saved ${uniqueFileName} to disk.`);
      
      return res.status(200).json({ 
        success: true, 
        message: 'File uploaded successfully', 
        filePath: uniqueFileName, 
        fileName: fileData.originalname 
      });
    }
  } catch (err) {
    console.error('[UPLOAD] Error processing upload:', err);
    return res.status(500).json({ 
      error: 'File upload failed', 
      details: err.message 
    });
  }
});

// --- Main API Router (for all other routes) ---
const apiRouter = express.Router();

// CORS options
const corsOptions = {
  origin: [
    'http://localhost:5173', 
    'http://localhost:6001',
    'https://passpoint-config-editor.web.app',
    'https://passpoint-config-editor.firebaseapp.com',
    'http://passpoint.ddns.net',
    'https://passpoint.ddns.net',
    'http://wba-app-ougp3.ondigitalocean.app',
    'https://*.ondigitalocean.app'
  ],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Upload-Client', 'X-File-Size', 'X-File-Name', 'X-File-Type']
};

// Apply CORS middleware and mount yaml routes
app.use('/api', cors(corsOptions), apiRouter);
apiRouter.use('/', yamlRoutes);

// Multer error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // A Multer error occurred when uploading
    console.error('[MULTER] Error:', err.code, err.message);
    
    let errorMessage = 'File upload error';
    let statusCode = 400;
    
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        errorMessage = 'File is too large. Maximum size is 5MB.';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        errorMessage = 'Unexpected field name. Use "yamlFile" for your file upload.';
        break;
      default:
        errorMessage = `Upload error: ${err.message}`;
        statusCode = 500;
    }
    
    return res.status(statusCode).json({ 
      error: errorMessage,
      code: err.code
    });
  }
  
  // For any other errors, pass to default Express error handler
  next(err);
});

// Export the Express app
module.exports = app;

// Mount the main API router
app.use('/api', apiRouter);


// Health check routes (both paths for compatibility)
app.get('/', cors(corsOptions), (req, res) => {
  res.json({
    name: 'YAML/JSON Conversion Service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health or /api/health',
      convert: '/api/convert',
      upload: '/api/upload'
    },
    timestamp: new Date().toISOString()
  });
});

app.get('/health', cors(corsOptions), (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', cors(corsOptions), (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Only start server if not running in Firebase Functions
if (!process.env.FUNCTION_TARGET) {
  const PORT = process.env.PORT || 6001;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log('[SERVER] Automatic file cleanup scheduled to run every hour');
  });
}

module.exports = app;
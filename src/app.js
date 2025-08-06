const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const yamlRoutes = require('./routes/yaml.routes');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const http = require('http');
const websocketService = require('./services/websocket.service');

// Load environment variables
dotenv.config();

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
    version: process.env.npm_package_version || '2.1.0-race-fix-aggressive',
    environment: process.env.NODE_ENV || 'development',
    raceFixVersion: 'v3-aggressive-15retries-25ms',
    uploadConfig: {
      maxRetries: 15,
      baseDelay: 25,
      uploadDir: process.env.FUNCTION_TARGET ? '/tmp' : 'config/uploads'
    }
  });
});

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// Alert detection function (copied from yaml.routes.js)
function detectFileIssues(filePath, fileExtension, fileContent) {
  const alerts = [];
  const fileName = path.basename(filePath);
  
  // Check for unsupported file type
  const SUPPORTED_FILE_TYPES = {
    '.yaml': 'YAML',
    '.yml': 'YAML', 
    '.json': 'JSON',
    '.xml': 'XML',
    '.plist': 'Property List',
    '.mobileconfig': 'Mobile Configuration',
    '.eap-config': 'EAP Configuration',
    '.txt': 'Text',
    '.zip': 'ZIP Archive',
    '.conf': 'Configuration',
    '.cfg': 'Configuration'
  };
  
  if (!SUPPORTED_FILE_TYPES[fileExtension]) {
    alerts.push({
      type: 'unsupported_file_type',
      severity: 'warning',
      message: `File type "${fileExtension}" is not officially supported. Attempting to process anyway.`,
      details: {
        fileName,
        fileExtension,
        supportedTypes: Object.keys(SUPPORTED_FILE_TYPES)
      }
    });
  }
  
  // Check for binary files - if content contains null bytes or is mostly non-printable, it's likely binary
  const isBinary = fileContent.includes('\u0000') || 
                   (fileContent.length > 100 && fileContent.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g)?.length > fileContent.length * 0.1);
  
  if (isBinary && (fileExtension === '.mobileconfig' || fileExtension === '.plist')) {
    // Binary files are expected for mobileconfig/plist, so no alerts needed
    return null;
  }
  
  // Check for malformed XML/plist content (only for text-based files)
  if (!isBinary && (fileExtension === '.xml' || fileExtension === '.plist' || fileExtension === '.mobileconfig' || 
      fileContent.includes('<?xml') || fileContent.includes('<!DOCTYPE plist') || fileContent.includes('<plist'))) {
    
    // Improved tag counting logic - exclude XML comments, declarations, and DOCTYPE
    const openTags = (fileContent.match(/<[^/][^>]*>/g) || []).filter(tag => 
      !tag.match(/\/\s*$/) && // Not self-closing
      !tag.match(/^\?xml/) && // Not XML declaration
      !tag.match(/^!DOCTYPE/) && // Not DOCTYPE declaration
      !tag.match(/^<!--/) // Not XML comment
    );
    const closeTags = (fileContent.match(/<\/[^>]*>/g) || []).length;
    const selfClosingTags = (fileContent.match(/<[^>]*\/\s*>/g) || []).length;
    
    // Count actual opening tags (excluding self-closing tags)
    const actualOpenTags = openTags.length;
    
    // Only flag as malformed if there's a significant mismatch (increased tolerance to 20 for real-world files)
    if (Math.abs(actualOpenTags - closeTags) > 20) {
      alerts.push({
        type: 'malformed_xml',
        severity: 'error',
        message: `XML structure appears to be malformed. Found ${actualOpenTags} opening tags and ${closeTags} closing tags.`,
        details: {
          fileName,
          openTags: actualOpenTags,
          closeTags,
          selfClosingTags,
          suggestion: 'Check for missing closing tags or malformed XML structure.'
        }
      });
    }
    
    // Check for malformed DOCTYPE declarations
    if (fileContent.includes('<!DOCTYPE') && !fileContent.includes('<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"')) {
      alerts.push({
        type: 'malformed_doctype',
        severity: 'warning',
        message: 'DOCTYPE declaration appears to be malformed or non-standard.',
        details: {
          fileName,
          suggestion: 'Consider using standard Apple plist DOCTYPE declaration.'
        }
      });
    }
    
    // Check for incomplete XML structure
    if (fileContent.includes('<plist') && !fileContent.includes('</plist>')) {
      alerts.push({
        type: 'incomplete_xml',
        severity: 'error',
        message: 'XML structure appears to be incomplete. Missing closing </plist> tag.',
        details: {
          fileName,
          suggestion: 'Ensure all XML tags are properly closed.'
        }
      });
    }
  }
  
  // Check for empty or very small files
  if (fileContent.length < 10) {
    alerts.push({
      type: 'empty_file',
      severity: 'error',
      message: 'File appears to be empty or contains very little content.',
      details: {
        fileName,
        contentLength: fileContent.length
      }
    });
  }
  
  // Check for encoding issues - only flag if we detect actual encoding problems
  if (fileContent.includes('\uFFFD') || fileContent.includes('\u0000')) {
    alerts.push({
      type: 'encoding_issue',
      severity: 'warning',
      message: 'File may have encoding issues. Some characters could not be decoded properly.',
      details: {
        fileName,
        suggestion: 'Ensure file is saved with UTF-8 encoding.'
      }
    });
  }
  
  // Check for suspicious content patterns (exclude .eap-config files as they are valid XML)
  if (fileExtension !== '.eap-config' && fileContent.includes('<?xml') && !fileContent.includes('<plist') && !fileContent.includes('<dict>')) {
    alerts.push({
      type: 'unexpected_xml_content',
      severity: 'warning',
      message: 'File contains XML but doesn\'t appear to be a standard plist format.',
      details: {
        fileName,
        suggestion: 'This may not be a valid plist file. Processing as generic XML.'
      }
    });
  }
  
  return alerts.length > 0 ? alerts : null;
}

// Helper function to add alerts to response
function addAlertsToResponse(response, alerts) {
  if (alerts && alerts.length > 0) {
    response.alerts = alerts;
  }
  return response;
}

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
    console.log(`[UPLOAD] Saving file to local storage...`);
    
    // Save the file to local filesystem
    const uploadDir = path.join(__dirname, 'config', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const filePath = path.join(uploadDir, uniqueFileName);
    fs.writeFileSync(filePath, fileData.buffer);
    console.log(`[UPLOAD] Successfully saved ${uniqueFileName} to disk.`);
    
    // Detect file issues and send alerts
    let alerts = null;
    try {
      const fileContent = fileData.buffer.toString('utf8');
      const fileExtension = path.extname(fileData.originalname).toLowerCase();
      console.log('[UPLOAD] Checking for file issues...');
      console.log('[UPLOAD] File extension:', fileExtension);
      console.log('[UPLOAD] Content length:', fileContent.length);
      alerts = detectFileIssues(filePath, fileExtension, fileContent);
      if (alerts) {
        console.log(`[UPLOAD] Found ${alerts.length} issue(s) with uploaded file:`, alerts);
      } else {
        console.log('[UPLOAD] No issues detected');
      }
    } catch (alertError) {
      console.error('[UPLOAD] Error detecting file issues:', alertError.message);
    }
    
    return res.status(200).json(addAlertsToResponse({ 
      success: true, 
      message: 'File uploaded successfully', 
      filePath: uniqueFileName, // Return just the filename, not the full path
      fileName: fileData.originalname 
    }, alerts));
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
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    raceFixVersion: 'v3-aggressive-15retries-25ms'
  });
});

// Start server
const PORT = process.env.PORT || 6001;

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket service
websocketService.initWebSocket(server);

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`WebSocket server available at ws://0.0.0.0:${PORT}/api/ws`);
  console.log('[SERVER] Automatic file cleanup scheduled to run every hour');
});

module.exports = app;
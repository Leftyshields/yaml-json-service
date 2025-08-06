// src/routes/yaml.routes.js

const Buffer = require('buffer').Buffer; // Ensure Buffer is available
const express = require('express');
const router = express.Router();
// const yamlService = require('../services/yaml.service'); // Keep if used elsewhere, or remove if not
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const plist = require('plist');
const yaml = require('js-yaml');
const xml2js = require('xml2js'); // Add xml2js
const { mapToYamlSchema } = require('../services/mapping.service'); // Import the mapping function
const certService = require('../services/cert.service'); // Import the certificate service
const { v4: uuidv4 } = require('uuid');
const { sendConversionUpdate } = require('../services/websocket.service'); // Import WebSocket service
const AdmZip = require('adm-zip');
const crypto = require('crypto');
const Busboy = require('@fastify/busboy'); // Use Fastify busboy for better serverless support
const { bufferJsonReplacer, processBinaryData } = require('../utils/binary-helpers'); // Import binary data helpers

/**
 * Alert system for detecting malformed files and unsupported file types
 */

// Supported file types and their extensions
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

// File type detection patterns
const FILE_PATTERNS = {
  xml: /<\?xml|<!DOCTYPE|<\/?[a-zA-Z][^>]*>/,
  plist: /<!DOCTYPE plist|<\/?plist|<\/?dict|<\/?array|<\/?key|<\/?string|<\/?integer|<\/?real|<\/?true|<\/?false|<\/?data|<\/?date/,
  json: /^[\s]*[{\[]|"[\w\s]*":/,
  yaml: /^[\s]*[a-zA-Z][a-zA-Z0-9_-]*:|\n[\s]*[a-zA-Z][a-zA-Z0-9_-]*:/
};

/**
 * Detect if a file is malformed based on its content and type
 * @param {string} filePath - Path to the file
 * @param {string} fileExtension - File extension
 * @param {string} fileContent - File content as string
 * @returns {object} - Alert object if issues found, null otherwise
 */
function detectFileIssues(filePath, fileExtension, fileContent) {
  const alerts = [];
  const fileName = path.basename(filePath);
  
  // Check for unsupported file type
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

/**
 * Send alerts via WebSocket if any issues are detected
 * @param {string} streamId - WebSocket stream ID
 * @param {Array} alerts - Array of alert objects
 */
function sendAlerts(streamId, alerts) {
  if (alerts && alerts.length > 0) {
    sendConversionUpdate(streamId, {
      status: 'alerts',
      alerts,
      message: `Found ${alerts.length} issue(s) with the uploaded file.`,
      timestamp: new Date().toISOString()
    });
    
    // Log alerts to console
    alerts.forEach(alert => {
      console.log(`[ALERT] ${alert.severity.toUpperCase()}: ${alert.message}`, alert.details);
    });
  }
}

/**
 * Helper function to add alerts to response objects
 * @param {object} response - The response object to modify
 * @param {Array} alerts - Array of alert objects
 * @returns {object} - Modified response object with alerts
 */
function addAlertsToResponse(response, alerts) {
  if (alerts && alerts.length > 0) {
    response.alerts = alerts;
  }
  return response;
}

// Utility function to fix certificate data that was parsed incorrectly
function fixCertificateData(obj) {
  if (!obj || typeof obj !== 'object') return;
  
  // Recursively traverse the object
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      
      // Check if this is a CA element with certificate data
      if (key === 'CA' && value && typeof value === 'object') {
        // If the certificate content was parsed as an array of numbers, convert back to string
        if (value._ && Array.isArray(value._)) {
          // Convert array of numbers back to base64 string
          try {
            value._ = Buffer.from(value._).toString('base64');
          } catch (err) {
            console.warn('[fixCertificateData] Failed to convert certificate data:', err.message);
          }
        }
      }
      
      // Recursively process nested objects
      if (typeof value === 'object') {
        fixCertificateData(value);
      }
    }
  }
}

// Buffer processing functions for atomic conversion (no file system)
async function processEapConfigFromBuffer(fileContent, obfuscationLevel, certHandling) {
  console.log('[processEapConfigFromBuffer] Processing EAP config from buffer');
  
  try {
    // Parse the EAP XML content with proper certificate handling
    const xml2js = require('xml2js');
    const parser = new xml2js.Parser({ 
      explicitArray: false, 
      mergeAttrs: true,
      valueProcessors: [
        // Custom processor to preserve certificate data as strings
        function(value, name) {
          // If this looks like certificate data (base64), preserve as string
          if (typeof value === 'string' && value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value)) {
            return value;
          }
          return value;
        }
      ]
    });
    const result = await parser.parseStringPromise(fileContent);
    
    // Fix certificate data that may have been parsed incorrectly
    fixCertificateData(result);
    
    // Apply obfuscation if needed
    let processedResult = result;
    if (obfuscationLevel !== 'none') {
      processedResult = obfuscatePasswords(result, obfuscationLevel);
    }
    
    // Convert to YAML and JSON
    const yaml = require('js-yaml');
    const yamlContent = yaml.dump(processedResult, { 
      indent: 2, 
      lineWidth: -1,
      noRefs: true,
      sortKeys: false
    });
    
    return {
      yaml: yamlContent,
      json: JSON.stringify(processedResult, null, 2),
      original: fileContent
    };
  } catch (error) {
    throw new Error('Failed to process EAP config: ' + error.message);
  }
}

async function processPlistFromBuffer(fileContent, obfuscationLevel, certHandling) {
  console.log('[processPlistFromBuffer] Processing plist from buffer');
  
  try {
    const plist = require('plist');
    const parsedData = plist.parse(fileContent);
    
    // Apply obfuscation if needed
    let processedResult = parsedData;
    if (obfuscationLevel !== 'none') {
      processedResult = obfuscatePasswords(parsedData, obfuscationLevel);
    }
    
    // Convert to YAML and JSON
    const yaml = require('js-yaml');
    const yamlContent = yaml.dump(processedResult, { 
      indent: 2, 
      lineWidth: -1,
      noRefs: true,
      sortKeys: false
    });
    
    return {
      yaml: yamlContent,
      json: JSON.stringify(processedResult, null, 2),
      original: fileContent
    };
  } catch (error) {
    throw new Error('Failed to process plist: ' + error.message);
  }
}

async function processYamlFromBuffer(fileContent, obfuscationLevel) {
  console.log('[processYamlFromBuffer] Processing YAML from buffer');
  
  try {
    const yaml = require('js-yaml');
    const parsedData = yaml.load(fileContent);
    
    // Apply obfuscation if needed
    let processedResult = parsedData;
    if (obfuscationLevel !== 'none') {
      processedResult = obfuscatePasswords(parsedData, obfuscationLevel);
    }
    
    // Convert back to YAML and JSON
    const yamlContent = yaml.dump(processedResult, { 
      indent: 2, 
      lineWidth: -1,
      noRefs: true,
      sortKeys: false
    });
    
    return {
      yaml: yamlContent,
      json: JSON.stringify(processedResult, null, 2),
      original: fileContent
    };
  } catch (error) {
    throw new Error('Failed to process YAML: ' + error.message);
  }
}

// Utility function to generate suggested download filenames based on original filename
function generateSuggestedFilenames(originalFilename) {
  if (!originalFilename) {
    return {
      yaml: 'conversion_output.yaml',
      json: 'conversion_output.json',
      original: 'conversion_output.txt'
    };
  }
  
  // If filename has timestamp prefix (pattern: numbers-originalname), extract the original part
  let cleanFilename = originalFilename;
  const timestampPattern = /^\d+-(.+)$/;
  const match = originalFilename.match(timestampPattern);
  if (match) {
    cleanFilename = match[1]; // Use the part after the timestamp prefix
  }
  
  // Remove extension from original filename
  const baseName = cleanFilename.replace(/\.[^/.]+$/, '');
  
  // Generate suggested filenames with new extensions
  return {
    yaml: `${baseName}.yaml`,
    json: `${baseName}.json`,
    original: cleanFilename // Keep original extension for original data
  };
}

// Password obfuscation utility function
function obfuscatePasswords(obj, level = 'mask') {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Define ONLY password field patterns (case-insensitive) - more selective
  const sensitiveFields = [
    /^password$/i,
    /^passwd$/i,
    /^pwd$/i,
    /^secret$/i,
    /^userPassword$/i,
    /^passphrase$/i
  ];

  // EXCLUDE fields that might match the above patterns but are not passwords
  const excludedFields = [
    'OuterIdentity',
    'UserName', 
    'ServerID', 
    'TLSTrustedServerNames',
    'ServerSideCredential',
    'DisplayedOperatorName',
    'DomainName',
    'TTLSInnerAuthentication'  // Added to excluded fields to prevent redaction
  ];

  // ONLY these specific field names should be obfuscated
  const explicitPasswordFields = [
    'Password',
    'UserPassword'
    // Removed TTLSInnerAuthentication as it's an authentication method, not a password
  ];

  // Helper function to process a primitive value
  function processValue(value, fieldName, parentKey = '') {
    // Skip excluded fields explicitly
    if (excludedFields.includes(fieldName)) {
      return value;
    }
    
    // Check if this is EXACTLY a password field (more strict matching)
    const isSensitive = 
      explicitPasswordFields.includes(fieldName) || 
      sensitiveFields.some(pattern => pattern.test(fieldName));
    
    // No more heuristics for password detection - only use explicit field names
    
    if (!isSensitive || typeof value !== 'string' || !value) {
      return value;
    }

    // Process the sensitive value
    return processPasswordValue(value);
  }
  
  // Centralized password processing function to ensure consistent handling
  function processPasswordValue(value) {
    // Don't process empty values
    if (!value || value.length === 0) {
      return value;
    }
    
    // Don't process values that are already obfuscated
    if (value === '***REDACTED***' || 
        value.startsWith('[PASSWORD-') || 
        value.startsWith('sha256:') || 
        value.startsWith('base64:')) {
      return value;
    }
    
    // Apply obfuscation based on the selected level
    switch (level) {
      case 'none':
        return value; // No obfuscation
        
      case 'mask':
        return '***REDACTED***';
        
      case 'partial':
        if (value.length <= 4) return '***';
        return value.substring(0, 2) + '***' + value.substring(value.length - 2);
        
      case 'length':
        return `[PASSWORD-${value.length}-CHARS]`;
        
      case 'hash':
        const hash = crypto.createHash('sha256').update(value).digest('hex');
        return `sha256:${hash.substring(0, 16)}...`;
        
      case 'base64':
        return `base64:${Buffer.from(value).toString('base64')}`;
        
      default:
        return '***REDACTED***';
    }
  }

  // Clone the object to avoid modifying the original
  const clone = JSON.parse(JSON.stringify(obj));
  
  // Process the cloned object
  function traverse(object, prefix = '') {
    // Direct check for the specific structure in the screenshot - more selective approach
    if (object && typeof object === 'object') {
      // Specific check for EAP configuration structures
      if (object.EAPClientConfiguration) {
        // ONLY obfuscate the UserPassword field
        if (object.EAPClientConfiguration.UserPassword) {
          console.log('[OBFUSCATE] Found UserPassword in EAPClientConfiguration, obfuscating');
          object.EAPClientConfiguration.UserPassword = processPasswordValue(object.EAPClientConfiguration.UserPassword);
        }
      }

      // Direct check for Password field at this level - ONLY PASSWORD
      if (object.Password && typeof object.Password === 'string' && 
          !prefix.includes('TLS') && !prefix.includes('Server')) {
        console.log('[OBFUSCATE] Found direct Password field, obfuscating');
        object.Password = processPasswordValue(object.Password);
      }

      // Direct check for UserPassword field at this level - ONLY UserPassword 
      if (object.UserPassword && typeof object.UserPassword === 'string') {
        console.log('[OBFUSCATE] Found direct UserPassword field, obfuscating');
        object.UserPassword = processPasswordValue(object.UserPassword);
      }
    }

    // Continue with normal traversal
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        const value = object[key];
        const fullKey = prefix ? `${prefix}.${key}` : key;
        
        if (value === null) {
          continue;
        } else if (typeof value === 'object') {
          // Recursively process nested objects and arrays
          traverse(value, fullKey);
        } else if (typeof value === 'string') {
          // Process string values with both key and parent context
          object[key] = processValue(value, key, prefix);
        }
      }
    }
    return object;
  }
  
  return traverse(clone);
}

// ✅ NEW GET /config route to serve passpoint YAML
router.get('/config', (req, res) => {
  const filePath = path.join(__dirname, '..', 'config', 'passpoint_rev0.yml');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading config:', err);
      return res.status(500).send('Failed to load config');
    }
    res.setHeader('Content-Type', 'text/yaml');
    res.send(data);
  });
});

// Set up storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use local uploads directory
    const uploadDir = process.env.FUNCTION_TARGET 
      ? '/tmp' 
      : path.join(__dirname, '..', 'config', 'uploads');
    
    // Ensure directory exists with proper permissions
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

// Create upload middleware with expanded file type support
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedExtensions = [
      '.yml', '.yaml', '.mobileconfig', '.xml', '.eap-config', 
      '.txt', '.json', '.conf', '.cfg',
      '.pem', '.crt', '.cer', '.ovpn', '.profile', '.p12', '.pfx',
      '.zip', '.plist', '.config', '.ini', '.properties', '.env',
      '.toml', '.log', '.data', '.bin'  // Added more types
    ];
    const allowedMimeTypes = [
      'text/yaml',
      'application/x-yaml',
      'text/plain',
      'application/octet-stream',
      'application/x-apple-aspen-config',
      'application/pkcs7-mime',
      'application/xml',
      'text/xml',
      'application/vnd.visio', // .vsd
      'application/json',
      'text/json',
      'application/zip',        // ZIP files
      'application/x-zip-compressed',
      'application/x-plist',    // Plist files
      'application/pkcs12',     // P12/PFX certificates
      'application/x-pkcs12',
      'text/x-log',            // Log files
      'application/x-binary'   // Generic binary
    ];
    const fileExtension = path.extname(file.originalname).toLowerCase();

    // Be more permissive - allow if extension OR mimetype matches, or if no extension but known mimetype
    const extensionAllowed = allowedExtensions.includes(fileExtension);
    const mimetypeAllowed = allowedMimeTypes.includes(file.mimetype.toLowerCase());
    const noExtension = !fileExtension && mimetypeAllowed;

    if (extensionAllowed || mimetypeAllowed || noExtension) {
      cb(null, true);
    } else {
      // More detailed error message but still allow upload to try
      console.warn(`[SERVER /upload] Potentially unsupported file type: ${fileExtension}, MIME: ${file.mimetype}, but allowing upload attempt`);
      cb(null, true); // Changed to allow upload anyway - let conversion handle rejection if needed
    }
  }
});

// Test endpoint to validate upload functionality
router.post('/test-upload', (req, res) => {
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  
  console.log('[SERVER /test-upload] Test upload request received');
  console.log('[SERVER /test-upload] Content-Type:', req.headers['content-type']);
  console.log('[SERVER /test-upload] Content-Length:', req.headers['content-length']);
  console.log('[SERVER /test-upload] User-Agent:', req.headers['user-agent']);
  console.log('[SERVER /test-upload] Environment:', process.env.FUNCTION_TARGET ? 'Local' : 'Local');

  // Use multer with memory storage for testing
  const testUpload = multer({ 
    storage: multer.memoryStorage(),
    limits: { 
      fileSize: 10 * 1024 * 1024, // 10MB limit
      fieldSize: 1024 * 1024 // 1MB field size
    }
  }).single('testFile');

  testUpload(req, res, (err) => {
    const result = {
      timestamp: new Date().toISOString(),
      environment: process.env.FUNCTION_TARGET ? 'Local' : 'Local',
      success: false,
      details: {}
    };

    if (err) {
      console.error('[SERVER /test-upload] Multer error:', err);
      result.error = err.message;
      result.errorType = err.code || 'UNKNOWN';
      result.details.multerError = true;
      return res.status(400).json(result);
    }

    if (!req.file) {
      console.log('[SERVER /test-upload] No file in request');
      result.error = 'No file uploaded';
      result.details.noFile = true;
      return res.status(400).json(result);
    }

    try {
      console.log('[SERVER /test-upload] File received successfully');
      console.log('[SERVER /test-upload] Original name:', req.file.originalname);
      console.log('[SERVER /test-upload] Size:', req.file.size);
      console.log('[SERVER /test-upload] Mimetype:', req.file.mimetype);
      
      // Test file saving
      const timestamp = Date.now();
      const fileName = `test-${timestamp}-${req.file.originalname}`;
      
      const uploadDir = path.join(__dirname, '..', 'config', 'uploads');
      const filePath = path.join(uploadDir, fileName);
      
      // Ensure directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      // Write file
      fs.writeFileSync(filePath, req.file.buffer);
      
      // Verify file was written
      const stats = fs.statSync(filePath);
      
      console.log('[SERVER /test-upload] File saved successfully:', filePath);
      console.log('[SERVER /test-upload] File size on disk:', stats.size);
      
      // Clean up test file immediately
      fs.unlinkSync(filePath);
      console.log('[SERVER /test-upload] Test file cleaned up');
      
      result.success = true;
      result.details = {
        originalName: req.file.originalname,
        uploadedSize: req.file.size,
        savedSize: stats.size,
        mimetype: req.file.mimetype,
        uploadDir: uploadDir,
        testFilePath: fileName,
        sizesMatch: req.file.size === stats.size,
        fileWritten: true,
        fileDeleted: true
      };
      
      return res.status(200).json(result);
      
    } catch (writeError) {
      console.error('[SERVER /test-upload] Test error:', writeError);
      result.error = 'File processing failed: ' + writeError.message;
      result.details.writeError = true;
      result.details.errorStack = writeError.stack;
      return res.status(500).json(result);
    }
  });
});

// NEW ARCHITECTURE: Atomic upload + convert (eliminates race condition entirely)
router.post('/upload-and-convert', (req, res) => {
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  
  console.log('[SERVER /upload-and-convert] Atomic conversion request received');

  const memoryUpload = multer({ 
    storage: multer.memoryStorage(),
    limits: { 
      fileSize: 100 * 1024 * 1024, // 100MB limit
      fieldSize: 100 * 1024 * 1024,
      fields: 10,
      files: 1
    }
  }).single('yamlFile');

  memoryUpload(req, res, async (err) => {
    if (err) {
      console.error('[SERVER /upload-and-convert] Multer error:', err);
      return res.status(400).json({ error: 'Upload failed: ' + err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      console.log('[SERVER /upload-and-convert] Processing file:', req.file.originalname);
      
      // Process directly from memory buffer - NO FILE SYSTEM INTERACTION
      const fileContent = req.file.buffer.toString('utf8');
      const fileExtension = path.extname(req.file.originalname).toLowerCase();
      
      // Get conversion parameters from request body (parsed from multipart)
      const obfuscationLevel = req.body.obfuscationLevel || 'none';
      const certHandling = req.body.certHandling || 'preserve';
      
      console.log('[SERVER /upload-and-convert] Obfuscation level:', obfuscationLevel);
      console.log('[SERVER /upload-and-convert] Cert handling:', certHandling);
      
      // Generate suggested filenames
      const suggestedFilenames = generateSuggestedFilenames(req.file.originalname);
      
      // Detect file type and convert directly from memory
      let convertedData;
      let originalData;
      
      if (fileExtension === '.eap-config' || fileContent.includes('<EapHostConfig') || fileContent.includes('<EAPIdentityProviderList') || fileExtension === '.xml') {
        console.log('[SERVER /upload-and-convert] Processing EAP config file');
        
        // Parse EAP config directly from buffer
        const result = await processEapConfigFromBuffer(fileContent, obfuscationLevel, certHandling);
        convertedData = result;
        originalData = fileContent;
        
      } else if (fileExtension === '.mobileconfig' || (fileContent.includes('<?xml') && fileContent.includes('<plist'))) {
        console.log('[SERVER /upload-and-convert] Processing mobileconfig/plist file');
        
        // Parse plist directly from buffer
        const result = await processPlistFromBuffer(fileContent, obfuscationLevel, certHandling);
        convertedData = result;
        originalData = fileContent;
        
      } else if (fileExtension === '.yaml' || fileExtension === '.yml') {
        console.log('[SERVER /upload-and-convert] Processing YAML file');
        
        // Parse YAML directly from buffer
        const result = await processYamlFromBuffer(fileContent, obfuscationLevel);
        convertedData = result;
        originalData = fileContent;
        
      } else {
        throw new Error('Unsupported file type for atomic conversion');
      }
      
      console.log('[SERVER /upload-and-convert] Conversion completed successfully');
      
      // Return the complete conversion result
      return res.status(200).json({
        success: true,
        message: 'File converted successfully',
        originalFilename: req.file.originalname,
        suggestedFilenames: suggestedFilenames,
        data: {
          yaml: convertedData.yaml || convertedData,
          json: convertedData.json || JSON.stringify(convertedData, null, 2),
          original: originalData
        },
        conversionTime: new Date().toISOString(),
        raceConditionEliminated: true
      });
      
    } catch (error) {
      console.error('[SERVER /upload-and-convert] Conversion error:', error);
      return res.status(500).json({ 
        error: 'Conversion failed: ' + error.message,
        originalFilename: req.file?.originalname
      });
    }
  });
});

// Health check endpoint specifically for upload testing
router.get('/upload-health', (req, res) => {
  const health = {
    timestamp: new Date().toISOString(),
    environment: process.env.FUNCTION_TARGET ? 'Local' : 'Local',
    multerVersion: require('multer/package.json').version,
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage(),
    uploadDir: path.join(__dirname, '..', 'config', 'uploads'),
    tmpDirExists: fs.existsSync('/tmp'),
    tmpDirWritable: (() => {
      try {
        const testFile = '/tmp/write-test-' + Date.now();
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        return true;
      } catch (e) {
        return false;
      }
    })(),
    status: 'ok'
  };
  
  console.log('[SERVER /upload-health] Health check:', JSON.stringify(health, null, 2));
  res.json(health);
});

// Handle preflight OPTIONS request for test upload
router.options('/test-upload', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.status(200).send();
});

// Handle preflight OPTIONS request for upload
router.options('/upload', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.status(200).send();
});

// Alternative upload route for Local compatibility
router.post('/upload', (req, res) => {
  // Set CORS headers specifically for upload
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  
  console.log('[SERVER /upload] Upload request received');
  console.log('[SERVER /upload] Content-Type:', req.headers['content-type']);
  console.log('[SERVER /upload] Content-Length:', req.headers['content-length']);
  console.log('[SERVER /upload] Origin:', req.headers.origin);

  // For Local, use multer with memory storage (more reliable than busboy)
  const memoryUpload = multer({ 
    storage: multer.memoryStorage(),
    limits: { 
      fileSize: 100 * 1024 * 1024, // 100MB limit
      fieldSize: 100 * 1024 * 1024, // 100MB field size
      fields: 10,                   // Max number of fields
      files: 1                      // Max number of files
    }
  }).single('yamlFile');

  memoryUpload(req, res, async (err) => {
    if (err) {
      console.error('[SERVER /upload] Multer error:', err);
      if (!res.headersSent) {
        return res.status(400).json({ error: 'Upload failed: ' + err.message });
      }
      return;
    }

    if (!req.file) {
      console.log('[SERVER /upload] No file in request');
      if (!res.headersSent) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      return;
    }

    try {
      console.log('[SERVER /upload] File received:', req.file.originalname);
      console.log('[SERVER /upload] File size:', req.file.size);
      console.log('[SERVER /upload] File mimetype:', req.file.mimetype);
      
      // Save the file to the appropriate directory
      const timestamp = Date.now();
      const fileName = `${timestamp}-${req.file.originalname}`;
      
      // Use local uploads directory
      const uploadDir = process.env.FUNCTION_TARGET 
        ? '/tmp' 
        : path.join(__dirname, '..', 'config', 'uploads');
      
      const filePath = path.join(uploadDir, fileName);
      
      // Ensure directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      // Write the file buffer to disk
      fs.writeFileSync(filePath, req.file.buffer);
      console.log('[SERVER /upload] File saved to:', filePath);
      
          // Enhanced file verification to prevent race conditions
    const stats = fs.statSync(filePath);
    console.log('[SERVER /upload] File size on disk:', stats.size, 'bytes');
    console.log('[SERVER /upload] Original file size:', req.file.size, 'bytes');
    
    // Verify file integrity by reading it back
    const verificationBuffer = fs.readFileSync(filePath);
    if (verificationBuffer.length !== req.file.buffer.length) {
      throw new Error(`File verification failed: size mismatch (written: ${verificationBuffer.length}, expected: ${req.file.buffer.length})`);
    }
    
    // Force filesystem sync and add delay for production stability
    require('fs').fsyncSync(require('fs').openSync(filePath, 'r'));
    await new Promise(resolve => setTimeout(resolve, 50)); // Increased delay for production
    console.log('[SERVER /upload] File verification and sync completed');

      // Detect file issues and send alerts
      let alerts = null;
      try {
        const fileContent = req.file.buffer.toString('utf8');
        const fileExtension = path.extname(req.file.originalname).toLowerCase();
        console.log('[SERVER /upload] Checking for file issues...');
        console.log('[SERVER /upload] File extension:', fileExtension);
        console.log('[SERVER /upload] Content length:', fileContent.length);
        alerts = detectFileIssues(filePath, fileExtension, fileContent);
        if (alerts) {
          console.log(`[SERVER /upload] Found ${alerts.length} issue(s) with uploaded file:`, alerts);
        } else {
          console.log('[SERVER /upload] No issues detected');
        }
      } catch (alertError) {
        console.error('[SERVER /upload] Error detecting file issues:', alertError.message);
      }

      if (!res.headersSent) {
        return res.status(200).json(addAlertsToResponse({ 
          success: true, 
          message: 'File uploaded successfully',
          filePath: fileName,
          fileName: req.file.originalname
        }, alerts));
      }
      
    } catch (writeError) {
      console.error('[SERVER /upload] Write error:', writeError);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Failed to save file: ' + writeError.message });
      }
    }
  });
});

// Utility function to safely delete uploaded files
function cleanupUploadedFile(fullPath) {
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log('[SERVER] Successfully deleted uploaded file:', fullPath);
    }
  } catch (error) {
    console.error('[SERVER] Failed to delete uploaded file:', fullPath, error.message);
  }
}

// Utility function to clean up old files (older than 1 hour)
function cleanupOldFiles() {
  try {
    // Use local uploads directory
    const uploadDir = process.env.FUNCTION_TARGET 
      ? '/tmp' 
      : path.join(__dirname, '..', 'config', 'uploads');
    
    if (!fs.existsSync(uploadDir)) {
      return;
    }
    
    const files = fs.readdirSync(uploadDir);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds
    let deletedCount = 0;
    
    files.forEach(file => {
      const filePath = path.join(uploadDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile() && (now - stats.mtime.getTime()) > oneHour) {
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log('[SERVER] Auto-cleanup: Deleted old file:', filePath);
        }
      } catch (error) {
        console.error('[SERVER] Auto-cleanup: Failed to delete file:', filePath, error.message);
      }
    });
    
    if (deletedCount > 0) {
      console.log(`[SERVER] Auto-cleanup: Deleted ${deletedCount} old files`);
    }
  } catch (error) {
    console.error('[SERVER] Auto-cleanup error:', error.message);
  }
}

// Run cleanup every hour
setInterval(cleanupOldFiles, 60 * 60 * 1000); // 1 hour
console.log('[SERVER] Automatic file cleanup scheduled to run every hour');

// Add new route to get RAW file data without any filtering
router.post('/convert-raw', async (req, res) => {
  console.log('[SERVER /convert-raw] --- /convert-raw route hit for unfiltered conversion ---');
  console.log('[SERVER /convert-raw] Request body:', req.body);

  const { filePath } = req.body;
  let fullPath = null;

  try {
    if (!filePath) {
      console.error('[SERVER /convert-raw] No filePath provided in request body');
      return res.status(400).json({ error: 'No file path provided' });
    }
    
    // Use local uploads directory
    const uploadDir = process.env.FUNCTION_TARGET 
      ? '/tmp' 
      : path.join(__dirname, '..', 'config', 'uploads');
    
    fullPath = path.join(uploadDir, path.basename(filePath));
    console.log('[SERVER /convert-raw] Attempting to access file at fullPath:', fullPath);

    if (!fs.existsSync(fullPath)) {
      console.error('[SERVER /convert-raw] File not found at fullPath:', fullPath);
      
      // Race condition fix: Wait and retry for file to become available
      console.log('[SERVER /convert-raw] Attempting retry for potential race condition...');
      let retryCount = 0;
      const maxRetries = 15; // Significantly increased for production Safari
      const baseRetryDelay = 25; // Start with shorter delay
      
      while (retryCount < maxRetries && !fs.existsSync(fullPath)) {
        // Aggressive progressive backoff optimized for production
        let currentDelay;
        if (retryCount < 3) {
          currentDelay = baseRetryDelay; // 25ms for first 3 attempts
        } else if (retryCount < 8) {
          currentDelay = 50; // 50ms for attempts 4-8
        } else {
          currentDelay = 100; // 100ms for final attempts
        }
        
        await new Promise(resolve => setTimeout(resolve, currentDelay));
        retryCount++;
        console.log(`[SERVER /convert-raw] Retry ${retryCount}/${maxRetries} (${currentDelay}ms delay) - checking for file: ${fullPath}`);
      }
      
      if (!fs.existsSync(fullPath)) {
        // Final attempt with different upload directory check (dev vs prod compatibility)
        const alternativeUploadDir = path.join(__dirname, '..', 'config', 'uploads');
        const alternativePath = path.join(alternativeUploadDir, path.basename(filePath));
        console.log('[SERVER /convert-raw] Checking alternative path:', alternativePath);
        
        if (fs.existsSync(alternativePath)) {
          console.log('[SERVER /convert-raw] Found file in alternative directory, using:', alternativePath);
          fullPath = alternativePath;
        } else {
          return res.status(404).json({ 
            error: `File not found on server: ${filePath}`, 
            details: `Searched paths: ${fullPath}, ${alternativePath}`,
            troubleshooting: 'This may be a race condition between upload and conversion'
          });
        }
      } else {
        console.log(`[SERVER /convert-raw] File found after ${retryCount} retries`);
      }
    }
    
    const fileBuffer = fs.readFileSync(fullPath);
    const fileExtension = path.extname(fullPath).toLowerCase();
    
    // For all file types, try to convert to YAML with ZERO filtering
    let rawData = null;
    let conversionMethod = 'binary';
    
    // Try parsing strategies without any filtering
    try {
      // Strategy 1: Plist
      rawData = plist.parse(fileBuffer);
      conversionMethod = 'plist';
    } catch (plistError) {
      try {
        // Strategy 2: JSON
        rawData = JSON.parse(fileBuffer.toString('utf8'));
        conversionMethod = 'json';
      } catch (jsonError) {
        try {
          // Strategy 3: XML
          const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
          rawData = await parser.parseStringPromise(fileBuffer.toString('utf8'));
          conversionMethod = 'xml';
        } catch (xmlError) {
          try {
            // Strategy 4: YAML
            rawData = yaml.load(fileBuffer.toString('utf8'));
            conversionMethod = 'yaml';
          } catch (yamlError) {
            // Strategy 5: Raw text/binary analysis
            rawData = {
              fileInfo: {
                name: path.basename(fullPath),
                size: fileBuffer.length,
                extension: fileExtension
              },
              rawContent: fileBuffer.toString('utf8', 0, Math.min(fileBuffer.length, 50000)), // Up to 50KB
              binaryInfo: {
                isBinary: fileBuffer.some(byte => byte === 0 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)),
                firstBytes: Array.from(fileBuffer.slice(0, 32)).map(b => `0x${b.toString(16).padStart(2, '0')}`),
              }
            };
            conversionMethod = 'raw';
          }
        }
      }
    }
    
    // Convert to YAML with maximum detail preservation
    const rawYamlOutput = yaml.dump(rawData, {
      indent: 2,
      lineWidth: -1,  // No line width limit
      noRefs: true,
      skipInvalid: false,
      flowLevel: -1
    });
    
    return res.json({
      success: true,
      fileType: 'raw-unfiltered',
      conversionMethod: conversionMethod,
      yamlOutput: rawYamlOutput,            // Frontend expects yamlOutput
      comprehensiveYaml: rawYamlOutput,     // Same data for comprehensive tab
      jsonOutput: JSON.stringify(rawData, null, 2), // JSON format for JSON tab
      originalData: rawData,
      metadata: {
        fileName: path.basename(fullPath),
        fileSize: fileBuffer.length,
        fileExtension: fileExtension,
        note: "This is the complete unfiltered conversion with ALL data preserved"
      }
    });
    
  } catch (error) {
    console.error('[SERVER /convert-raw] Error in raw conversion:', error.message);
    return res.status(500).json({ 
      error: 'Failed to convert file (raw mode)', 
      details: error.message 
    });
  } finally {
    // File is kept for the session to allow reprocessing with different obfuscation levels
    // No automatic cleanup after conversion to enable reprocessing
    console.log('[SERVER] Keeping uploaded file for session reuse:', fullPath);
  }
});

// Update the convert route to handle mobileconfig and XML files
router.post('/convert', async (req, res) => {
  console.log('[SERVER /convert] --- /convert route hit ---');
  console.log('[SERVER /convert] Request headers:', req.headers);
  console.log('[SERVER /convert] Content-Type:', req.headers['content-type']);
  console.log('[SERVER /convert] Request body:', req.body);

  // Handle missing body gracefully
  if (!req.body) {
    console.error('[SERVER /convert] Request body is undefined');
    return res.status(400).json({ error: 'Missing request body' });
  }

  const { 
    filePath, 
    obfuscationLevel = 'none',
    certHandling = 'obfuscate', // Default to obfuscate certificates
    streamId = uuidv4() // Generate stream ID if not provided
  } = req.body || {}; 
  
  // Send initial update to any websocket subscribers
  sendConversionUpdate(streamId, {
    status: 'started',
    message: 'Starting file conversion',
    file: filePath
  });
  
  let fullPath = null;

  try {
    if (!filePath) {
      console.error('[SERVER /convert] No filePath provided in request body');
      return res.status(400).json({ error: 'No file path provided' });
    }
    
    console.log('[SERVER /convert] Obfuscation level requested:', obfuscationLevel);
    
    // Use local uploads directory
    const uploadDir = process.env.FUNCTION_TARGET 
      ? '/tmp' 
      : path.join(__dirname, '..', 'config', 'uploads');
    
    // Construct the full path to the file in the uploads directory
    fullPath = path.join(uploadDir, path.basename(filePath)); // Ensure only filename is used
    console.log('[SERVER /convert] Attempting to access file at fullPath:', fullPath);

    if (!fs.existsSync(fullPath)) {
      console.error('[SERVER /convert] File not found at fullPath:', fullPath);
      
      // Race condition fix: Wait and retry for file to become available
      console.log('[SERVER /convert] Attempting retry for potential race condition...');
      let retryCount = 0;
      const maxRetries = 15; // Significantly increased for production Safari
      const baseRetryDelay = 25; // Start with shorter delay
      
      while (retryCount < maxRetries && !fs.existsSync(fullPath)) {
        // Aggressive progressive backoff optimized for production
        let currentDelay;
        if (retryCount < 3) {
          currentDelay = baseRetryDelay; // 25ms for first 3 attempts
        } else if (retryCount < 8) {
          currentDelay = 50; // 50ms for attempts 4-8
        } else {
          currentDelay = 100; // 100ms for final attempts
        }
        
        await new Promise(resolve => setTimeout(resolve, currentDelay));
        retryCount++;
        console.log(`[SERVER /convert] Retry ${retryCount}/${maxRetries} (${currentDelay}ms delay) - checking for file: ${fullPath}`);
      }
      
      if (!fs.existsSync(fullPath)) {
        // Final attempt with different upload directory check (dev vs prod compatibility)
        const alternativeUploadDir = path.join(__dirname, '..', 'config', 'uploads');
        const alternativePath = path.join(alternativeUploadDir, path.basename(filePath));
        console.log('[SERVER /convert] Checking alternative path:', alternativePath);
        
        if (fs.existsSync(alternativePath)) {
          console.log('[SERVER /convert] Found file in alternative directory, using:', alternativePath);
          fullPath = alternativePath;
        } else {
          return res.status(404).json({ 
            error: `File not found on server: ${filePath}`, 
            details: `Searched paths: ${fullPath}, ${alternativePath}`,
            troubleshooting: 'This may be a race condition between upload and conversion'
          });
        }
      } else {
        console.log(`[SERVER /convert] File found after ${retryCount} retries`);
      }
    }
    
    const fileExtension = path.extname(fullPath).toLowerCase();
    console.log('[SERVER /convert] File extension determined as:', fileExtension);
    
    // Read file content for alert detection
    let fileContent = '';
    try {
      fileContent = fs.readFileSync(fullPath, 'utf8');
      console.log('[SERVER /convert] File content read, length:', fileContent.length);
    } catch (readError) {
      console.error('[SERVER /convert] Error reading file:', readError.message);
      return res.status(500).json({ error: 'Failed to read file content' });
    }
    
    // Detect file issues and send alerts
    const alerts = detectFileIssues(fullPath, fileExtension, fileContent);
    if (alerts) {
      sendAlerts(streamId, alerts);
      console.log(`[SERVER /convert] Found ${alerts.length} issue(s) with the uploaded file`);
    }
    
    let parsedData;
    let fileTypeForMapping;

    if (fileExtension === '.mobileconfig') {
      console.log('[SERVER /convert] --- Processing .mobileconfig file ---');
      
      try {
        // Read file as buffer first
        const fileBuffer = fs.readFileSync(fullPath);
        console.log('[SERVER /convert] .mobileconfig file data read, length:', fileBuffer.length);
        
        // Try parsing as binary plist first
        let parsedPlist;
        try {
          parsedPlist = plist.parse(fileBuffer);
          console.log('[SERVER /convert] Binary plist parsing successful');
        } catch (binaryError) {
          console.log('[SERVER /convert] Binary plist failed, trying as text:', binaryError.message);
          
          // If binary fails, try as text
          const fileContent = fileBuffer.toString('utf8');
          parsedPlist = plist.parse(fileContent);
          console.log('[SERVER /convert] Text plist parsing successful');
        }
        
        console.log('[SERVER /convert] Parsed plist structure:', JSON.stringify(parsedPlist, null, 2));
        
        // Pre-process plist to ensure EAP passwords are identified
        // This is needed because some mobileconfig files have deeply nested password fields
        if (obfuscationLevel !== 'none') {
          // Helper function to selectively obfuscate only true password fields
          const preprocessMobileConfigPasswords = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            
            // Look for EAPClientConfiguration sections - ONLY target specific paths
            if (obj.PayloadContent && Array.isArray(obj.PayloadContent)) {
              obj.PayloadContent.forEach(content => {
                // Process EAP configurations - exact path
                if (content.EAPClientConfiguration) {
                  // ONLY obfuscate UserPassword field
                  if (content.EAPClientConfiguration.UserPassword) {
                    console.log('[SERVER] Found UserPassword in EAPClientConfiguration, obfuscating');
                    // Fixed: Use mask obfuscation directly since we're pre-processing
                    content.EAPClientConfiguration.UserPassword = '***REDACTED***';
                  }
                }
              });
            }
            
            // Special handling for s structure seen in some profiles
            if (obj.s && obj.s.Password && typeof obj.s.Password === 'string') {
              console.log('[SERVER] Found Password in s structure, obfuscating');
              // Fixed: Use mask obfuscation directly since we're pre-processing
              obj.s.Password = '***REDACTED***';
            }
            
            // Do NOT recursively process all object properties - only target specific paths
          };
          
          // Apply pre-processing - more selective approach
          preprocessMobileConfigPasswords(parsedPlist);
        }
        
        // Apply obfuscation if requested
        const processedPlist = obfuscationLevel !== 'none' ? obfuscatePasswords(parsedPlist, obfuscationLevel) : parsedPlist;
        
        // Remove the helper markers we added
        const cleanupMarkers = (obj) => {
          if (!obj || typeof obj !== 'object') return;
          
          for (const key in obj) {
            if (key.startsWith('_isPasswordField_')) {
              delete obj[key];
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
              cleanupMarkers(obj[key]);
            }
          }
        };
        
        if (obfuscationLevel !== 'none') {
          cleanupMarkers(processedPlist);
        }
        
        // Log obfuscation results for debugging
        if (obfuscationLevel !== 'none') {
          console.log(`[SERVER /convert] Obfuscation applied with level: ${obfuscationLevel}`);
        }
        
        // Create comprehensive YAML that includes ALL data (with obfuscation applied if requested)
        const comprehensiveYamlOutput = yaml.dump(processedPlist, {
          indent: 2,
          lineWidth: 120,
          noRefs: true,
        });
        
        // Also create the filtered/mapped version for comparison (also obfuscated)
        const mappedData = mapMobileConfigToYaml(processedPlist);
        const filteredYamlOutput = yaml.dump(mappedData, {
          indent: 2,
          lineWidth: 120,
          noRefs: true,
        });
        
        console.log('[SERVER /convert] YAML dump successful. Full output length:', comprehensiveYamlOutput.length);
        
        // Process binary data for proper display
        const processedForJson = processBinaryData(processedPlist);
        const originalForJson = processBinaryData(parsedPlist);
        
        // Generate suggested filenames based on original filename
        const originalFilename = path.basename(filePath);
        const suggestedFilenames = generateSuggestedFilenames(originalFilename);
        
        // Return the response with processed data as primary YAML
        return res.json(addAlertsToResponse({
          success: true,
          yamlOutput: comprehensiveYamlOutput,         // PRIMARY: Full data (obfuscated if requested)
          comprehensiveYaml: comprehensiveYamlOutput,  // ALSO: Same data for comprehensive tab
          filteredYaml: filteredYamlOutput,            // SECONDARY: Filtered version (also obfuscated)
          jsonOutput: JSON.stringify(processedForJson, bufferJsonReplacer, 2), // JSON format for JSON tab with proper binary handling
          originalData: originalForJson,               // Keep original but with proper binary formatting
          suggestedFilenames: suggestedFilenames,      // Suggested download filenames
          obfuscationInfo: {
            level: obfuscationLevel,
            applied: obfuscationLevel !== 'none',
            note: obfuscationLevel !== 'none' ? `Passwords obfuscated using '${obfuscationLevel}' method` : 'No obfuscation applied'
          },
          mappingInfo: {
            filtered: false,                           // Indicate we're not filtering
            fullDataSize: JSON.stringify(parsedPlist).length,
            filteredDataSize: JSON.stringify(mappedData).length,
            note: "Full data is provided in the 'yamlOutput' field with requested obfuscation level"
          }
        }, alerts));
        
      } catch (error) {
        console.log('[SERVER /convert] .mobileconfig processing failed:', error.message);
        throw error;
      }
    } else if (fileExtension === '.xml') {
      console.log('[SERVER /convert] --- Processing .xml file ---');
      
      try {
        // Read file as buffer first to handle encoding issues
        const fileBuffer = fs.readFileSync(fullPath);
        console.log('[SERVER /convert] .xml file data read, length:', fileBuffer.length);
        
        // Convert to string for alert detection
        const fileContent = fileBuffer.toString('utf8');
        
        // Detect file issues and send alerts for XML files
        const alerts = detectFileIssues(fullPath, fileExtension, fileContent);
        if (alerts) {
          sendAlerts(streamId, alerts);
          console.log(`[SERVER /convert] Found ${alerts.length} issue(s) with the XML file`);
        }
        
        // Check if this is actually a binary file
        const isBinary = fileBuffer.some(byte => byte === 0 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13));
        if (isBinary) {
          console.log('[SERVER /convert] File appears to be binary, analyzing content');
          
          // Analyze the binary file and provide information in YAML format
          const binaryAnalysis = {
            fileInfo: {
              fileName: path.basename(fullPath),
              fileSize: fileBuffer.length,
              fileType: 'binary',
              detectedFormat: 'Unknown binary format'
            },
            analysis: {
              isBinary: true,
              hasNullBytes: fileBuffer.includes(0),
              firstBytes: Array.from(fileBuffer.slice(0, 20)).map(b => `0x${b.toString(16).padStart(2, '0')}`),
              firstBytesAsString: fileBuffer.slice(0, 50).toString('utf8', 0, 50).replace(/[^\x20-\x7E]/g, '?'),
              possibleFormats: []
            },
            hexDump: {
              first256Bytes: Array.from(fileBuffer.slice(0, 256))
                .map((byte, i) => {
                  if (i % 16 === 0) return `\n${i.toString(16).padStart(4, '0')}: ${byte.toString(16).padStart(2, '0')}`;
                  return byte.toString(16).padStart(2, '0');
                }).join(' ').trim()
            }
          };
          
          // Try to detect file format based on magic bytes
          const firstFourBytes = fileBuffer.slice(0, 4);
          if (firstFourBytes[0] === 0x50 && firstFourBytes[1] === 0x4B) {
            binaryAnalysis.analysis.possibleFormats.push('ZIP archive');
          }
          if (fileBuffer.slice(0, 8).toString() === 'bplist00') {
            binaryAnalysis.analysis.possibleFormats.push('Binary property list (plist)');
          }
          if (firstFourBytes[0] === 0x89 && firstFourBytes[1] === 0x50 && firstFourBytes[2] === 0x4E && firstFourBytes[3] === 0x47) {
            binaryAnalysis.analysis.possibleFormats.push('PNG image');
          }
          if (firstFourBytes[0] === 0xFF && firstFourBytes[1] === 0xD8) {
            binaryAnalysis.analysis.possibleFormats.push('JPEG image');
          }
          if (fileBuffer.slice(0, 4).toString() === '%PDF') {
            binaryAnalysis.analysis.possibleFormats.push('PDF document');
          }
          
          if (binaryAnalysis.analysis.possibleFormats.length === 0) {
            binaryAnalysis.analysis.possibleFormats.push('Unknown binary format');
          }
          
          binaryAnalysis.fileInfo.detectedFormat = binaryAnalysis.analysis.possibleFormats.join(', ');
          
          return res.json({
            success: true,
            fileType: 'binary-analysis',
            yamlOutput: yaml.dump(binaryAnalysis, { indent: 2, lineWidth: 120, noRefs: true }), // Frontend expects yamlOutput
            comprehensiveYaml: yaml.dump(binaryAnalysis, { indent: 2, lineWidth: 120, noRefs: true }),
            jsonOutput: JSON.stringify(binaryAnalysis, null, 2), // JSON format for JSON tab
            data: binaryAnalysis,
            originalData: `Binary file: ${path.basename(fullPath)} (${fileBuffer.length} bytes)`
          });
        }
        
        // Check if this is actually a ZIP file (Office document or ZIP archive)
        const zipSignature = fileBuffer.subarray(0, 4);
        const isZip = zipSignature[0] === 0x50 && zipSignature[1] === 0x4B; // "PK" signature
        
        if (isZip) {
          console.log('[SERVER /convert] Detected ZIP archive format, searching for plist content');
          
          try {
            const zip = new AdmZip(fileBuffer);
            const zipEntries = zip.getEntries();
            
            console.log('[SERVER /convert] ZIP contains', zipEntries.length, 'files');
            
            // First pass: Look for obvious plist/mobileconfig files
            let plistEntry = null;
            for (const entry of zipEntries) {
              const entryName = entry.entryName.toLowerCase();
              console.log('[SERVER /convert] Found file in ZIP:', entry.entryName);
              
              if (entryName.endsWith('.plist') || 
                  entryName.endsWith('.mobileconfig') || 
                  entryName.includes('passpoint') ||
                  entryName.includes('wifi') ||
                  entryName.includes('802dot1x')) {
                plistEntry = entry;
                console.log('[SERVER /convert] Found potential plist file in ZIP:', entry.entryName);
                break;
              }
            }
            
            // Second pass: Search file contents for plist data
            if (!plistEntry) {
              console.log('[SERVER /convert] No obvious plist files found, searching file contents...');
              
              for (const entry of zipEntries) {
                // Skip directories and very large files
                if (entry.isDirectory || entry.header.size > 1024 * 1024) { // Skip files > 1MB
                  continue;
                }
                
                try {
                  const entryData = entry.getData();
                  const entryText = entryData.toString('utf8', 0, Math.min(entryData.length, 10000)); // Check first 10KB
                  
                  // Look for plist signatures in the content
                  if (entryText.includes('<!DOCTYPE plist') || 
                      entryText.includes('<plist') ||
                      entryText.includes('PayloadType') ||
                      entryText.includes('com.apple.wifi.managed') ||
                      entryText.includes('EAPClientConfiguration') ||
                      entryText.includes('RoamingConsortiumOIs')) {
                    
                    console.log('[SERVER /convert] Found plist content in file:', entry.entryName);
                    plistEntry = entry;
                    break;
                  }
                  
                  // Also check for binary plist signatures
                  if (entryData.length >= 8) {
                    const header = entryData.toString('ascii', 0, 8);
                    if (header === 'bplist00' || header.startsWith('bplist')) {
                      console.log('[SERVER /convert] Found binary plist in file:', entry.entryName);
                      plistEntry = entry;
                      break;
                    }
                  }
                  
                } catch (contentError) {
                  // Skip files that can't be read as text
                  continue;
                }
              }
            }
            
            // Third pass: Try XML files that might contain embedded plist data
            if (!plistEntry) {
              console.log('[SERVER /convert] Still no plist found, checking XML files for embedded content...');
              
              for (const entry of zipEntries) {
                const entryName = entry.entryName.toLowerCase();
                
                if (entryName.endsWith('.xml') && 
                    !entryName.includes('content_types') &&
                    !entryName.includes('theme') &&
                    !entryName.includes('styles') &&
                    !entryName.includes('settings') &&
                    !entryName.includes('rels')) {
                  
                  try {
                    const xmlBuffer = entry.getData();
                    const xmlContent = xmlBuffer.toString('utf8');
                    
                    // Look for WiFi/network configuration in XML
                    if (xmlContent.includes('wifi') ||
                        xmlContent.includes('network') ||
                        xmlContent.includes('eap') ||
                        xmlContent.includes('passpoint') ||
                        xmlContent.includes('802.1x') ||
                        xmlContent.includes('certificate') ||
                        xmlContent.includes('credential')) {
                      
                      console.log('[SERVER /convert] Found potential network config in XML:', entry.entryName);
                      plistEntry = entry;
                      break;
                    }
                  } catch (xmlError) {
                    continue;
                  }
                }
              }
            }
            
            if (!plistEntry) {
              return res.status(400).json({ 
                error: 'No plist, mobileconfig, or network configuration content found in the ZIP archive. Searched through all files but found no Passpoint/WiFi configuration data. Files found: ' + 
                       zipEntries.map(e => e.entryName).join(', ')
              });
            }
            
            // Extract the plist file content
            const plistBuffer = plistEntry.getData();
            console.log('[SERVER /convert] Extracted potential plist file, size:', plistBuffer.length);
            
            // Try to parse as plist
            let parsedPlist;
            try {
              // Try binary plist first
              parsedPlist = plist.parse(plistBuffer);
              console.log('[SERVER /convert] Binary plist parsing successful from ZIP');
            } catch (binaryError) {
              console.log('[SERVER /convert] Binary plist failed, trying as text:', binaryError.message);
              
              try {
                // Try as text plist
                const plistText = plistBuffer.toString('utf8');
                
                // If it doesn't look like a plist, try to extract plist content from it
                if (!plistText.includes('<plist') && !plistText.includes('<!DOCTYPE plist')) {
                  console.log('[SERVER /convert] Not a standard plist, searching for embedded plist content...');
                  
                  // Look for plist-like structures in the text
                  const plistMatch = plistText.match(/<!DOCTYPE plist[\s\S]*?<\/plist>/i);
                  if (plistMatch) {
                    console.log('[SERVER /convert] Found embedded plist content');
                    parsedPlist = plist.parse(plistMatch[0]);
                  } else {
                    throw new Error('No valid plist content found in extracted file');
                  }
                } else {
                  parsedPlist = plist.parse(plistText);
                }
                
                console.log('[SERVER /convert] Text plist parsing successful from ZIP');
              } catch (textError) {
                console.log('[SERVER /convert] Text plist also failed:', textError.message);
                throw new Error(`Unable to parse extracted file as plist: ${textError.message}`);
              }
            }
            
            console.log('[SERVER /convert] Parsed plist structure from ZIP:', JSON.stringify(parsedPlist, null, 2));
            
            // Return full unfiltered data from ZIP
            const fullYamlOutput = yaml.dump(parsedPlist, {
              indent: 2,
              lineWidth: 120,
              noRefs: true,
            });
            
            // Also create filtered version for comparison
            const mappedData = mapMobileConfigToYaml(parsedPlist);
            const filteredYamlOutput = yaml.dump(mappedData, {
              indent: 2,
              lineWidth: 120,
              noRefs: true,
            });
            
            return res.json({
              success: true,
              yamlOutput: fullYamlOutput,              // PRIMARY: Full unfiltered data (frontend expects yamlOutput)
              comprehensiveYaml: fullYamlOutput,       // ALSO: Same data for comprehensive tab
              filteredYaml: filteredYamlOutput,        // SECONDARY: Filtered version
              jsonOutput: JSON.stringify(parsedPlist, null, 2), // JSON format for JSON tab
              originalData: parsedPlist,
              sourceFile: plistEntry.entryName,
              fileType: 'plist-in-zip',
              mappingInfo: {
                filtered: false,
                note: "Full unfiltered data extracted from ZIP is provided in the 'yamlOutput' field"
              }
            });
            
          } catch (zipError) {
            console.log('[SERVER /convert] ZIP processing failed:', zipError.message);
            return res.status(400).json({ 
              error: `Failed to process ZIP file: ${zipError.message}. This may not contain valid plist/configuration data.` 
            });
          }
        }
        
        // Convert buffer to string and clean it
        let xmlString = fileBuffer.toString('utf8');
        
        // Remove BOM if present
        if (xmlString.charCodeAt(0) === 0xFEFF) {
          xmlString = xmlString.slice(1);
        }
        
        // Trim whitespace
        xmlString = xmlString.trim();
        
        // Check if this might be Base64 encoded content
        const isBase64 = /^[A-Za-z0-9+/=\s]+$/.test(xmlString) && xmlString.length > 100;
        if (isBase64 && !xmlString.includes('<')) {
          console.log('[SERVER /convert] File appears to be Base64 encoded, attempting to decode');
          try {
            // Try to decode as Base64
            const decodedBuffer = Buffer.from(xmlString.replace(/\s/g, ''), 'base64');
            const decodedString = decodedBuffer.toString('utf8');
            console.log('[SERVER /convert] Base64 decode successful, decoded length:', decodedString.length);
            console.log('[SERVER /convert] Decoded content preview:', decodedString.substring(0, 200));
            
            // Check if decoded content contains XML
            if (decodedString.includes('<') && (decodedString.includes('<?xml') || decodedString.includes('<'))) {
              console.log('[SERVER /convert] Decoded content appears to be XML, using decoded version');
              xmlString = decodedString.trim();
            } else {
              console.log('[SERVER /convert] Decoded content is not XML, analyzing as multipart/other format');
              
              // Handle multipart or other decoded formats
              const analysisData = {
                fileInfo: {
                  fileName: path.basename(fullPath),
                  originalFormat: 'base64-encoded',
                  decodedFormat: 'multipart/mixed or other',
                  fileSize: fileBuffer.length,
                  decodedSize: decodedString.length
                },
                decodedContent: decodedString.substring(0, Math.min(decodedString.length, 5000)), // First 5KB
                contentAnalysis: {
                  isMultipart: decodedString.includes('Content-Type: multipart'),
                  hasBoundary: decodedString.includes('boundary='),
                  contentType: decodedString.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || 'unknown'
                }
              };
              
              // Try to extract any XML or configuration data from multipart content
              if (decodedString.includes('Content-Type: multipart')) {
                const parts = decodedString.split(/--[a-zA-Z0-9\-_]+/);
                for (const part of parts) {
                  if (part.includes('<') && (part.includes('<?xml') || part.includes('<config') || part.includes('<android'))) {
                    console.log('[SERVER /convert] Found XML content in multipart section');
                    const xmlMatch = part.match(/<\?xml[\s\S]*?(?=--[a-zA-Z0-9\-_]+|$)/i) || 
                                   part.match(/<[a-zA-Z][^>]*[\s\S]*?(?=--[a-zA-Z0-9\-_]+|$)/i);
                    if (xmlMatch) {
                      xmlString = xmlMatch[0].trim();
                      analysisData.extractedXml = xmlString.substring(0, 1000);
                      console.log('[SERVER /convert] Extracted XML from multipart, length:', xmlString.length);
                      break;
                    }
                  }
                }
              }
              
              // If we extracted XML from multipart, continue processing it
              if (analysisData.extractedXml) {
                console.log('[SERVER /convert] Continuing with extracted XML content');
                // Continue with normal XML processing below
              } else {
                // Return analysis of non-XML content
                return res.json({
                  success: true,
                  fileType: 'base64-decoded-analysis',
                  yamlOutput: yaml.dump(analysisData, { indent: 2, lineWidth: 120, noRefs: true }),
                  comprehensiveYaml: yaml.dump(analysisData, { indent: 2, lineWidth: 120, noRefs: true }),
                  jsonOutput: JSON.stringify(analysisData, null, 2),
                  data: analysisData,
                  originalData: `Base64-decoded content: ${decodedString.substring(0, 1000)}`
                });
              }
            }
          } catch (base64Error) {
            console.log('[SERVER /convert] Base64 decoding failed:', base64Error.message);
            // Continue with original content
          }
        }
        
        // Check for very large files that might cause issues
        if (xmlString.length > 10 * 1024 * 1024) { // 10MB limit
          console.log('[SERVER /convert] File too large for processing');
          return res.status(400).json({ 
            error: 'File is too large. Please upload a file smaller than 10MB.' 
          });
        }
        
        console.log('[SERVER /convert] First 100 chars of file:', xmlString.substring(0, 100));
        
        // Check if this is actually a plist file (binary or XML)
        if (xmlString.includes('<!DOCTYPE plist') || xmlString.includes('<plist')) {
          console.log('[SERVER /convert] Detected plist format in .xml file, using plist parser');
          
          // Use plist parser instead
          let parsedPlist;
          try {
            // Clean up the XML content before parsing
            let cleanContent = xmlString;
            
            // Fix malformed DOCTYPE declarations
            cleanContent = cleanContent.replace(
              /<!DOCTYPE plist PUBLIC "[^"]*" "[^"]*">/g,
              '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
            );
            
            // Also handle DOCTYPE declarations that span multiple lines
            cleanContent = cleanContent.replace(
              /<!DOCTYPE plist PUBLIC "[^"]*" "[^"]*"[^>]*>/g,
              '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
            );
            
            // Remove any BOM or encoding issues
            cleanContent = cleanContent.replace(/^\uFEFF/, '');
            
            // Try parsing as text first
            parsedPlist = plist.parse(cleanContent);
            console.log('[SERVER /convert] Successfully parsed plist as text');
          } catch (textError) {
            console.log('[SERVER /convert] Text plist failed, trying binary:', textError.message);
            try {
              // If text fails, try binary
              const fileBuffer = fs.readFileSync(fullPath);
              parsedPlist = plist.parse(fileBuffer);
              console.log('[SERVER /convert] Successfully parsed plist as binary');
            } catch (binaryError) {
              console.log('[SERVER /convert] Binary plist also failed, trying XML2JS:', binaryError.message);
              // If both plist parsers fail, try XML2JS as fallback
              const parser = new xml2js.Parser({ 
                explicitArray: false, 
                mergeAttrs: true,
                trim: true,
                ignoreAttrs: false,
                normalizeTags: false,
                normalize: false
              });
              parsedPlist = await parser.parseStringPromise(xmlString);
              console.log('[SERVER /convert] Successfully parsed with XML2JS fallback');
            }
          }
          
          console.log('[SERVER /convert] Parsed plist structure keys:', Object.keys(parsedPlist || {}));
          
          // Ensure we have valid parsed data
          if (!parsedPlist || typeof parsedPlist !== 'object' || Object.keys(parsedPlist).length === 0) {
            console.log('[SERVER /convert] Parsed data is empty, trying XML2JS as primary parser');
            // If plist parsing returned empty data, try XML2JS as primary parser
            const parser = new xml2js.Parser({
              explicitArray: false,
              mergeAttrs: true,
              trim: true,
              ignoreAttrs: false,
              normalizeTags: false,
              normalize: false
            });
            parsedPlist = await parser.parseStringPromise(fileContent);
            console.log('[SERVER /convert] XML2JS parsed structure keys:', Object.keys(parsedPlist || {}));
          }
          
          // Ensure we have valid parsed data
          if (!parsedPlist || typeof parsedPlist !== 'object') {
            throw new Error('Failed to parse plist data into valid object structure');
          }
          
          // Apply password obfuscation if requested
          let processedData = obfuscationLevel !== 'none' ? obfuscatePasswords(parsedPlist, obfuscationLevel) : parsedPlist;
          
          // Apply certificate handling if requested
          if (certHandling !== 'preserve') {
            console.log('[SERVER /convert] Applying certificate handling mode:', certHandling);
            processedData = certService.processCertificatesInObject(processedData, certHandling);
          }
          
          // Return full unfiltered plist data as YAML
          const fullYamlOutput = yaml.dump(processedData, {
            indent: 2,
            lineWidth: 120,
            noRefs: true,
          });
          
          // Also create filtered version for comparison
          const mappedData = mapMobileConfigToYaml(processedData);
          const filteredYamlOutput = yaml.dump(mappedData, {
            indent: 2,
            lineWidth: 120,
            noRefs: true,
          });
          
          return res.json(addAlertsToResponse({
            success: true,
            yamlOutput: fullYamlOutput,              // PRIMARY: Full unfiltered data (frontend expects yamlOutput)
            comprehensiveYaml: fullYamlOutput,       // ALSO: Same data for comprehensive tab
            filteredYaml: filteredYamlOutput,        // SECONDARY: Filtered version
            jsonOutput: JSON.stringify(processedData, null, 2), // JSON format for JSON tab
            originalData: processedData,
            fileType: 'plist-in-xml',
            mappingInfo: {
              filtered: false,
              note: "Full unfiltered plist data is provided in the 'yamlOutput' field"
            }
          }, alerts));
        }
        
        // Check if file contains valid XML content (more lenient check)
        const trimmedXml = xmlString.trim();
        if (!trimmedXml.includes('<') || trimmedXml.length === 0) {
          return res.status(400).json({ 
            error: 'File does not appear to contain valid XML content. Please ensure you have uploaded a proper XML, plist, or ZIP file containing configuration data.' 
          });
        }
        
        // If it's not a plist, try regular XML parsing
        const parser = new xml2js.Parser({ 
          explicitArray: false, 
          mergeAttrs: true,
          trim: true,
          ignoreAttrs: false,
          maxAttribs: 1000, // Limit attributes to prevent DoS
          maxChildren: 10000, // Limit children to prevent DoS
          strict: false, // Be more lenient with XML parsing
          normalizeTags: false, // Keep original tag casing
          normalize: false // Keep original whitespace
        });
        
        // Add timeout protection for XML parsing
        const parsePromise = parser.parseStringPromise(xmlString);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('XML parsing timeout')), 30000) // 30 second timeout
        );
        
        parsedData = await Promise.race([parsePromise, timeoutPromise]);
        console.log('[SERVER /convert] .xml file parsed successfully.');
        
        // First apply password obfuscation if requested
        let processedData = obfuscationLevel !== 'none' ? obfuscatePasswords(parsedData, obfuscationLevel) : parsedData;
        
        // Next apply certificate handling if requested
        if (certHandling !== 'preserve') {
          console.log('[SERVER /convert] Applying certificate handling mode:', certHandling);
          processedData = certService.processCertificatesInObject(processedData, certHandling);
        }
        
        // Find any certificates in the data
        const certMetadata = {};
        const findCerts = (obj, path = '') => {
          if (!obj || typeof obj !== 'object') return;
          
          if (Array.isArray(obj)) {
            obj.forEach((item, index) => findCerts(item, `${path}[${index}]`));
            return;
          }
          
          for (const [key, value] of Object.entries(obj)) {
            const currentPath = path ? `${path}.${key}` : key;
            
            if (typeof value === 'string' && certService.isCertificateData(value)) {
              const info = certService.extractCertInfo(value);
              if (info) {
                certMetadata[currentPath] = info;
              }
            } else if (typeof value === 'object' && value !== null) {
              findCerts(value, currentPath);
            }
          }
        };
        
        // Collect certificate metadata from original data
        findCerts(parsedData);
        
        // Process binary data for proper display
        const processedForJson = processBinaryData(processedData);
        const originalForJson = processBinaryData(parsedData);
        
        // Generate suggested filenames based on original filename
        const originalFilename = path.basename(filePath);
        const suggestedFilenames = generateSuggestedFilenames(originalFilename);
        
        // Prepare the response data
        const responseData = {
          success: true,
          fileType: 'xml',
          streamId,
          yamlOutput: yaml.dump(processedForJson, { indent: 2, lineWidth: 120, noRefs: true }), // Frontend expects yamlOutput
          comprehensiveYaml: yaml.dump(processedForJson, { indent: 2, lineWidth: 120, noRefs: true }),
          jsonOutput: JSON.stringify(processedForJson, bufferJsonReplacer, 2), // JSON format for JSON tab with buffer handling
          suggestedFilenames: suggestedFilenames, // Suggested download filenames
          data: processedData,
          originalData: originalForJson, // Keep original but with proper binary formatting
          certificateInfo: Object.keys(certMetadata).length > 0 ? certMetadata : null // Include certificate metadata
        };
        
        // Send final update via WebSocket
        sendConversionUpdate(streamId, {
          status: 'completed',
          message: 'Conversion completed successfully',
          result: {
            fileType: 'xml',
            yamlPreview: yaml.dump(processedData, { indent: 2 }).substring(0, 500) + '...',
            certificateCount: Object.keys(certMetadata).length
          }
        });
        
        // Add obfuscation info to response data
        responseData.obfuscationInfo = {
          level: obfuscationLevel,
          applied: obfuscationLevel !== 'none',
          note: obfuscationLevel !== 'none' ? `Passwords obfuscated using '${obfuscationLevel}' method` : 'No obfuscation applied'
        };
        
        // Return structured response
        return res.json(responseData);
        
      } catch (xmlError) {
        console.log('[SERVER /convert] XML parsing failed:', xmlError.message);
        console.log('[SERVER /convert] XML content preview:', fileContent.substring(0, 200));
        
        // Try as binary plist if XML parsing fails
        try {
          console.log('[SERVER /convert] Attempting to parse as binary plist...');
          const fileBuffer = fs.readFileSync(fullPath);
          const parsedPlist = plist.parse(fileBuffer);
          
          console.log('[SERVER /convert] Binary plist parsing successful');
          console.log('[SERVER /convert] Parsed plist structure:', JSON.stringify(parsedPlist, null, 2));
          
          // Return full unfiltered plist data
          const fullYamlOutput = yaml.dump(parsedPlist, {
            indent: 2,
            lineWidth: 120,
            noRefs: true,
          });
          
          // Also create filtered version for comparison
          const mappedData = mapMobileConfigToYaml(parsedPlist);
          const filteredYamlOutput = yaml.dump(mappedData, {
            indent: 2,
            lineWidth: 120,
            noRefs: true,
          });
          
          return res.json(addAlertsToResponse({
            success: true,
            yamlOutput: fullYamlOutput,              // PRIMARY: Full unfiltered data (frontend expects yamlOutput)
            comprehensiveYaml: fullYamlOutput,       // ALSO: Same data for comprehensive tab
            filteredYaml: filteredYamlOutput,        // SECONDARY: Filtered version
            jsonOutput: JSON.stringify(parsedPlist, null, 2), // JSON format for JSON tab
            originalData: parsedPlist,
            fileType: 'binary-plist',
            mappingInfo: {
              filtered: false,
              note: "Full unfiltered binary plist data is provided in the 'yamlOutput' field"
            }
          }, alerts));
          
        } catch (plistError) {
          console.log('[SERVER /convert] Plist parsing also failed:', plistError.message);
          
          // Provide more helpful error message with content analysis
          const firstChars = fileContent.substring(0, 100).replace(/[^\x20-\x7E\n\r\t]/g, '?');
          const hasXmlTags = fileContent.includes('<') && fileContent.includes('>');
          const xmlParseErrorShort = xmlError.message.substring(0, 100);
          
          return res.status(400).json({ 
            error: `Unable to parse XML file. XML parsing error: ${xmlParseErrorShort}. File preview: "${firstChars}..."`,
            details: {
              fileSize: fileContent.length,
              hasXmlTags: hasXmlTags,
              xmlError: xmlError.message,
              plistError: plistError.message,
              suggestion: hasXmlTags ? 
                "The file contains XML tags but has parsing errors. Check for malformed XML syntax." :
                "The file doesn't appear to contain standard XML structure."
            },
            alerts: alerts || null
          });
        }
      }

    } else if (fileExtension === '.yml' || fileExtension === '.yaml') {
      console.log('[SERVER /convert] --- Processing .yml/.yaml file (converting to JSON) ---');
      const yamlContent = fs.readFileSync(fullPath, 'utf8');
      
      // Detect file issues and send alerts for YAML files
      const alerts = detectFileIssues(fullPath, fileExtension, yamlContent);
      if (alerts) {
        sendAlerts(streamId, alerts);
        console.log(`[SERVER /convert] Found ${alerts.length} issue(s) with the YAML file`);
      }
      
      const jsonData = yaml.load(yamlContent);
      console.log('[SERVER /convert] YAML to JSON conversion successful.');
      
      // Apply password obfuscation if requested
      let processedData = obfuscationLevel !== 'none' ? obfuscatePasswords(jsonData, obfuscationLevel) : jsonData;
      
      // Apply certificate handling if requested
      if (certHandling !== 'preserve') {
        console.log('[SERVER /convert] Applying certificate handling mode:', certHandling);
        processedData = certService.processCertificatesInObject(processedData, certHandling);
        // Debug: Show a preview of the processed YAML output
        const debugYaml = require('js-yaml').dump(processedData, { indent: 2, lineWidth: 120, noRefs: true });
        console.log(`[SERVER /convert] YAML output after cert handling (${certHandling}):\n`, debugYaml.substring(0, 500));
      }
      
      // Find any certificates in the data
      const certMetadata = {};
      const findCerts = (obj, path = '') => {
        if (!obj || typeof obj !== 'object') return;
        
        if (Array.isArray(obj)) {
          obj.forEach((item, index) => findCerts(item, `${path}[${index}]`));
          return;
        }
        
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          // Check direct string value
          if (typeof value === 'string' && certService.isCertificateData(value)) {
            const info = certService.extractCertInfo(value);
            if (info) {
              certMetadata[currentPath] = info;
            }
          // Check for certificate under '_' property (EAP/Passpoint pattern)
          } else if (
            value && typeof value === 'object' &&
            Object.prototype.hasOwnProperty.call(value, '_') &&
            typeof value._ === 'string' &&
            certService.isCertificateData(value._)
          ) {
            const info = certService.extractCertInfo(value._);
            if (info) {
              certMetadata[`${currentPath}._`] = info;
            }
            // Continue to check nested objects as well
            findCerts(value, currentPath);
          } else if (typeof value === 'object' && value !== null) {
            findCerts(value, currentPath);
          }
        }
      };
      
      // Collect certificate metadata from original data
      findCerts(jsonData);
      
      // Process binary data for proper display
      const processedForJson = processBinaryData(processedData);
      const originalForJson = processBinaryData(jsonData);

      // Always generate YAML output from processed data (with cert handling applied)
      const yamlOutput = yaml.dump(processedForJson, { indent: 2, lineWidth: 120, noRefs: true });
      const comprehensiveYaml = yaml.dump(processedForJson, { indent: 2, lineWidth: 120, noRefs: true });

      // Generate suggested filenames based on original filename
      const originalFilename = path.basename(filePath);
      const suggestedFilenames = generateSuggestedFilenames(originalFilename);
      
      return res.json(addAlertsToResponse({
        success: true,
        fileType: 'yaml',
        yamlOutput,
        comprehensiveYaml,
        jsonOutput: JSON.stringify(processedForJson, bufferJsonReplacer, 2),
        suggestedFilenames: suggestedFilenames, // Suggested download filenames
        data: processedData,
        originalData: originalForJson,
        certificateInfo: Object.keys(certMetadata).length > 0 ? certMetadata : null,
        obfuscationInfo: {
          level: obfuscationLevel,
          applied: obfuscationLevel !== 'none',
          note: obfuscationLevel !== 'none' ? `Passwords obfuscated using '${obfuscationLevel}' method` : 'No obfuscation applied'
        }
      }, alerts));

    } else if (fileExtension === '.eap-config') {
      console.log('[SERVER /convert] --- Processing .eap-config file ---');
      
      try {
        const fileContent = fs.readFileSync(fullPath, 'utf8');
        console.log('[SERVER /convert] .eap-config file content read, length:', fileContent.length);
        
        // Try to parse as XML first (most EAP config files are XML)
        try {
          const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
          const xmlData = await parser.parseStringPromise(fileContent);
          
          // Generate YAML from the parsed XML
          const yamlContent = yaml.dump(xmlData, { indent: 2, lineWidth: 120, noRefs: true });
          const jsonContent = JSON.stringify(xmlData, null, 2);
          
          // Generate suggested filenames based on original filename
          const originalFilename = path.basename(filePath);
          const suggestedFilenames = generateSuggestedFilenames(originalFilename);
          
          return res.json({
            success: true,
            yamlOutput: yamlContent,
            jsonOutput: jsonContent,
            originalData: fileContent,
            comprehensiveYaml: yamlContent,
            suggestedFilenames: suggestedFilenames,
            mappingInfo: {
              fileType: 'eap-config',
              format: 'xml',
              originalDataSize: fileContent.length,
              mappedDataSize: yamlContent.length,
              processingNotes: 'EAP Identity Provider configuration parsed as XML'
            }
          });
        } catch (xmlError) {
          console.log('[SERVER /convert] Not valid XML, trying as plain text');
          
          // If not XML, treat as key-value configuration
          const configData = {};
          const lines = fileContent.split('\n');
          
          lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
              const [key, ...valueParts] = trimmed.split('=');
              if (key && valueParts.length > 0) {
                configData[key.trim()] = valueParts.join('=').trim();
              }
            }
          });
          
          const yamlContent = yaml.dump(configData, { indent: 2, lineWidth: 120, noRefs: true });
          const jsonContent = JSON.stringify(configData, null, 2);
          
          // Generate suggested filenames based on original filename
          const originalFilename = path.basename(filePath);
          const suggestedFilenames = generateSuggestedFilenames(originalFilename);
          
          return res.json({
            success: true,
            yamlOutput: yamlContent,
            jsonOutput: jsonContent,
            originalData: fileContent,
            comprehensiveYaml: yamlContent,
            suggestedFilenames: suggestedFilenames,
            mappingInfo: {
              fileType: 'eap-config',
              format: 'key-value',
              originalDataSize: fileContent.length,
              mappedDataSize: yamlContent.length,
              processingNotes: 'EAP configuration parsed as key-value pairs'
            }
          });
        }
      } catch (error) {
        console.log('[SERVER /convert] .eap-config processing failed:', error.message);
        throw error;
      }

    } else if (fileExtension === '.txt' || fileExtension === '.conf' || fileExtension === '.cfg') {
      console.log('[SERVER /convert] --- Processing text configuration file ---');
      
      try {
        const fileContent = fs.readFileSync(fullPath, 'utf8');
        console.log('[SERVER /convert] Text file content read, length:', fileContent.length);
        
        // Detect file issues and send alerts for text files
        const alerts = detectFileIssues(fullPath, fileExtension, fileContent);
        if (alerts) {
          sendAlerts(streamId, alerts);
          console.log(`[SERVER /convert] Found ${alerts.length} issue(s) with the text file`);
        }
        
        // Check if this is actually XML/plist content in a .txt file
        if (fileContent.includes('<?xml') || fileContent.includes('<!DOCTYPE plist') || fileContent.includes('<plist')) {
          console.log('[SERVER /convert] Detected XML/plist content in .txt file, processing as XML');
          
          // Use the same XML processing logic as for .xml files
          if (fileContent.includes('<!DOCTYPE plist') || fileContent.includes('<plist')) {
            console.log('[SERVER /convert] Detected plist format in .txt file, using plist parser');
            
            // Use plist parser instead
            let parsedPlist;
            try {
              // Clean up the XML content before parsing
              let cleanContent = fileContent;
              
              // Fix malformed DOCTYPE declarations
              cleanContent = cleanContent.replace(
                /<!DOCTYPE plist PUBLIC "[^"]*" "[^"]*">/g,
                '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
              );
              
              // Also handle DOCTYPE declarations that span multiple lines
              cleanContent = cleanContent.replace(
                /<!DOCTYPE plist PUBLIC "[^"]*" "[^"]*"[^>]*>/g,
                '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
              );
              
              // Remove any BOM or encoding issues
              cleanContent = cleanContent.replace(/^\uFEFF/, '');
              
              // Try parsing as text first
              parsedPlist = plist.parse(cleanContent);
              console.log('[SERVER /convert] Successfully parsed plist as text');
            } catch (textError) {
              console.log('[SERVER /convert] Text plist failed, trying binary:', textError.message);
              try {
                // If text fails, try binary
                const fileBuffer = fs.readFileSync(fullPath);
                parsedPlist = plist.parse(fileBuffer);
                console.log('[SERVER /convert] Successfully parsed plist as binary');
              } catch (binaryError) {
                console.log('[SERVER /convert] Binary plist also failed, trying XML2JS:', binaryError.message);
                // If both plist parsers fail, try XML2JS as fallback
                const parser = new xml2js.Parser({ 
                  explicitArray: false, 
                  mergeAttrs: true,
                  trim: true,
                  ignoreAttrs: false,
                  normalizeTags: false,
                  normalize: false
                });
                parsedPlist = await parser.parseStringPromise(fileContent);
                console.log('[SERVER /convert] Successfully parsed with XML2JS fallback');
              }
            }
            
            console.log('[SERVER /convert] Parsed plist structure keys:', Object.keys(parsedPlist || {}));
            
            // Ensure we have valid parsed data
            if (!parsedPlist || typeof parsedPlist !== 'object' || Object.keys(parsedPlist).length === 0) {
              console.log('[SERVER /convert] Parsed data is empty, trying XML2JS as primary parser');
              // If plist parsing returned empty data, try XML2JS as primary parser
              const parser = new xml2js.Parser({
                explicitArray: false,
                mergeAttrs: true,
                trim: true,
                ignoreAttrs: false,
                normalizeTags: false,
                normalize: false
              });
              parsedPlist = await parser.parseStringPromise(fileContent);
              console.log('[SERVER /convert] XML2JS parsed structure keys:', Object.keys(parsedPlist || {}));
            }
            
            // Ensure we have valid parsed data
            if (!parsedPlist || typeof parsedPlist !== 'object') {
              throw new Error('Failed to parse plist data into valid object structure');
            }
            
            // Apply password obfuscation if requested
            let processedData = obfuscationLevel !== 'none' ? obfuscatePasswords(parsedPlist, obfuscationLevel) : parsedPlist;
            
            // Apply certificate handling if requested
            if (certHandling !== 'preserve') {
              console.log('[SERVER /convert] Applying certificate handling mode:', certHandling);
              processedData = certService.processCertificatesInObject(processedData, certHandling);
            }
            
            // Return full unfiltered plist data as YAML
            const fullYamlOutput = yaml.dump(processedData, {
              indent: 2,
              lineWidth: 120,
              noRefs: true,
            });
            
            // Also create filtered version for comparison
            const mappedData = mapMobileConfigToYaml(processedData);
            const filteredYamlOutput = yaml.dump(mappedData, {
              indent: 2,
              lineWidth: 120,
              noRefs: true,
            });
            
            return res.json(addAlertsToResponse({
              success: true,
              yamlOutput: fullYamlOutput,              // PRIMARY: Full unfiltered data (frontend expects yamlOutput)
              comprehensiveYaml: fullYamlOutput,       // ALSO: Same data for comprehensive tab
              filteredYaml: filteredYamlOutput,        // SECONDARY: Filtered version
              jsonOutput: JSON.stringify(processedData, null, 2), // JSON format for JSON tab
              originalData: processedData,
              fileType: 'plist-in-txt',
              mappingInfo: {
                filtered: false,
                note: "Full unfiltered plist data is provided in the 'yamlOutput' field"
              }
            }, alerts));
          } else {
            // Regular XML processing
            const parser = new xml2js.Parser({ 
              explicitArray: false, 
              mergeAttrs: true,
              trim: true,
              ignoreAttrs: false,
              maxAttribs: 1000,
              maxChildren: 10000,
              strict: false,
              normalizeTags: false,
              normalize: false
            });
            
            const parsedData = await parser.parseStringPromise(fileContent);
            console.log('[SERVER /convert] XML file parsed successfully from .txt file.');
            
            // Apply password obfuscation if requested
            let processedData = obfuscationLevel !== 'none' ? obfuscatePasswords(parsedData, obfuscationLevel) : parsedData;
            
            // Apply certificate handling if requested
            if (certHandling !== 'preserve') {
              console.log('[SERVER /convert] Applying certificate handling mode:', certHandling);
              processedData = certService.processCertificatesInObject(processedData, certHandling);
            }
            
            return res.json(addAlertsToResponse({
              success: true,
              fileType: 'xml-in-txt',
              yamlOutput: yaml.dump(processedData, { indent: 2, lineWidth: 120, noRefs: true }),
              comprehensiveYaml: yaml.dump(processedData, { indent: 2, lineWidth: 120, noRefs: true }),
              jsonOutput: JSON.stringify(processedData, null, 2),
              data: processedData,
              originalData: processedData
            }, alerts));
          }
        }
        
        // If not XML/plist, process as regular text configuration file
        const configData = {
          fileType: fileExtension.replace('.', ''),
          sections: {},
          keyValues: {},
          rawContent: fileContent
        };
        
        const lines = fileContent.split('\n');
        let currentSection = 'default';
        
        lines.forEach((line, index) => {
          const trimmed = line.trim();
          
          // Skip empty lines and comments
          if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith(';')) {
            return;
          }
          
          // Check for section headers [section]
          const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
          if (sectionMatch) {
            currentSection = sectionMatch[1];
            configData.sections[currentSection] = {};
            return;
          }
          
          // Parse key=value pairs
          const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
          if (kvMatch) {
            const key = kvMatch[1].trim();
            const value = kvMatch[2].trim();
            
            if (!configData.sections[currentSection]) {
              configData.sections[currentSection] = {};
            }
            
            configData.sections[currentSection][key] = value;
            configData.keyValues[key] = value;
          }
        });
        
        return res.json(addAlertsToResponse({
          success: true,
          fileType: fileExtension.replace('.', ''),
          yamlOutput: yaml.dump(configData, { indent: 2, lineWidth: 120, noRefs: true }), // Frontend expects yamlOutput
          comprehensiveYaml: yaml.dump(configData, { indent: 2, lineWidth: 120, noRefs: true }),
          jsonOutput: JSON.stringify(configData, null, 2), // JSON format for JSON tab
          data: configData,
          originalData: fileContent
        }, alerts));
      } catch (error) {
        console.log('[SERVER /convert] Text file processing failed:', error.message);
        throw error;
      }

    } else if (fileExtension === '.json') {
      console.log('[SERVER /convert] --- Processing .json file ---');
      
      try {
        const fileContent = fs.readFileSync(fullPath, 'utf8');
        
        // Detect file issues and send alerts for JSON files
        const alerts = detectFileIssues(fullPath, fileExtension, fileContent);
        if (alerts) {
          sendAlerts(streamId, alerts);
          console.log(`[SERVER /convert] Found ${alerts.length} issue(s) with the JSON file`);
        }
        
        const jsonData = JSON.parse(fileContent);
        
        return res.json(addAlertsToResponse({
          success: true,
          fileType: 'json',
          yamlOutput: yaml.dump(jsonData, { indent: 2, lineWidth: 120, noRefs: true }), // Frontend expects yamlOutput
          comprehensiveYaml: yaml.dump(jsonData, { indent: 2, lineWidth: 120, noRefs: true }),
          jsonOutput: JSON.stringify(jsonData, null, 2), // JSON format for JSON tab
          data: jsonData,
          originalData: jsonData
        }, alerts));
      } catch (error) {
        console.log('[SERVER /convert] JSON processing failed:', error.message);
        throw error;
      }

    } else {
      console.log('[SERVER /convert] --- Processing unknown/generic file type ---', fileExtension);
      
      try {
        const fileBuffer = fs.readFileSync(fullPath);
        console.log('[SERVER /convert] Unknown file data read, length:', fileBuffer.length);
        
        // Convert to string for alert detection
        const fileContent = fileBuffer.toString('utf8');
        
        // Detect file issues and send alerts for unknown files
        const alerts = detectFileIssues(fullPath, fileExtension, fileContent);
        if (alerts) {
          sendAlerts(streamId, alerts);
          console.log(`[SERVER /convert] Found ${alerts.length} issue(s) with the unknown file`);
        }
        
        // Try multiple parsing strategies for unknown files
        let parsedData = null;
        let conversionMethod = 'unknown';
        let errorMessage = '';
        
        // Strategy 1: Try as plist (binary or text)
        try {
          parsedData = plist.parse(fileBuffer);
          conversionMethod = 'plist';
          console.log('[SERVER /convert] Successfully parsed unknown file as plist');
        } catch (plistError) {
          console.log('[SERVER /convert] Plist parsing failed:', plistError.message);
          
          // Strategy 2: Try as JSON
          try {
            const textContent = fileBuffer.toString('utf8');
            parsedData = JSON.parse(textContent);
            conversionMethod = 'json';
            console.log('[SERVER /convert] Successfully parsed unknown file as JSON');
          } catch (jsonError) {
            console.log('[SERVER /convert] JSON parsing failed:', jsonError.message);
            
            // Strategy 3: Try as XML
            try {
              const textContent = fileBuffer.toString('utf8');
              const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
              parsedData = await parser.parseStringPromise(textContent);
              conversionMethod = 'xml';
              console.log('[SERVER /convert] Successfully parsed unknown file as XML');
            } catch (xmlError) {
              console.log('[SERVER /convert] XML parsing failed:', xmlError.message);
              
              // Strategy 4: Try as YAML
              try {
                const textContent = fileBuffer.toString('utf8');
                parsedData = yaml.load(textContent);
                conversionMethod = 'yaml';
                console.log('[SERVER /convert] Successfully parsed unknown file as YAML');
              } catch (yamlError) {
                console.log('[SERVER /convert] YAML parsing failed:', yamlError.message);
                errorMessage = `Failed to parse as plist, JSON, XML, or YAML. Last error: ${yamlError.message}`;
              }
            }
          }
        }
        
        if (parsedData) {
          // Successfully parsed the unknown file
          const yamlOutput = yaml.dump(parsedData, { indent: 2, lineWidth: 120, noRefs: true });
          
          return res.json(addAlertsToResponse({
            success: true,
            fileType: `unknown-parsed-as-${conversionMethod}`,
            yamlOutput: yamlOutput,                  // Frontend expects yamlOutput
            comprehensiveYaml: yamlOutput,           // Same data for comprehensive tab
            jsonOutput: JSON.stringify(parsedData, null, 2), // JSON format for JSON tab
            data: parsedData,
            originalData: fileBuffer.toString('utf8', 0, Math.min(fileBuffer.length, 10000)), // First 10KB as text
            mappingInfo: {
              detectedFormat: conversionMethod,
              note: `Unknown file type successfully parsed as ${conversionMethod.toUpperCase()}`
            }
          }, alerts));
        } else {
          // Could not parse - return raw analysis
          const analysisData = {
            fileName: path.basename(fullPath),
            fileSize: fileBuffer.length,
            fileExtension: fileExtension,
            isBinary: fileBuffer.some(byte => byte === 0 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)),
            firstBytes: Array.from(fileBuffer.slice(0, 20)).map(b => `0x${b.toString(16).padStart(2, '0')}`),
            textPreview: fileBuffer.toString('utf8', 0, Math.min(fileBuffer.length, 500)).replace(/[^\x20-\x7E\n\r\t]/g, '?'),
            parseError: errorMessage
          };
          
          const errorYaml = yaml.dump({
            error: 'Could not parse file in any known format',
            fileName: path.basename(fullPath),
            fileSize: fileBuffer.length,
            parseError: errorMessage
          }, { indent: 2, lineWidth: 120, noRefs: true });
          
          return res.json(addAlertsToResponse({
            success: true,
            fileType: 'unknown-binary-analysis',
            yamlOutput: errorYaml,                   // Frontend expects yamlOutput
            comprehensiveYaml: errorYaml,            // Same data for comprehensive tab
            jsonOutput: JSON.stringify(analysisData, null, 2), // JSON format for JSON tab
            data: analysisData,
            originalData: fileBuffer.toString('utf8', 0, Math.min(fileBuffer.length, 10000))
          }, alerts));
        }
      } catch (error) {
        console.log('[SERVER /convert] Unknown file processing failed:', error.message);
        throw error;
      }
      
      console.error('[SERVER /convert] Unsupported file type for conversion:', fileExtension);
      return res.status(400).json({ error: 'Unsupported file type for conversion' });
    }

    // This section only runs for XML files now (since .mobileconfig and .yaml return early)
    if (fileTypeForMapping) {
      console.log('[SERVER /convert] Calling mapToYamlSchema for fileType:', fileTypeForMapping);
      const mappedData = mapToYamlSchema(parsedData, fileTypeForMapping);
      
      console.log('[SERVER /convert] mapToYamlSchema returned, attempting to dump to YAML.');
      const yamlOutput = yaml.dump(mappedData, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
      });
      console.log('[SERVER /convert] YAML dump successful. Output length:', yamlOutput.length);

      res.setHeader('Content-Type', 'text/yaml');
      return res.send(yamlOutput);
    }
  } catch (error) {
    console.error('[SERVER /convert] --- ERROR in /convert processing ---');
    console.error('[SERVER /convert] Error message:', error.message);
    console.error('[SERVER /convert] Error name:', error.name);
    console.error('[SERVER /convert] Error stack:', error.stack);
    return res.status(500).json({ 
      error: 'Failed to convert file on server', 
      details: error.message 
    });
  } finally {
    // File is kept for the session to allow reprocessing with different obfuscation levels
    // No automatic cleanup after conversion to enable reprocessing
    console.log('[SERVER] Keeping uploaded file for session reuse:', fullPath);
  }
});

// Add a new route to check if a previously uploaded file is still available
router.get('/file-status/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!filename) {
    return res.status(400).json({ error: 'No filename provided' });
  }
  
  // Use local uploads directory
  const uploadDir = process.env.FUNCTION_TARGET 
    ? '/tmp' 
    : path.join(__dirname, '..', 'config', 'uploads');
  
  const filePath = path.join(uploadDir, path.basename(filename));
  
  if (fs.existsSync(filePath)) {
    try {
      const stats = fs.statSync(filePath);
      return res.status(200).json({ 
        exists: true, 
        fileName: path.basename(filename),
        size: stats.size,
        uploaded: stats.mtime
      });
    } catch (err) {
      return res.status(500).json({ error: 'Error checking file status' });
    }
  } else {
    return res.status(404).json({ 
      exists: false, 
      fileName: path.basename(filename),
      message: 'File not found or has been deleted'
    });
  }
});

// Manual cleanup endpoint for administrators
router.delete('/cleanup', (req, res) => {
  try {
    // Use local uploads directory
    const uploadDir = process.env.FUNCTION_TARGET 
      ? '/tmp' 
      : path.join(__dirname, '..', 'config', 'uploads');
    
    if (!fs.existsSync(uploadDir)) {
      return res.json({ 
        success: true, 
        message: 'Upload directory does not exist, nothing to clean up',
        deletedFiles: []
      });
    }
    
    const files = fs.readdirSync(uploadDir);
    const deletedFiles = [];
    let errorCount = 0;
    
    files.forEach(file => {
      const filePath = path.join(uploadDir, file);
      try {
        // Only delete files, not directories
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          fs.unlinkSync(filePath);
          deletedFiles.push(file);
          console.log('[SERVER /cleanup] Deleted file:', filePath);
        }
      } catch (error) {
        console.error('[SERVER /cleanup] Failed to delete file:', filePath, error.message);
        errorCount++;
      }
    });
    
    return res.json({
      success: true,
      message: `Cleanup completed. Deleted ${deletedFiles.length} files${errorCount > 0 ? ` with ${errorCount} errors` : ''}`,
      deletedFiles: deletedFiles,
      errorCount: errorCount
    });
  } catch (error) {
    console.error('[SERVER /cleanup] Cleanup error:', error.message);
    return res.status(500).json({ 
      error: 'Failed to perform cleanup', 
      details: error.message 
    });
  }
});

// Add this helper function to map .mobileconfig data to your schema
function mapMobileConfigToYaml(parsedPlist) {
  const mappedData = {
    "passpoint-properties": {
      "username": {
        type: 'string',
        description: 'User identifier',
        value: ''
      },
      "password": {
        type: 'string', 
        description: 'User password',
        value: ''
      },
      "eap-method": {
        type: 'string',
        description: 'EAP authentication method',
        value: ''
      },
      "realm": {
        type: 'string',
        description: 'Authentication realm', 
        value: ''
      }
    },
    "home-friendly-name": '',
    "home-domain": '',
    "home-ois": [],
    "roaming-consortiums": [],
    "other-home-partner-fqdns": [],
    "preferred-roaming-partners": []
  };

  // Find Wi-Fi payload in the plist
  const wifiPayload = parsedPlist.PayloadContent?.find(payload => 
    payload.PayloadType === 'com.apple.wifi.managed'
  );

  if (wifiPayload) {
    // Map basic fields
    mappedData["home-friendly-name"] = wifiPayload.SSID_STR || '';
    mappedData["home-domain"] = wifiPayload.DomainName || '';

    // Map EAP configuration
    const eapConfig = wifiPayload.EAPClientConfiguration;
    if (eapConfig) {
      mappedData["passpoint-properties"].username.value = eapConfig.UserName || '';
      mappedData["passpoint-properties"].realm.value = eapConfig.UserName?.split('@')[1] || '';
      
      // Map EAP method
      if (eapConfig.AcceptEAPTypes && eapConfig.AcceptEAPTypes.length > 0) {
        const eapType = eapConfig.AcceptEAPTypes[0];
        const eapTypes = {
          13: 'TLS',
          18: 'SIM', 
          21: 'TTLS',
          23: 'AKA',
          50: "AKA'"
        };
        mappedData["passpoint-properties"]["eap-method"].value = eapTypes[eapType] || eapType.toString();
      }
    }

    // Map roaming consortium OIs
    if (wifiPayload.RoamingConsortiumOIs) {
      mappedData["roaming-consortiums"] = Array.isArray(wifiPayload.RoamingConsortiumOIs) 
        ? wifiPayload.RoamingConsortiumOIs 
        : [wifiPayload.RoamingConsortiumOIs];
    }

    // Map home OIs
    if (wifiPayload.HomeOIs) {
      const ois = Array.isArray(wifiPayload.HomeOIs) ? wifiPayload.HomeOIs : [wifiPayload.HomeOIs];
      mappedData["home-ois"] = ois.map(oi => ({
        name: oi.Name || 'HomeOI',
        length: '5 Hex',
        'home-oi': oi.Value || ''
      }));
    }
  }

  return mappedData;
}

// Function to create a comprehensive YAML representation that preserves all data
function createComprehensiveYaml(parsedPlist) {
  try {
    // Simply return the complete parsed data with minimal reorganization 
    // to preserve ALL original information
    const comprehensive = {
      metadata: {
        source: 'mobileconfig',
        payloadDisplayName: parsedPlist.PayloadDisplayName,
        payloadIdentifier: parsedPlist.PayloadIdentifier,
        payloadUUID: parsedPlist.PayloadUUID,
        payloadVersion: parsedPlist.PayloadVersion,
        payloadType: parsedPlist.PayloadType,
        durationUntilRemoval: parsedPlist.DurationUntilRemoval,
        payloadRemovalDisallowed: parsedPlist.PayloadRemovalDisallowed
      },
      // Include the complete original payload content
      payloadContent: parsedPlist.PayloadContent || [],
      // Include any top-level fields not captured in metadata
      additionalTopLevelFields: {}
    };

    // Capture any additional top-level fields
    Object.keys(parsedPlist).forEach(key => {
      if (!['PayloadDisplayName', 'PayloadIdentifier', 'PayloadUUID', 'PayloadVersion',
            'PayloadType', 'DurationUntilRemoval', 'PayloadRemovalDisallowed', 'PayloadContent'].includes(key)) {
        comprehensive.additionalTopLevelFields[key] = parsedPlist[key];
      }
    });

    return comprehensive;
  } catch (error) {
    console.error('[SERVER /convert] Error in createComprehensiveYaml:', error);
    // Return the raw data if processing fails
    return parsedPlist;
  }
}

module.exports = router;

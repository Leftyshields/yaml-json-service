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
const AdmZip = require('adm-zip');
const crypto = require('crypto');

// Password obfuscation utility function
function obfuscatePasswords(obj, level = 'mask') {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Define sensitive field patterns (case-insensitive)
  const sensitiveFields = [
    /password/i,
    /passwd/i,
    /pwd/i,
    /secret/i,
    /key/i,
    /token/i,
    /credential/i,
    /passphrase/i,
    /pin/i,
    /code/i
  ];

  function processValue(value, fieldName = '') {
    // Check if this field should be obfuscated
    const isSensitive = sensitiveFields.some(pattern => pattern.test(fieldName));
    
    if (!isSensitive || typeof value !== 'string' || !value) {
      return value;
    }

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

  function processObject(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => processObject(item));
    }
    
    if (obj && typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
          result[key] = processObject(value);
        } else {
          result[key] = processValue(value, key);
        }
      }
      return result;
    }
    
    return obj;
  }

  return processObject(obj);
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
    const uploadDir = path.join(__dirname, '../config/uploads');
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
      '.docx', '.doc', '.vsd', '.txt', '.json', '.conf', '.cfg',
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
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc
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


// Add new route for file uploads
router.post('/upload', upload.single('yamlFile'), (req, res) => {
  try {
    console.log('[SERVER /upload] Upload request received');
    
    if (!req.file) {
      console.log('[SERVER /upload] No file in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    console.log('[SERVER /upload] File received:', req.file.originalname, 'Path:', req.file.path);
    // We need to give the frontend a path it can send back to /convert,
    // relative to where /convert will look for it (e.g., within 'src/config/uploads')
    // The current `filePath` from frontend is good if it's relative to `src` dir.
    // Let's ensure the path sent back is what /convert expects.
    // The `req.file.path` is absolute. We need a relative path for the /convert payload.
    // The `uploads` folder is `src/config/uploads`.
    // So, if req.file.path is /home/brian/.../src/config/uploads/filename.ext
    // we want to send back 'config/uploads/filename.ext' or just 'filename.ext'
    // if /convert will prepend 'config/uploads'
    
    // For simplicity, let's assume /convert will look inside 'src/config/uploads/'
    // So we just need the filename.
    const fileNameOnly = req.file.filename; // multer already gives a unique filename
    console.log('[SERVER /upload] Sending back fileNameOnly for /convert:', fileNameOnly);
    
    return res.status(200).json({ 
      success: true, 
      message: 'File uploaded successfully',
      // filePath: relativePath, // This was complex, let's simplify
      filePath: fileNameOnly, // Send just the filename stored in uploads
      fileName: req.file.originalname // Original filename for display
    });
  } catch (error) {
    console.error('[SERVER /upload] Upload error:', error);
    return res.status(500).json({ error: error.message });
  }
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
    const uploadDir = path.join(__dirname, '..', 'config', 'uploads');
    
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
    
    fullPath = path.join(__dirname, '..', 'config', 'uploads', path.basename(filePath));
    console.log('[SERVER /convert-raw] Attempting to access file at fullPath:', fullPath);

    if (!fs.existsSync(fullPath)) {
      console.error('[SERVER /convert-raw] File not found at fullPath:', fullPath);
      return res.status(404).json({ error: `File not found on server: ${filePath}` });
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
    // Always cleanup the uploaded file, even if there was an error
    if (fullPath) {
      cleanupUploadedFile(fullPath);
    }
  }
});

// Update the convert route to handle mobileconfig and XML files
router.post('/convert', async (req, res) => {
  console.log('[SERVER /convert] --- /convert route hit ---');
  console.log('[SERVER /convert] Request body:', req.body);

  const { filePath, obfuscationLevel = 'none' } = req.body; // Accept obfuscation level
  let fullPath = null;

  try {
    if (!filePath) {
      console.error('[SERVER /convert] No filePath provided in request body');
      return res.status(400).json({ error: 'No file path provided' });
    }
    
    console.log('[SERVER /convert] Obfuscation level requested:', obfuscationLevel);
    
    // Construct the full path to the file in the uploads directory
    fullPath = path.join(__dirname, '..', 'config', 'uploads', path.basename(filePath)); // Ensure only filename is used
    console.log('[SERVER /convert] Attempting to access file at fullPath:', fullPath);

    if (!fs.existsSync(fullPath)) {
      console.error('[SERVER /convert] File not found at fullPath:', fullPath);
      return res.status(404).json({ error: `File not found on server: ${filePath}` });
    }
    
    const fileExtension = path.extname(fullPath).toLowerCase();
    console.log('[SERVER /convert] File extension determined as:', fileExtension);
    
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
        
        // Apply obfuscation if requested
        const processedPlist = obfuscationLevel !== 'none' ? obfuscatePasswords(parsedPlist, obfuscationLevel) : parsedPlist;
        
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
        
        // Return the response with processed data as primary YAML
        return res.json({
          success: true,
          yamlOutput: comprehensiveYamlOutput,         // PRIMARY: Full data (obfuscated if requested)
          comprehensiveYaml: comprehensiveYamlOutput,  // ALSO: Same data for comprehensive tab
          filteredYaml: filteredYamlOutput,            // SECONDARY: Filtered version (also obfuscated)
          jsonOutput: JSON.stringify(processedPlist, null, 2), // JSON format for JSON tab
          originalData: parsedPlist,                   // Keep original unobfuscated for internal use
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
        });
        
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
            // Try parsing as text first
            parsedPlist = plist.parse(xmlString);
          } catch (textError) {
            console.log('[SERVER /convert] Text plist failed, trying binary:', textError.message);
            // If text fails, try binary
            parsedPlist = plist.parse(fileBuffer);
          }
          
          console.log('[SERVER /convert] Parsed plist structure:', JSON.stringify(parsedPlist, null, 2));
          
          // Return full unfiltered plist data as YAML
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
            fileType: 'plist-in-xml',
            mappingInfo: {
              filtered: false,
              note: "Full unfiltered plist data is provided in the 'yamlOutput' field"
            }
          });
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
        
        // Apply obfuscation if requested
        const processedData = obfuscationLevel !== 'none' ? obfuscatePasswords(parsedData, obfuscationLevel) : parsedData;
        
        // Return structured response for XML files
        return res.json({
          success: true,
          fileType: 'xml',
          yamlOutput: yaml.dump(processedData, { indent: 2, lineWidth: 120, noRefs: true }), // Frontend expects yamlOutput
          comprehensiveYaml: yaml.dump(processedData, { indent: 2, lineWidth: 120, noRefs: true }),
          jsonOutput: JSON.stringify(processedData, null, 2), // JSON format for JSON tab
          data: processedData,
          originalData: parsedData, // Keep original unobfuscated
          obfuscationInfo: {
            level: obfuscationLevel,
            applied: obfuscationLevel !== 'none',
            note: obfuscationLevel !== 'none' ? `Passwords obfuscated using '${obfuscationLevel}' method` : 'No obfuscation applied'
          }
        });
        
      } catch (xmlError) {
        console.log('[SERVER /convert] XML parsing failed:', xmlError.message);
        console.log('[SERVER /convert] XML content preview:', xmlString.substring(0, 200));
        
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
          
          return res.json({
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
          });
          
        } catch (plistError) {
          console.log('[SERVER /convert] Plist parsing also failed:', plistError.message);
          
          // Provide more helpful error message with content analysis
          const firstChars = xmlString.substring(0, 100).replace(/[^\x20-\x7E\n\r\t]/g, '?');
          const hasXmlTags = xmlString.includes('<') && xmlString.includes('>');
          const xmlParseErrorShort = xmlError.message.substring(0, 100);
          
          return res.status(400).json({ 
            error: `Unable to parse XML file. XML parsing error: ${xmlParseErrorShort}. File preview: "${firstChars}..."`,
            details: {
              fileSize: xmlString.length,
              hasXmlTags: hasXmlTags,
              xmlError: xmlError.message,
              plistError: plistError.message,
              suggestion: hasXmlTags ? 
                "The file contains XML tags but has parsing errors. Check for malformed XML syntax." :
                "The file doesn't appear to contain standard XML structure."
            }
          });
        }
      }

    } else if (fileExtension === '.yml' || fileExtension === '.yaml') {
      console.log('[SERVER /convert] --- Processing .yml/.yaml file (converting to JSON) ---');
      const yamlContent = fs.readFileSync(fullPath, 'utf8');
      const jsonData = yaml.load(yamlContent);
      console.log('[SERVER /convert] YAML to JSON conversion successful.');
      
      return res.json({
        success: true,
        fileType: 'yaml',
        yamlOutput: yamlContent,                     // Original YAML content
        comprehensiveYaml: yamlContent,              // Same data for comprehensive tab
        jsonOutput: JSON.stringify(jsonData, null, 2), // Converted JSON for JSON tab
        data: jsonData,
        originalData: yamlContent
      });

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
          
          return res.json({
            success: true,
            yamlOutput: yamlContent,
            jsonOutput: jsonContent,
            originalData: fileContent,
            comprehensiveYaml: yamlContent,
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
          
          return res.json({
            success: true,
            yamlOutput: yamlContent,
            jsonOutput: jsonContent,
            originalData: fileContent,
            comprehensiveYaml: yamlContent,
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

    } else if (fileExtension === '.docx') {
      console.log('[SERVER /convert] --- Processing .docx file ---');
      
      try {
        const fileBuffer = fs.readFileSync(fullPath);
        console.log('[SERVER /convert] .docx file read, length:', fileBuffer.length);
        
        // .docx files are ZIP archives
        const zip = new AdmZip(fileBuffer);
        const zipEntries = zip.getEntries();
        
        console.log('[SERVER /convert] DOCX contains', zipEntries.length, 'files');
        
        // Look for the main document content
        const documentXml = zip.readAsText('word/document.xml');
        
        if (documentXml) {
          // Try to extract network/configuration data from the document
          const configMatches = documentXml.match(/<w:t[^>]*>([^<]*(?:SSID|EAP|WiFi|Network|Certificate|Password|Config)[^<]*)<\/w:t>/gi);
          
          const extractedData = {
            documentType: 'docx',
            extractedNetworkConfig: [],
            fullDocumentXml: documentXml
          };
          
          if (configMatches) {
            configMatches.forEach(match => {
              const textContent = match.replace(/<[^>]*>/g, '');
              extractedData.extractedNetworkConfig.push(textContent);
            });
          }
          
          return res.json({
            success: true,
            fileType: 'docx',
            yamlOutput: yaml.dump(extractedData, { indent: 2, lineWidth: 120, noRefs: true }), // Frontend expects yamlOutput
            comprehensiveYaml: yaml.dump(extractedData, { indent: 2, lineWidth: 120, noRefs: true }),
            jsonOutput: JSON.stringify(extractedData, null, 2), // JSON format for JSON tab
            data: extractedData,
            originalData: 'DOCX document processed'
          });
        } else {
          throw new Error('Could not find document.xml in DOCX file');
        }
      } catch (error) {
        console.log('[SERVER /convert] .docx processing failed:', error.message);
        throw error;
      }

    } else if (fileExtension === '.txt' || fileExtension === '.conf' || fileExtension === '.cfg') {
      console.log('[SERVER /convert] --- Processing text configuration file ---');
      
      try {
        const fileContent = fs.readFileSync(fullPath, 'utf8');
        console.log('[SERVER /convert] Text file content read, length:', fileContent.length);
        
        // Parse as configuration file
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
        
        return res.json({
          success: true,
          fileType: fileExtension.replace('.', ''),
          yamlOutput: yaml.dump(configData, { indent: 2, lineWidth: 120, noRefs: true }), // Frontend expects yamlOutput
          comprehensiveYaml: yaml.dump(configData, { indent: 2, lineWidth: 120, noRefs: true }),
          jsonOutput: JSON.stringify(configData, null, 2), // JSON format for JSON tab
          data: configData,
          originalData: fileContent
        });
      } catch (error) {
        console.log('[SERVER /convert] Text file processing failed:', error.message);
        throw error;
      }

    } else if (fileExtension === '.json') {
      console.log('[SERVER /convert] --- Processing .json file ---');
      
      try {
        const fileContent = fs.readFileSync(fullPath, 'utf8');
        const jsonData = JSON.parse(fileContent);
        
        return res.json({
          success: true,
          fileType: 'json',
          yamlOutput: yaml.dump(jsonData, { indent: 2, lineWidth: 120, noRefs: true }), // Frontend expects yamlOutput
          comprehensiveYaml: yaml.dump(jsonData, { indent: 2, lineWidth: 120, noRefs: true }),
          jsonOutput: JSON.stringify(jsonData, null, 2), // JSON format for JSON tab
          data: jsonData,
          originalData: jsonData
        });
      } catch (error) {
        console.log('[SERVER /convert] JSON processing failed:', error.message);
        throw error;
      }

    } else {
      console.log('[SERVER /convert] --- Processing unknown/generic file type ---', fileExtension);
      
      try {
        const fileBuffer = fs.readFileSync(fullPath);
        console.log('[SERVER /convert] Unknown file data read, length:', fileBuffer.length);
        
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
          
          return res.json({
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
          });
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
          
          return res.json({
            success: true,
            fileType: 'unknown-binary-analysis',
            yamlOutput: errorYaml,                   // Frontend expects yamlOutput
            comprehensiveYaml: errorYaml,            // Same data for comprehensive tab
            jsonOutput: JSON.stringify(analysisData, null, 2), // JSON format for JSON tab
            data: analysisData,
            originalData: fileBuffer.toString('utf8', 0, Math.min(fileBuffer.length, 10000))
          });
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
    // Always cleanup the uploaded file, even if there was an error
    if (fullPath) {
      cleanupUploadedFile(fullPath);
    }
  }
});

// Manual cleanup endpoint for administrators
router.delete('/cleanup', (req, res) => {
  try {
    const uploadDir = path.join(__dirname, '..', 'config', 'uploads');
    
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

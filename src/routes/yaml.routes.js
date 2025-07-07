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

// Create upload middleware
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.yml', '.yaml', '.mobileconfig', '.xml']; // Add .xml
    const allowedMimeTypes = [
      'text/yaml',
      'application/x-yaml',
      'text/plain',
      'application/octet-stream',
      'application/x-apple-aspen-config',
      'application/pkcs7-mime',
      'application/xml', // Add XML MIME type
      'text/xml' // Add XML MIME type
    ];
    const fileExtension = path.extname(file.originalname).toLowerCase();

    if (allowedExtensions.includes(fileExtension) || allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type. Allowed extensions: ${allowedExtensions.join(', ')}. Received extension: ${fileExtension}, MIME type: ${file.mimetype}`));
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

// Update the convert route to handle mobileconfig and XML files
router.post('/convert', async (req, res) => {
  console.log('[SERVER /convert] --- /convert route hit ---');
  console.log('[SERVER /convert] Request body:', req.body);

  try {
    const { filePath } = req.body; // This should now be just the filename, e.g., "17xxxx-dev.cg.mobileconfig"
    
    if (!filePath) {
      console.error('[SERVER /convert] No filePath provided in request body');
      return res.status(400).json({ error: 'No file path provided' });
    }
    
    // Construct the full path to the file in the uploads directory
    const fullPath = path.join(__dirname, '..', 'config', 'uploads', path.basename(filePath)); // Ensure only filename is used
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
        
        // Map the plist data to your YAML schema
        const mappedData = mapMobileConfigToYaml(parsedPlist);
        
        // Convert to YAML
        const yamlOutput = yaml.dump(mappedData, {
          indent: 2,
          lineWidth: 120,
          noRefs: true,
        });
        
        console.log('[SERVER /convert] YAML dump successful. Output length:', yamlOutput.length);
        
        // Return the response and exit the function - THIS IS KEY
        return res.json({
          success: true,
          yaml: yamlOutput,
          originalData: parsedPlist
        });
        
      } catch (error) {
        console.log('[SERVER /convert] .mobileconfig processing failed:', error.message);
        throw error;
      }
    } else if (fileExtension === '.xml') {
      console.log('[SERVER /convert] --- Processing .xml file ---');
      const xmlString = fs.readFileSync(fullPath, 'utf8');
      const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
      parsedData = await parser.parseStringPromise(xmlString);
      console.log('[SERVER /convert] .xml file parsed successfully.');
      fileTypeForMapping = 'xml';

    } else if (fileExtension === '.yml' || fileExtension === '.yaml') {
      console.log('[SERVER /convert] --- Processing .yml/.yaml file (converting to JSON) ---');
      const yamlContent = fs.readFileSync(fullPath, 'utf8');
      const jsonData = yaml.load(yamlContent);
      console.log('[SERVER /convert] YAML to JSON conversion successful.');
      return res.json(jsonData);

    } else {
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

module.exports = router;

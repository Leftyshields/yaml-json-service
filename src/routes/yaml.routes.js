// src/routes/yaml.routes.js

const express = require('express');
const router = express.Router();
const yamlService = require('../services/yaml.service');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const yaml = require('js-yaml'); // Add this import

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
    // Check file extension instead of relying only on MIME type
    if (file.originalname.toLowerCase().endsWith('.yml') || 
        file.originalname.toLowerCase().endsWith('.yaml') ||
        file.mimetype === 'text/yaml' || 
        file.mimetype === 'application/x-yaml' ||
        file.mimetype === 'text/plain' ||  // Many systems send YAML as text/plain
        file.mimetype === 'application/octet-stream') {  // Generic binary type
      cb(null, true);
    } else {
      cb(new Error(`Only YAML files are allowed. Received: ${file.mimetype}`));
    }
  }
});

// Add new route for file uploads
router.post('/upload', upload.single('yamlFile'), (req, res) => {
  try {
    console.log('Upload request received');
    
    if (!req.file) {
      console.log('No file in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    console.log('File received:', req.file);
    
    // Get absolute path for debugging
    const absolutePath = req.file.path;
    console.log('Absolute file path:', absolutePath);
    
    // Calculate relative path more reliably
    const relativePath = path.relative(
      path.join(__dirname, '..'),
      req.file.path
    ).replace(/\\/g, '/'); // Normalize slashes for cross-platform
    
    console.log('Calculated relative path:', relativePath);
    
    return res.status(200).json({ 
      success: true, 
      message: 'File uploaded successfully',
      filePath: relativePath,
      fileName: req.file.originalname
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Fix the path resolution for uploaded files
router.post('/convert', async (req, res) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'No file path provided' });
    }
    
    console.log('Converting file:', filePath);
    
    // Extract the base filename from the path
    const basename = path.basename(filePath);
    console.log('Basename:', basename);
    
    // Try multiple possible locations for the file
    const possiblePaths = [
      path.join(__dirname, '..', filePath), // Relative to src
      path.join(__dirname, '..', 'config', 'uploads', basename), // Direct to uploads folder
      path.join(process.cwd(), 'src', filePath), // From project root
      path.join(process.cwd(), 'src', 'config', 'uploads', basename), // Absolute path
      path.join(__dirname, '..', 'config', 'uploads', filePath.split('/').pop()) // Just the filename
    ];
    
    let fullPath = null;
    let fileFound = false;
    
    // Try each possible path until we find the file
    for (const testPath of possiblePaths) {
      console.log('Testing path:', testPath);
      if (fs.existsSync(testPath)) {
        console.log('File found at:', testPath);
        fullPath = testPath;
        fileFound = true;
        break;
      }
    }
    
    if (!fileFound) {
      console.error('File not found in any of the tested locations');
      return res.status(404).json({ error: `File not found: ${filePath}` });
    }
    
    // Read and parse the YAML file
    const yamlContent = fs.readFileSync(fullPath, 'utf8');
    console.log('YAML content length:', yamlContent.length);
    
    const jsonData = yaml.load(yamlContent);
    console.log('JSON data parsed successfully');
    
    return res.json(jsonData);
  } catch (error) {
    console.error('Error converting YAML file:', error);
    return res.status(500).json({ error: error.message || 'Failed to convert YAML file' });
  }
});

module.exports = router;

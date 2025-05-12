// src/routes/yaml.routes.js

const express = require('express');
const router = express.Router();
const yamlService = require('../services/yaml.service');
const fs = require('fs');
const path = require('path');

// Existing POST /convert route
router.post('/convert', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const jsonData = await yamlService.parseYamlFile(filePath);
    res.json(jsonData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

module.exports = router;

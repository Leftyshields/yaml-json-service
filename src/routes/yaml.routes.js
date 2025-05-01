const express = require('express');
const router = express.Router();
const yamlService = require('../services/yaml.service');

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

module.exports = router;
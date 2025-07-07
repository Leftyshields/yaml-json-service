const yaml = require('js-yaml');
const fs = require('fs').promises;
const path = require('path');

class YamlService {
  async parseYamlFile(filePath) {
    try {
      const fileContents = await fs.readFile(filePath, 'utf8');
      const data = yaml.load(fileContents);
      return data;
    } catch (error) {
      throw new Error(`Error parsing YAML file: ${error.message}`);
    }
  }
}

// Modify the existing function that handles file paths to support uploaded files
const convertYamlToJson = async (filePath) => {
  try {
    // Check if the path is from uploads directory
    const fullPath = filePath.startsWith('config/uploads/') 
      ? path.join(__dirname, '..', filePath)
      : path.join(__dirname, '..', 'config', filePath);
    
    // Continue with existing logic...
    // ...existing code...
  } catch (error) {
    // ...existing code...
  }
};

module.exports = new YamlService();
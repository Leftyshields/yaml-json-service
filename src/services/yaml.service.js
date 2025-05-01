const yaml = require('js-yaml');
const fs = require('fs').promises;

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

module.exports = new YamlService();
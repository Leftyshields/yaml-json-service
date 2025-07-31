/**
 * Helper functions for handling binary data in JSON and YAML
 */

/**
 * Custom JSON replacer function to handle Buffer objects
 * @param {string} key The current key being processed
 * @param {any} value The value for the current key
 * @returns {any} The processed value
 */
function bufferJsonReplacer(key, value) {
  // Convert Buffer objects to base64 strings
  if (Buffer.isBuffer(value)) {
    return `base64:${value.toString('base64')}`;
  }
  
  // Handle object with Buffer type and data property (Node.js serialized Buffer)
  if (value && typeof value === 'object' && 
      value.type === 'Buffer' && 
      Array.isArray(value.data)) {
    return `base64:${Buffer.from(value.data).toString('base64')}`;
  }
  
  // For PayloadContent in certificates which often contains binary data
  if (key === 'PayloadContent' && 
      value && typeof value === 'object' && 
      !Array.isArray(value) && 
      Object.keys(value).length === 0) {
    return '[BINARY DATA]';
  }
  
  return value;
}

/**
 * Process an object to properly handle binary data for serialization
 * @param {object} obj The object to process
 * @returns {object} The processed object with binary data converted
 */
function processBinaryData(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  // Create a deep clone to avoid modifying the original
  const processed = JSON.parse(JSON.stringify(obj, bufferJsonReplacer));
  
  // Additional recursive processing for any missed binary data
  function deepProcess(object) {
    if (!object || typeof object !== 'object') {
      return object;
    }
    
    if (Array.isArray(object)) {
      return object.map(item => deepProcess(item));
    }
    
    for (const key in object) {
      const value = object[key];
      
      // Process Buffer objects that may have been missed
      if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
        object[key] = `base64:${Buffer.from(value.data).toString('base64')}`;
      } 
      // Recursively process nested objects
      else if (value && typeof value === 'object') {
        object[key] = deepProcess(value);
      }
    }
    
    return object;
  }
  
  return deepProcess(processed);
}

module.exports = {
  bufferJsonReplacer,
  processBinaryData
};

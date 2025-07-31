/**
 * Certificate handling service
 * Provides utilities for certificate detection, obfuscation, and transformation
 */
const crypto = require('crypto');
const fs = require('fs').promises;

class CertificateService {
  /**
   * Detect if a string is likely to be a certificate
   * @param {string} value The string to check
   * @returns {boolean} True if the string appears to be a certificate
   */
  isCertificateData(value) {
    if (typeof value !== 'string') return false;
    
    // Common certificate markers
    const certMarkers = [
      '-----BEGIN CERTIFICATE-----',
      '-----BEGIN PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY-----',
      '-----BEGIN PUBLIC KEY-----',
      '-----BEGIN X509 CERTIFICATE-----',
      '-----BEGIN TRUSTED CERTIFICATE-----'
    ];
    
    // Check for PEM format first
    if (certMarkers.some(marker => value.includes(marker))) {
      return true;
    }
    
    // Check for base64 encoded X.509 certificate
    // X.509 certificates in base64 typically start with MII (when base64 decoded starts with 0x30 0x82)
    const cleanValue = value.replace(/\s/g, ''); // Remove whitespace
    const isBase64X509 = 
      cleanValue.length > 100 && 
      /^[A-Za-z0-9+/=]+$/.test(cleanValue) &&
      (cleanValue.startsWith('MII') || cleanValue.startsWith('MIIB') || cleanValue.startsWith('MIIC') || cleanValue.startsWith('MIID'));
      
    return isBase64X509;
  }
  
  /**
   * Handle certificate data with various options
   * @param {string} value Certificate data
   * @param {string} mode The transformation mode: 'obfuscate', 'hash', 'truncate', 'info'
   * @returns {object} The transformed certificate data and metadata
   */
  processCertificate(value, mode = 'obfuscate') {
    if (!this.isCertificateData(value)) {
      return { value, metadata: null };
    }
    
    // Extract certificate info if possible
    let metadata = this.extractCertInfo(value);
    
    // Transform based on mode
    switch (mode) {
      case 'obfuscate':
        // Replace with placeholder that indicates cert was present
        return { 
          value: '[CERTIFICATE DATA REDACTED]', 
          metadata 
        };
        
      case 'hash':
        // Create a hash of the certificate for reference
        const hash = crypto.createHash('sha256').update(value).digest('hex');
        return { 
          value: `cert:sha256:${hash.substring(0, 16)}...`, 
          metadata 
        };
        
      case 'truncate':
        // Keep just the beginning and end
        const beginMatch = value.match(/(-----BEGIN[^-]+-----)/);
        const endMatch = value.match(/(-----END[^-]+-----)/);
        const beginning = beginMatch ? beginMatch[0] : '';
        const ending = endMatch ? endMatch[0] : '';
        
        return { 
          value: `${beginning}...${ending}`, 
          metadata 
        };
        
      case 'info':
        // Return just the metadata, replace value with indicator
        return { 
          value: metadata ? `[CERTIFICATE: ${metadata.subject || 'Unknown'}]` : '[CERTIFICATE]', 
          metadata 
        };
        
      case 'preserve':
      default:
        // Keep the original value
        return { value, metadata };
    }
  }
  
  /**
   * Extract basic information from a certificate if possible
   * @param {string} certData Certificate data
   * @returns {object|null} Certificate metadata or null if can't be parsed
   */
  extractCertInfo(certData) {
    try {
      let certBuffer;
      
      // Handle different certificate formats
      if (certData.includes('-----BEGIN')) {
        // PEM format - extract the base64 content
        const base64Match = certData.match(/-----BEGIN[^-]+-----\s*([\s\S]*?)\s*-----END[^-]+-----/);
        if (base64Match) {
          certBuffer = Buffer.from(base64Match[1].replace(/\s/g, ''), 'base64');
        }
      } else {
        // Assume it's raw base64
        const cleanBase64 = certData.replace(/\s/g, '');
        if (/^[A-Za-z0-9+/=]+$/.test(cleanBase64)) {
          certBuffer = Buffer.from(cleanBase64, 'base64');
        }
      }
      
      if (!certBuffer) {
        return {
          subject: 'Could not parse certificate',
          issuer: 'Unknown',
          validFrom: 'Unknown',
          validTo: 'Unknown',
          fingerprint: 'Unknown',
          size: certData.length
        };
      }
      
      // Try to parse as X.509 certificate using Node.js crypto
      try {
        const cert = crypto.X509Certificate ? new crypto.X509Certificate(certBuffer) : null;
        
        if (cert) {
          return {
            subject: cert.subject || 'Unknown',
            issuer: cert.issuer || 'Unknown', 
            validFrom: cert.validFrom || 'Unknown',
            validTo: cert.validTo || 'Unknown',
            fingerprint: cert.fingerprint || cert.fingerprint256 || 'Unknown',
            serialNumber: cert.serialNumber || 'Unknown',
            size: certData.length
          };
        }
      } catch (x509Error) {
        console.log('X509 parsing failed, trying basic extraction:', x509Error.message);
      }
      
      // Fallback to basic string parsing for older Node versions or parsing errors
      const certString = certBuffer.toString('utf8');
      const subject = certString.match(/CN=([^,/\n]+)/) || certData.match(/CN=([^,/\n]+)/);
      const issuer = certString.match(/O=([^,/\n]+)/) || certData.match(/O=([^,/\n]+)/);
      const notAfter = certString.match(/Not After:\s*([^\n]+)/) || certData.match(/Not After:\s*([^\n]+)/);
      
      return {
        subject: subject ? subject[1] : 'X.509 Certificate (parsed from base64)',
        issuer: issuer ? issuer[1] : 'Unknown',
        validFrom: 'Unknown',
        validTo: notAfter ? notAfter[1] : 'Unknown',
        fingerprint: crypto.createHash('sha256').update(certBuffer).digest('hex').substring(0, 16) + '...',
        size: certData.length,
        format: certData.includes('-----BEGIN') ? 'PEM' : 'Base64'
      };
      
    } catch (err) {
      console.error('Error extracting certificate info:', err);
      return {
        subject: 'Certificate (parsing error)',
        issuer: 'Unknown',
        validFrom: 'Unknown', 
        validTo: 'Unknown',
        fingerprint: 'Unknown',
        size: certData.length,
        error: err.message
      };
    }
  }
  
  /**
   * Process an object recursively to handle certificates
   * @param {object} obj The object to process
   * @param {string} mode The transformation mode
   * @returns {object} The processed object
   */
  processCertificatesInObject(obj, mode = 'obfuscate') {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    
    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => this.processCertificatesInObject(item, mode));
    }
    
    // Process object properties
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      // Check if the property might contain a certificate
      // Enhanced to catch EAP config certificate patterns
      const isCertProperty = /cert|certificate|cred|key|trust|ca|root|identity|authority/i.test(key) ||
                            key === '_' || // Common in XML/EAP configs where base64 data is stored in _
                            key === 'value' || // Sometimes certificate data is in a value field
                            key === 'data';   // Or in a data field
      
      if (typeof value === 'string' && this.isCertificateData(value)) {
        // Process the certificate
        const processed = this.processCertificate(value, mode);
        result[key] = processed.value;
        
        // Add metadata as a separate property if available
        if (processed.metadata) {
          result[`${key}_certificate_info`] = processed.metadata;
        }
      } else if (typeof value === 'object' && value !== null) {
        // Recursively process nested objects
        result[key] = this.processCertificatesInObject(value, mode);
      } else {
        // Keep other properties as is
        result[key] = value;
      }
    }
    
    return result;
  }
}

module.exports = new CertificateService();

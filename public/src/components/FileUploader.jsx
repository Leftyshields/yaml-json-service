import { useState } from 'react';

const FileUploader = ({ onFileUploaded }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setError(null);
    setSuccess(false);
  };

  // Improve error handling
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a file');
      return;
    }

    const formData = new FormData();
    formData.append('yamlFile', file);
    
    // Log what's being sent
    console.log('File being uploaded:', file.name);
    console.log('File type:', file.type);
    console.log('File size:', file.size);
    
    setUploading(true);
    setError(null);

    try {
      // Be more explicit with the request
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        // Important: Let browser set the Content-Type with boundary parameter
      });

      console.log('Response status:', response.status);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Upload endpoint not found. Check server routes.');
        }
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(errorText || `Upload failed with status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('Response data:', result);
      
      setSuccess(true);
      
      if (onFileUploaded) {
        onFileUploaded(result.filePath, result.fileName);
      }
    } catch (err) {
      console.error('Upload error details:', err);
      setError(err.message || 'Error uploading file');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="file-uploader">
      <h3>Upload Configuration File</h3>
      <div className="file-info">
        <p><strong>Supported File Types:</strong></p>
        <ul>
          <li><code>.mobileconfig</code> - Apple mobile configuration profiles</li>
          <li><code>.xml</code> - XML configuration files</li>
          <li><code>.eap-config</code> - EAP configuration files</li>
          <li><code>.yml/.yaml</code> - YAML configuration files</li>
          <li><code>.json</code> - JSON configuration files</li>
          <li><code>.txt/.conf/.cfg</code> - Text-based configuration files</li>
          <li><code>.docx/.doc</code> - Word documents with embedded configurations</li>
        </ul>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <input
            type="file"
            accept="*/*,.eap-config,.xml,.mobileconfig,.yml,.yaml,.txt,.json,.docx,.doc,.conf,.cfg,.pem,.crt,.cer,.ovpn,.profile,application/xml,text/xml,text/plain,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileChange}
            className="file-input"
          />
        </div>
        
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">File uploaded successfully!</div>}
        
        <button 
          type="submit" 
          disabled={!file || uploading} 
          className="upload-button"
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </form>
    </div>
  );
};

export default FileUploader;
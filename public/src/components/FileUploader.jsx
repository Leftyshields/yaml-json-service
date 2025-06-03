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
      const response = await fetch('http://sandbox-mac-mini:6001/api/upload', {
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
      <h3>Upload YAML File</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <input
            type="file"
            accept=".yml,.yaml"
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
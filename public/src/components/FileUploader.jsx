import { useState, useEffect } from 'react';

const FileUploader = ({ onFileUploaded }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileSize, setFileSize] = useState(null);

  // Format file size for display
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setFileSize(selectedFile ? formatFileSize(selectedFile.size) : null);
    setError(null);
    setSuccess(false);
    setUploadProgress(0);
  };

  // Improve error handling
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a file');
      return;
    }

    // Check file size - Multer on server has 5MB limit
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_FILE_SIZE) {
      setError(`File is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Please select a file smaller than 5MB.`);
      return;
    }

    // Create a fresh FormData instance
    const formData = new FormData();
    
    // Ensure file has proper name and extension
    const fileName = file.name || 'uploaded-file';
    
    // Add the file to the FormData with the proper field name that the server expects
    formData.append('yamlFile', file, fileName);
    
    // Log what's being sent
    console.log('File being uploaded:', file.name);
    console.log('File type:', file.type);
    console.log('File size:', file.size);
    
    setUploading(true);
    setError(null);
    setUploadProgress(0);

    // Use XMLHttpRequest for progress tracking
    const xhr = new XMLHttpRequest();
    
    // Set up promise to handle XHR
    const uploadPromise = new Promise((resolve, reject) => {
      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          console.log(`Upload progress: ${percentComplete}%`);
          setUploadProgress(percentComplete);
        }
      });
      
      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (e) {
            reject(new Error('Invalid response format'));
          }
        } else {
          let errorMessage = 'Upload failed';
          try {
            const errorResponse = JSON.parse(xhr.responseText);
            errorMessage = errorResponse.error || errorMessage;
            
            // Log detailed error info for debugging
            console.error('Server response error:', {
              status: xhr.status,
              statusText: xhr.statusText,
              response: errorResponse
            });
            
          } catch (e) {
            // If we can't parse the JSON, use the raw text
            errorMessage = xhr.responseText || `Upload failed with status: ${xhr.status}`;
            
            // Check for specific Cloud Run error patterns in the raw response
            if (xhr.responseText && xhr.responseText.includes('Unexpected end of form')) {
              errorMessage = 'Upload was interrupted. The file may be too large for Cloud Run processing.';
            }
            
            console.error('Server response error (text):', {
              status: xhr.status, 
              statusText: xhr.statusText,
              responseText: xhr.responseText ? xhr.responseText.substring(0, 500) : 'No response text'
            });
          }
          reject(new Error(errorMessage));
        }
      });
      
      // Track when the upload starts
      xhr.upload.addEventListener('loadstart', () => {
        console.log('Upload started');
      });
      
      // Track when the upload is about to complete
      xhr.upload.addEventListener('loadend', () => {
        console.log('Upload data transfer complete');
      });
      
      // Handle network errors
      xhr.addEventListener('error', (e) => {
        console.error('XHR error event:', e);
        reject(new Error('Network error during upload'));
      });
      
      // Handle timeouts
      xhr.addEventListener('timeout', () => {
        reject(new Error('Upload timed out'));
      });
      
      // Handle aborts
      xhr.addEventListener('abort', () => {
        reject(new Error('Upload was aborted'));
      });
    });
    
    try {
      // Open and send the request with more reliable settings for Cloud Run
      xhr.open('POST', '/api/upload', true);
      xhr.timeout = 30000; // 30 second timeout - shorter for Cloud Run
      
      // Do NOT set Content-Type manually as it will be set correctly with boundary by browser
      // Only set auxiliary headers that help with debugging
      xhr.setRequestHeader('X-Upload-Client', 'FileUploader-React-XHR');
      xhr.setRequestHeader('X-File-Size', file.size.toString());
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      xhr.setRequestHeader('X-File-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('Cache-Control', 'no-cache');
      
      // For Cloud Run, we need to ensure the connection stays alive
      xhr.setRequestHeader('Connection', 'keep-alive');
      
      console.log('Starting upload of file:', file.name, 'size:', fileSize);
      xhr.send(formData);
      
      // Wait for the upload to complete
      const result = await uploadPromise;
      console.log('Response data:', result);
      
      setSuccess(true);
      setUploadProgress(100);
      
      if (onFileUploaded) {
        onFileUploaded(result.filePath, result.fileName);
      }
    } catch (err) {
      console.error('Upload error details:', err);
      // Reset progress
      setUploadProgress(0);
      
      // Handle specific error types
      if (err.message.includes('timeout') || err.message.includes('timed out')) {
        setError('Upload timed out. Please try again with a smaller file or check your connection.');
      } else if (err.message.includes('LIMIT_FILE_SIZE') || err.message.includes('too large')) {
        setError('File is too large. Maximum size is 5MB.');
      } else if (err.message.includes('413') || err.message.includes('Payload Too Large')) {
        setError('File is too large for the server to process. Please try a smaller file.');
      } else if (err.message.includes('500') || err.message.includes('Internal Server Error')) {
        setError('Server error occurred. Please try again later.');
      } else {
        setError(err.message || 'Error uploading file');
      }
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
          {file && (
            <div className="file-details">
              <p>Selected: <strong>{file.name}</strong> ({fileSize})</p>
              {file.size > 5 * 1024 * 1024 && (
                <p className="file-warning">
                  ⚠️ This file exceeds the size limit (5MB)
                </p>
              )}
            </div>
          )}
        </div>
        
        <div className="cloud-info">
          <p><small>Maximum file size: 5MB</small></p>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">File uploaded successfully!</div>}
        
        {uploading && (
          <div className="progress-container">
            <div 
              className="progress-bar" 
              style={{ width: `${uploadProgress}%` }}
            >
              {uploadProgress > 0 && `${uploadProgress}%`}
            </div>
          </div>
        )}
        
        <button 
          type="submit" 
          disabled={!file || uploading || (file && file.size > 5 * 1024 * 1024)} 
          className="upload-button"
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
        {file && file.size > 5 * 1024 * 1024 && (
          <div className="error-message">File too large to upload (max 5MB)</div>
        )}
      </form>
    </div>
  );
};

export default FileUploader;
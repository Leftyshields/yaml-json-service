import React, { useState } from 'react';
import axios from 'axios'; // For making API calls
import {
  Box,
  Button,
  Typography,
  Container,
  Paper,
  TextField,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Divider
} from '@mui/material';
// Removed: yaml, plist, xml2js imports as this logic moves to backend

function PasspointProfileConverter() {
  const [selectedFile, setSelectedFile] = useState(null); // Store the File object for upload
  const [uploadedFileMeta, setUploadedFileMeta] = useState(null); // Store { filePath, fileName } from backend
  const [yamlOutput, setYamlOutput] = useState('');
  const [error, setError] = useState(null);
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingConvert, setLoadingConvert] = useState(false);

  // Function to handle file selection from input
  const handleFileSelection = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setUploadedFileMeta(null); // Reset previous upload info
      setYamlOutput(''); // Reset previous output
      setError(null);
    }
  };

  // Function to upload the selected file to the backend
  const handleFileUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file first.');
      return;
    }

    setLoadingUpload(true);
    setError(null);
    setUploadedFileMeta(null);
    setYamlOutput('');

    const formData = new FormData();
    formData.append('yamlFile', selectedFile); // 'yamlFile' should match multer field name in backend

    try {
      // Assuming your backend API is prefixed with /api
      // Adjust if your backend is on a different port during development (e.g., http://localhost:6001/api/upload)
      const response = await axios.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setUploadedFileMeta({
        filePath: response.data.filePath, // Expecting { success, message, filePath, fileName }
        fileName: response.data.fileName,
      });
      setError(null); // Clear previous errors
    } catch (err) {
      console.error('Error uploading file:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Failed to upload file.';
      setError(errorMsg);
      setUploadedFileMeta(null);
    } finally {
      setLoadingUpload(false);
    }
  };

  // Function to request conversion of the uploaded file from the backend
  const handleFileConvert = async () => {
    if (!uploadedFileMeta || !uploadedFileMeta.filePath) {
      setError('Please upload a file successfully before converting.');
      return;
    }

    setLoadingConvert(true);
    setError(null);
    setYamlOutput('');

    try {
      // Assuming your backend API is prefixed with /api
      const response = await axios.post('/api/convert', {
        filePath: uploadedFileMeta.filePath, // Send the server-side path
      });
      
      console.log('Full response:', response.data); // Debug log
      
      // Check if the response has the success format from .mobileconfig processing
      if (response.data.success && response.data.yaml) {
        setYamlOutput(response.data.yaml);
      } else if (typeof response.data === 'string') {
        // For other file types that return YAML directly
        setYamlOutput(response.data);
      } else {
        // Fallback - convert object to readable format
        setYamlOutput(JSON.stringify(response.data, null, 2));
      }
    } catch (err) {
      console.error('Error converting file:', err);
      const errorMsg = err.response?.data?.error || err.response?.data?.details || err.message || 'Failed to convert file.';
      setError(errorMsg);
    } finally {
      setLoadingConvert(false);
    }
  };
  
  // Function to copy YAML to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(yamlOutput)
      .then(() => alert('Copied to clipboard!'))
      .catch(err => console.error('Could not copy text: ', err));
  };

  // Function to download YAML file
  const downloadYaml = () => {
    const blob = new Blob([yamlOutput], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = uploadedFileMeta?.fileName ? 
                 `${uploadedFileMeta.fileName.split('.')[0]}_converted.yml` : 
                 'passpoint_profile.yml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h4" gutterBottom color="primary">
            Passpoint Profile Converter
          </Typography>
          <Typography variant="body1" paragraph>
            Convert legacy .mobileconfig or .xml files to YAML format compatible with the Passpoint Config Editor.
          </Typography>
          <Divider sx={{ my: 2 }} />

          <Box sx={{ my: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              Step 1: Select Configuration File
            </Typography>
            <input
              type="file"
              accept=".mobileconfig,.xml,.yml,.yaml" // Keep accepting relevant types
              onChange={handleFileSelection}
              style={{ display: 'none' }}
              id="file-input"
            />
            <label htmlFor="file-input">
              <Button variant="contained" component="span">
                Choose File
              </Button>
            </label>
            {selectedFile && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                Selected: <strong>{selectedFile.name}</strong>
              </Typography>
            )}
          </Box>

          {selectedFile && (
            <Box sx={{ my: 3 }}>
              <Typography variant="subtitle1" gutterBottom>
                Step 2: Upload File to Server
              </Typography>
              <Button 
                variant="contained" 
                onClick={handleFileUpload} 
                disabled={loadingUpload || !selectedFile}
                color="secondary"
              >
                {loadingUpload ? <CircularProgress size={24} /> : 'Upload Selected File'}
              </Button>
              {uploadedFileMeta && !loadingUpload && (
                <Typography variant="body2" color="green" sx={{ mt: 1 }}>
                  Successfully uploaded: <strong>{uploadedFileMeta.fileName}</strong>
                </Typography>
              )}
            </Box>
          )}
          
          {uploadedFileMeta && (
             <Box sx={{ my: 3 }}>
              <Typography variant="subtitle1" gutterBottom>
                Step 3: Convert File to YAML
              </Typography>
              <Button 
                variant="contained" 
                onClick={handleFileConvert} 
                disabled={loadingConvert || !uploadedFileMeta}
                color="primary"
              >
                {loadingConvert ? <CircularProgress size={24} /> : `Convert ${uploadedFileMeta.fileName}`}
              </Button>
            </Box>
          )}

        </CardContent>
      </Card>

      {(loadingUpload || loadingConvert) && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
          <Typography sx={{ ml: 2 }}>
            {loadingUpload ? 'Uploading...' : 'Converting...'}
          </Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ my: 2 }}>
          {error}
        </Alert>
      )}

      {yamlOutput && !loadingConvert && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Step 4: Review and Download YAML
            </Typography>
            
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
              <Button onClick={copyToClipboard} sx={{ mr: 1 }}>
                Copy to Clipboard
              </Button>
              <Button variant="contained" onClick={downloadYaml}>
                Download YAML
              </Button>
            </Box>
            
            <Paper 
              variant="outlined" 
              sx={{ 
                p: 2, 
                bgcolor: '#f5f5f5', 
                overflowX: 'auto'
              }}
            >
              <TextField
                multiline
                fullWidth
                rows={20}
                value={yamlOutput}
                InputProps={{
                  readOnly: true,
                  style: { fontFamily: 'monospace' }
                }}
              />
            </Paper>
          </CardContent>
        </Card>
      )}
    </Container>
  );
}

export default PasspointProfileConverter;
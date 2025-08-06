import React, { useState } from 'react';
import axios from 'axios'; // For making API calls
import { API_BASE_URL } from '../config';
import {
  Box,
  Button,
  Typography,
  Container,
  Paper,
  TextField,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip
} from '@mui/material';
// Removed: yaml, plist, xml2js imports as this logic moves to backend
import ConversionCompareViewer from './ConversionCompareViewer';
import AlertDisplay from './AlertDisplay';

function PasspointProfileConverter() {
  const [selectedFile, setSelectedFile] = useState(null); // Store the File object for upload
  const [uploadedFileMeta, setUploadedFileMeta] = useState(null); // Store { filePath, fileName } from backend
  const [yamlOutput, setYamlOutput] = useState('');
  const [jsonOutput, setJsonOutput] = useState(''); // Store JSON representation of the file
  const [originalDataOutput, setOriginalDataOutput] = useState(''); // Store only the original file data
  const [comprehensiveYamlOutput, setComprehensiveYamlOutput] = useState(''); // Store comprehensive YAML with all data
  const [mappingInfo, setMappingInfo] = useState(null); // Store information about data filtering
  const [obfuscationInfo, setObfuscationInfo] = useState(null); // Store obfuscation information
  const [certificateInfo, setCertificateInfo] = useState(null); // Store certificate information
  const [suggestedFilenames, setSuggestedFilenames] = useState(null); // Store suggested download filenames
  const [error, setError] = useState(null);
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingConvert, setLoadingConvert] = useState(false);
  const [obfuscationLevel, setObfuscationLevel] = useState('none'); // Password obfuscation level
  const [certHandling, setCertHandling] = useState('preserve'); // Certificate handling mode
  const [alerts, setAlerts] = useState([]); // Store alerts from file processing

  // Obfuscation level options
  const obfuscationLevels = {
    'none': 'Show all data as-is',
    'mask': 'Replace with ***REDACTED***',
    'partial': 'Show first/last 2 chars (ab***yz)',
    'length': 'Show character count [PASSWORD-X-CHARS]',
    'hash': 'Show SHA-256 hash (sha256:a1b2...)',
    'base64': 'Base64 encode passwords'
  };

  // Certificate handling options
  const certHandlingModes = {
    'preserve': 'Show original certificate data',
    'obfuscate': 'Replace with [CERTIFICATE DATA REDACTED]',
    'info': 'Show certificate info only',
    'hash': 'Show SHA-256 hash reference',
    'truncate': 'Show BEGIN/END markers only',
    'base64': 'Show as base64 (if not already)'
  };

    // Function to handle file selection from input
  const handleFileSelection = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setError(null); // Clear any previous errors
      setAlerts([]); // Clear any previous alerts
    }
  };

  // Function to handle certificate handling mode change
  const handleCertHandlingChange = (newMode) => {
    setCertHandling(newMode);
    // If we have converted data, re-convert with new cert handling mode
    if (uploadedFileMeta?.filePath) {
      handleFileConvert();
    }
  };

  // NEW ARCHITECTURE: Atomic upload + convert (eliminates race condition)
  const handleAtomicConvert = async () => {
    if (!selectedFile) {
      setError('Please select a file first');
      return;
    }

    setLoadingUpload(true);
    setLoadingConvert(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('yamlFile', selectedFile);
      formData.append('obfuscationLevel', obfuscationLevel);
      formData.append('certHandling', certHandling);

      console.log('Starting atomic conversion for:', selectedFile.name);

      const response = await axios.post(`${API_BASE_URL}/api/upload-and-convert`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000, // 30 second timeout
      });

      console.log('Atomic conversion response:', response.data);

      if (response.data.success) {
        // Handle suggested filenames for downloads
        if (response.data.suggestedFilenames) {
          setSuggestedFilenames(response.data.suggestedFilenames);
        }

        // Set conversion data directly
        if (response.data.data) {
          setYamlOutput(response.data.data.yaml || 'No YAML conversion available');
          setComprehensiveYamlOutput(response.data.data.yaml || 'No comprehensive YAML available');
          setJsonOutput(response.data.data.json || 'No JSON conversion available');
          setOriginalDataOutput(response.data.data.original || '');
        }

        // Clear alerts since conversion was successful
        setAlerts([]);
        
        // Set upload meta for UI consistency
        setUploadedFileMeta({
          filePath: response.data.originalFilename,
          fileName: response.data.originalFilename,
        });

        console.log('Atomic conversion completed successfully');
        
      } else {
        throw new Error(response.data.error || 'Conversion failed');
      }

    } catch (err) {
      console.error('Atomic conversion failed:', err);
      
      // If atomic conversion fails, fall back to the old method
      console.log('Falling back to traditional upload/convert flow...');
      setError('Using fallback conversion method...');
      setTimeout(() => {
        handleFileUpload();
      }, 1000);
      
    } finally {
      setLoadingUpload(false);
      setLoadingConvert(false);
    }
  };

  // Function to upload the selected file to the backend
  const handleFileUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file first');
      return;
    }

    setLoadingUpload(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('yamlFile', selectedFile);

      const response = await axios.post(`${API_BASE_URL}/api/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setUploadedFileMeta({
        filePath: response.data.filePath, // Expecting { success, message, filePath, fileName }
        fileName: response.data.fileName,
      });

      // Handle alerts if present in upload response
      if (response.data.alerts && Array.isArray(response.data.alerts)) {
        setAlerts(response.data.alerts);
        console.log('Alerts received from upload:', response.data.alerts);
      } else {
        setAlerts([]); // Clear any previous alerts
      }

      console.log('File uploaded successfully:', response.data);
      // Don't automatically convert - let user trigger conversion manually
      
    } catch (err) {
      console.error('Upload failed:', err);
      setError(err.response?.data?.error || 'Failed to upload file');
    } finally {
      setLoadingUpload(false);
    }
  };

  // Function to convert the uploaded file on backend
  const handleFileConvert = async () => {
    if (!uploadedFileMeta?.filePath) {
      setError('No file uploaded to convert');
      return;
    }

    setLoadingConvert(true);
    setError(null);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/convert`, {
        filePath: uploadedFileMeta.filePath,
        obfuscationLevel: obfuscationLevel, // Send obfuscation level to backend
        certHandling: certHandling // Send certificate handling mode to backend
      });

      console.log('Conversion response:', response.data);

      // Handle alerts if present
      if (response.data.alerts && Array.isArray(response.data.alerts)) {
        setAlerts(response.data.alerts);
        console.log('Alerts received:', response.data.alerts);
      } else {
        setAlerts([]); // Clear any previous alerts
      }

      // Check if we received the expected structured data
      if (response.data && typeof response.data === 'object') {
        // Set the YAML output if available
        if (response.data.yamlOutput) {
          setYamlOutput(response.data.yamlOutput);
        } else {
          setYamlOutput('No YAML conversion available');
        }

        // Set comprehensive YAML if available
        if (response.data.comprehensiveYaml) {
          setComprehensiveYamlOutput(response.data.comprehensiveYaml);
        } else {
          setComprehensiveYamlOutput(response.data.yamlOutput || 'No comprehensive YAML available');
        }

        // Set mapping info for filtering detection
        if (response.data.mappingInfo) {
          setMappingInfo(response.data.mappingInfo);
        }

        // Set obfuscation info
        if (response.data.obfuscationInfo) {
          setObfuscationInfo(response.data.obfuscationInfo);
        }

        // Handle certificate information
        if (response.data.certificateInfo) {
          setCertificateInfo(response.data.certificateInfo);
        }

        // Handle suggested filenames for downloads
        if (response.data.suggestedFilenames) {
          setSuggestedFilenames(response.data.suggestedFilenames);
        }

        // Handle JSON output
        if (response.data.jsonOutput) {
          setJsonOutput(typeof response.data.jsonOutput === 'string' ? 
            response.data.jsonOutput : 
            JSON.stringify(response.data.jsonOutput, null, 2));
        }

        // Handle original data output
        if (response.data.originalData) {
          setOriginalDataOutput(typeof response.data.originalData === 'string' ? 
            response.data.originalData : 
            JSON.stringify(response.data.originalData, null, 2));
          console.log('- Original data contains', Object.keys(response.data.originalData || {}).length, 'top-level keys');
        }
      } else if (typeof response.data === 'string') {
        // If we get a string response, show it as YAML
        setYamlOutput(response.data);
        setJsonOutput(JSON.stringify({ rawData: response.data }, null, 2));
        setOriginalDataOutput(response.data);
        setComprehensiveYamlOutput(response.data);
      } else {
        // If we get something unexpected, show it as JSON
        const jsonString = JSON.stringify(response.data, null, 2);
        setJsonOutput(jsonString);
        setYamlOutput('Unexpected response format');
        setOriginalDataOutput(jsonString);
        setComprehensiveYamlOutput('Unexpected response format');
      }
    } catch (err) {
      console.error('Conversion failed:', err);
      setError(err.response?.data?.error || 'Failed to convert file');
    } finally {
      setLoadingConvert(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Paper sx={{ 
        p: 3, 
        borderRadius: 2,
        boxShadow: '0px 2px 4px rgba(0,0,0,0.1)'
      }}>
        <Typography variant="h4" gutterBottom sx={{ color: '#1976d2' }}>
          Passpoint Profile Converter
        </Typography>
        <Typography variant="body1" paragraph>
          Convert legacy .mobileconfig or .xml files to YAML or JSON format. View the imported file structure in either format for easy analysis and conversion.
        </Typography>

        {/* File uploader section matching the editor page */}
        <Box sx={{ 
          mb: 3, 
          mt: 2,
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '6px',
          padding: '1rem',
          textAlign: 'left'
        }}>
          <Typography variant="h6" gutterBottom>
            Upload Configuration File
          </Typography>
          <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
            Supported File Types:
          </Typography>
          <Box component="ul" sx={{ mt: 1, mb: 2, pl: 3 }}>
            <Typography component="li" variant="body2">
              <code>.mobileconfig</code> - Apple mobile configuration profiles
            </Typography>
            <Typography component="li" variant="body2">
              <code>.xml</code> - XML configuration files
            </Typography>
            <Typography component="li" variant="body2">
              <code>.eap-config</code> - EAP configuration files
            </Typography>
            <Typography component="li" variant="body2">
              <code>.yml/.yaml</code> - YAML configuration files
            </Typography>
            <Typography component="li" variant="body2">
              <code>.json</code> - JSON configuration files
            </Typography>
            <Typography component="li" variant="body2">
              <code>.txt/.conf/.cfg</code> - Text-based configuration files
            </Typography>
          </Box>

          <input
            type="file"
            accept="*/*,.eap-config,.xml,.mobileconfig,.yml,.yaml,.txt,.json,.conf,.cfg,.pem,.crt,.cer,.ovpn,.profile,application/xml,text/xml,text/plain,application/json"
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

        {/* Display alerts if any */}
        <AlertDisplay 
          alerts={alerts} 
          onClose={(index) => {
            const newAlerts = alerts.filter((_, i) => i !== index);
            setAlerts(newAlerts);
          }}
        />
        
        {uploadedFileMeta && (
           <Box sx={{ my: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              Step 4: Choose Password Protection Level
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="obfuscation-level-label">Password Protection</InputLabel>
              <Select
                labelId="obfuscation-level-label"
                value={obfuscationLevel}
                label="Password Protection"
                onChange={(e) => setObfuscationLevel(e.target.value)}
              >
                {Object.entries(obfuscationLevels).map(([level, description]) => (
                  <MenuItem key={level} value={level}>
                    <Box>
                      <Typography variant="body1" sx={{ fontWeight: level === 'none' ? 'bold' : 'normal' }}>
                        {level === 'none' ? 'No Protection' : level.charAt(0).toUpperCase() + level.slice(1)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {description}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <Typography variant="subtitle1" gutterBottom>
              Step 5: Choose Certificate Display Mode
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="cert-handling-label">Certificate Display</InputLabel>
              <Select
                labelId="cert-handling-label"
                value={certHandling}
                label="Certificate Display"
                onChange={(e) => setCertHandling(e.target.value)}
              >
                {Object.entries(certHandlingModes).map(([mode, description]) => (
                  <MenuItem key={mode} value={mode}>
                    <Box>
                      <Typography variant="body1" sx={{ fontWeight: mode === 'preserve' ? 'bold' : 'normal' }}>
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {description}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            {obfuscationLevel !== 'none' && (
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  🔒 <strong>Password protection enabled:</strong> Sensitive fields like passwords, secrets, and keys will be {
                    obfuscationLevel === 'mask' ? 'replaced with ***REDACTED***' :
                    obfuscationLevel === 'partial' ? 'partially hidden (showing only first/last 2 characters)' :
                    obfuscationLevel === 'length' ? 'replaced with character count indicators' :
                    obfuscationLevel === 'hash' ? 'replaced with SHA-256 hashes' :
                    obfuscationLevel === 'base64' ? 'Base64 encoded' :
                    'obfuscated'
                  }.
                </Typography>
              </Alert>
            )}
          </Box>
        )}

        {/* Step 3: Direct Conversion (available after upload) */}
        {uploadedFileMeta && (
          <Box sx={{ my: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              Step 3: Convert File to YAML/JSON
            </Typography>
            
            <Box sx={{ mb: 2 }}>
              <Button 
                variant="contained" 
                onClick={handleAtomicConvert} 
                disabled={loadingConvert || loadingUpload}
                color="primary"
                size="large"
              >
                {(loadingConvert || loadingUpload) ? <CircularProgress size={24} /> : `CONVERT ${selectedFile?.name || 'FILE'}`}
              </Button>
            </Box>
          </Box>
        )}



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

        {(yamlOutput || jsonOutput || originalDataOutput) && !loadingConvert && (
          <Paper variant="outlined" sx={{ mt: 3, p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Step 6: Review and Download File
            </Typography>
            
            {obfuscationInfo && obfuscationInfo.applied && (
              <Alert severity="success" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  🔒 <strong>Password Protection Applied:</strong> {obfuscationInfo.note}
                </Typography>
              </Alert>
            )}
            
            {mappingInfo && mappingInfo.filtered && mappingInfo.originalDataSize && mappingInfo.mappedDataSize && 
             (mappingInfo.originalDataSize > mappingInfo.mappedDataSize * 1.1) && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  <strong>⚠️ Data Filtering Detected!</strong> The original file contains {mappingInfo.originalDataSize} characters 
                  but the filtered YAML only contains {mappingInfo.mappedDataSize} characters 
                  ({Math.round((1 - mappingInfo.mappedDataSize / mappingInfo.originalDataSize) * 100)}% reduction). 
                  The main YAML view shows all data.
                </Typography>
              </Alert>
            )}
            
            <ConversionCompareViewer
              yamlData={yamlOutput}
              jsonData={jsonOutput}
              originalData={originalDataOutput}
              obfuscationInfo={obfuscationInfo}
              certificateInfo={certificateInfo}
              fileType={uploadedFileMeta?.fileName?.split('.').pop() || 'txt'}
              onCertHandlingChange={handleCertHandlingChange}
              currentCertHandling={certHandling}
              suggestedFilenames={suggestedFilenames}
            />
          </Paper>
        )}
      </Paper>
    </Container>
  );
}

export default PasspointProfileConverter;
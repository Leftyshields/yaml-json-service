import React, { useState, useEffect } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Paper,
  Typography,
  Alert,
  Card,
  CardHeader,
  CardContent,
  Grid,
  Fab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Chip,
  Tooltip,
  IconButton
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

/**
 * Component for interactively comparing YAML, JSON, and original data
 */
const ConversionCompareViewer = ({ 
  yamlData, 
  jsonData, 
  originalData,
  certificateInfo,
  obfuscationInfo,
  fileType,
  onCertHandlingChange,
  currentCertHandling
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [yamlView, setYamlView] = useState(yamlData || '');
  const [jsonView, setJsonView] = useState(jsonData ? JSON.stringify(jsonData, null, 2) : '');
  const [originalView, setOriginalView] = useState(
    originalData ? JSON.stringify(originalData, null, 2) : ''
  );
  const [certificateDisplayMode, setCertificateDisplayMode] = useState(currentCertHandling || 'preserve');

  // Certificate display mode options
  const certificateDisplayModes = {
    'preserve': 'Show original certificate data',
    'obfuscate': 'Replace with [CERTIFICATE DATA REDACTED]',
    'info': 'Show certificate info only',
    'hash': 'Show SHA-256 hash reference',
    'truncate': 'Show BEGIN/END markers only',
    'base64': 'Show as base64 (if not already)'
  };
  
  // Update views when props or certificate display mode change
  useEffect(() => {
    // Update local state if currentCertHandling changes from parent
    if (currentCertHandling && currentCertHandling !== certificateDisplayMode) {
      setCertificateDisplayMode(currentCertHandling);
    }
    
    // Always update views based on current data (already processed by backend)
    if (yamlData) setYamlView(yamlData);
    if (jsonData) {
      const jsonString = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData, null, 2);
      setJsonView(jsonString);
    }
    if (originalData) {
      const originalString = typeof originalData === 'string' ? originalData : JSON.stringify(originalData, null, 2);
      setOriginalView(originalString);
    }
  }, [yamlData, jsonData, originalData, currentCertHandling]);

  // Handle certificate display mode change
  const handleCertificateDisplayChange = (newMode) => {
    setCertificateDisplayMode(newMode);
    
    // Call parent callback to trigger backend re-conversion
    if (onCertHandlingChange) {
      onCertHandlingChange(newMode);
    }
  };
  
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };
  
  const handleCopyToClipboard = (content) => {
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(content)
        .then(() => alert('Copied to clipboard!'))
        .catch(() => fallbackCopy(content));
    } else {
      fallbackCopy(content);
    }
  };

  // Fallback for HTTP or older browsers
  const fallbackCopy = (content) => {
    const textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      alert('Copied to clipboard!');
    } catch (err) {
      alert('Failed to copy to clipboard.');
    }
    document.body.removeChild(textarea);
  };
  
  const handleDownload = (content, type) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `conversion_output.${type}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render the view based on the active tab
  const renderActiveTabContent = () => {
    switch (activeTab) {
      case 0: // YAML
        return (
          <Box sx={{ position: 'relative' }}>
            <Box
              component="pre"
              sx={{
                mt: 2,
                p: 2,
                backgroundColor: '#f8f9fa',
                border: '1px solid #e9ecef',
                borderRadius: 1,
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                whiteSpace: 'pre-wrap',
                maxHeight: '60vh',
                overflow: 'auto',
                margin: 0,
                width: '100%',
                boxSizing: 'border-box'
              }}
            >
              {yamlView}
            </Box>
            <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
              <Tooltip title="Copy to Clipboard">
                <IconButton 
                  onClick={() => handleCopyToClipboard(yamlView)}
                  sx={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.9)' },
                    mr: 1
                  }}
                >
                  <ContentCopyIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Download YAML">
                <IconButton 
                  onClick={() => handleDownload(yamlView, 'yaml')}
                  sx={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.9)' }
                  }}
                >
                  <FileDownloadIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        );
        
      case 1: // JSON
        return (
          <Box sx={{ position: 'relative' }}>
            <Box
              component="pre"
              sx={{
                mt: 2,
                p: 2,
                backgroundColor: '#f8f9fa',
                border: '1px solid #e9ecef',
                borderRadius: 1,
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                whiteSpace: 'pre-wrap',
                maxHeight: '60vh',
                overflow: 'auto',
                margin: 0,
                width: '100%',
                boxSizing: 'border-box'
              }}
            >
              {jsonView}
            </Box>
            <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
              <Tooltip title="Copy to Clipboard">
                <IconButton 
                  onClick={() => handleCopyToClipboard(jsonView)}
                  sx={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.9)' },
                    mr: 1
                  }}
                >
                  <ContentCopyIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Download JSON">
                <IconButton 
                  onClick={() => handleDownload(jsonView, 'json')}
                  sx={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.9)' }
                  }}
                >
                  <FileDownloadIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        );
        
      case 2: // Original
        return (
          <Box sx={{ position: 'relative' }}>
            <Box
              component="pre"
              sx={{
                mt: 2,
                p: 2,
                backgroundColor: '#f8f9fa',
                border: '1px solid #e9ecef',
                borderRadius: 1,
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                whiteSpace: 'pre-wrap',
                maxHeight: '60vh',
                overflow: 'auto',
                margin: 0,
                width: '100%',
                boxSizing: 'border-box'
              }}
            >
              {originalView}
            </Box>
            <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
              <Tooltip title="Copy to Clipboard">
                <IconButton 
                  onClick={() => handleCopyToClipboard(originalView)}
                  sx={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.9)' },
                    mr: 1
                  }}
                >
                  <ContentCopyIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Download Original">
                <IconButton 
                  onClick={() => handleDownload(originalView, fileType || 'txt')}
                  sx={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.9)' }
                  }}
                >
                  <FileDownloadIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        );
        
      default:
        return null;
    }
  };
  
  // Display obfuscation info if available
  const renderObfuscationInfo = () => {
    if (!obfuscationInfo) return null;
    
    return (
      <Alert 
        severity={obfuscationInfo.applied ? "warning" : "info"} 
        sx={{ mb: 3 }}
        icon={obfuscationInfo.applied ? <ErrorOutlineIcon /> : <CheckCircleOutlineIcon />}
      >
        <Typography variant="body2">
          {obfuscationInfo.note || `Obfuscation level: ${obfuscationInfo.level || 'none'}`}
        </Typography>
      </Alert>
    );
  };
  
  return (
    <Box sx={{ width: '100%', mt: 3 }}>
      <Paper sx={{ borderRadius: '8px', overflow: 'hidden' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#f5f5f5' }}>
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            aria-label="conversion tabs"
            variant="fullWidth"
          >
            <Tab label="YAML" icon={<VisibilityIcon />} iconPosition="start" />
            <Tab label="JSON" icon={<VisibilityIcon />} iconPosition="start" />
            <Tab label="Original" icon={<VisibilityIcon />} iconPosition="start" />
          </Tabs>
        </Box>
        
        <Box sx={{ p: 3 }}>
          {renderObfuscationInfo()}
          
          {/* Content Area */}
          {renderActiveTabContent()}
        </Box>
      </Paper>
    </Box>
  );
};

export default ConversionCompareViewer;

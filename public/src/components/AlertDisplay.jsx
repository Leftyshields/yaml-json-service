import React from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Collapse,
  IconButton,
  Typography,
  Chip
} from '@mui/material';
import {
  Close as CloseIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon
} from '@mui/icons-material';

const AlertDisplay = ({ alerts, onClose }) => {
  if (!alerts || alerts.length === 0) {
    return null;
  }

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'error':
        return <ErrorIcon />;
      case 'warning':
        return <WarningIcon />;
      default:
        return <InfoIcon />;
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      default:
        return 'info';
    }
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningIcon color="warning" />
        File Issues Detected ({alerts.length})
      </Typography>
      
      {alerts.map((alert, index) => (
        <Collapse key={index} in={true}>
          <Alert
            severity={getSeverityColor(alert.severity)}
            icon={getSeverityIcon(alert.severity)}
            action={
              onClose && (
                <IconButton
                  aria-label="close"
                  color="inherit"
                  size="small"
                  onClick={() => onClose(index)}
                >
                  <CloseIcon fontSize="inherit" />
                </IconButton>
              )
            }
            sx={{ mb: 1 }}
          >
            <AlertTitle sx={{ fontWeight: 'bold' }}>
              {alert.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </AlertTitle>
            
            <Typography variant="body2" sx={{ mb: 1 }}>
              {alert.message}
            </Typography>
            
            {alert.details && (
              <Box sx={{ mt: 1 }}>
                {alert.details.fileName && (
                  <Chip 
                    label={`File: ${alert.details.fileName}`} 
                    size="small" 
                    variant="outlined" 
                    sx={{ mr: 1, mb: 1 }}
                  />
                )}
                
                {alert.details.openTags !== undefined && alert.details.closeTags !== undefined && (
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                    <Chip 
                      label={`Opening tags: ${alert.details.openTags}`} 
                      size="small" 
                      color="primary" 
                      variant="outlined"
                    />
                    <Chip 
                      label={`Closing tags: ${alert.details.closeTags}`} 
                      size="small" 
                      color="secondary" 
                      variant="outlined"
                    />
                    {alert.details.selfClosingTags && (
                      <Chip 
                        label={`Self-closing tags: ${alert.details.selfClosingTags}`} 
                        size="small" 
                        color="default" 
                        variant="outlined"
                      />
                    )}
                  </Box>
                )}
                
                {alert.details.suggestion && (
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    💡 {alert.details.suggestion}
                  </Typography>
                )}
                
                {alert.details.supportedTypes && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      Supported file types:
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {alert.details.supportedTypes.map((type, idx) => (
                        <Chip 
                          key={idx} 
                          label={type} 
                          size="small" 
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            )}
          </Alert>
        </Collapse>
      ))}
    </Box>
  );
};

export default AlertDisplay; 
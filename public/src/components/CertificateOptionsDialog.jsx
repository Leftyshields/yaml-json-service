import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  FormControlLabel,
  RadioGroup,
  Radio,
  Typography,
  Box,
  Paper,
  Divider,
  Alert
} from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';

/**
 * Certificate Options Dialog Component
 * 
 * Allows users to choose how to handle certificates in the YAML/JSON conversion
 */
const CertificateOptionsDialog = ({ open, onClose, onSave }) => {
  const [certOption, setCertOption] = useState('obfuscate');
  
  // Options for certificate handling
  const options = [
    {
      value: 'preserve',
      label: 'Preserve Original',
      description: 'Keep certificates intact in the output',
      example: '-----BEGIN CERTIFICATE-----\nMIIEpAIBAAKCAQEA4...\n-----END CERTIFICATE-----',
      security: 'Low'
    },
    {
      value: 'obfuscate',
      label: 'Obfuscate Completely',
      description: 'Replace all certificate data with a placeholder',
      example: '[CERTIFICATE DATA REDACTED]',
      security: 'High'
    },
    {
      value: 'hash',
      label: 'Replace with Hash',
      description: 'Replace certificates with a hash value for reference',
      example: 'cert:sha256:3f8a7b6c5d...',
      security: 'High'
    },
    {
      value: 'truncate',
      label: 'Show Certificate Headers',
      description: 'Keep just the certificate type headers',
      example: '-----BEGIN CERTIFICATE-----...-----END CERTIFICATE-----',
      security: 'Medium'
    },
    {
      value: 'info',
      label: 'Extract Certificate Info',
      description: 'Replace with readable certificate metadata when possible',
      example: '[CERTIFICATE: CN=example.com, Expires: 2023-12-31]',
      security: 'Medium'
    }
  ];

  const handleSave = () => {
    onSave(certOption);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ShieldIcon color="primary" />
        Certificate Handling Options
      </DialogTitle>
      
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          Choose how to handle certificates and private keys in your configuration files
        </Alert>
        
        <Typography variant="body2" color="text.secondary" paragraph>
          Configuration files often contain embedded certificates and private keys. 
          Select how you want these sensitive items to be processed during conversion.
        </Typography>
        
        <FormControl component="fieldset" sx={{ width: '100%' }}>
          <RadioGroup 
            name="cert-options" 
            value={certOption} 
            onChange={(e) => setCertOption(e.target.value)}
          >
            {options.map((option) => (
              <Paper 
                key={option.value}
                variant="outlined"
                sx={{ 
                  mb: 2, 
                  p: 2,
                  border: certOption === option.value ? '2px solid #1976d2' : '1px solid #e0e0e0',
                  bgcolor: certOption === option.value ? 'rgba(25, 118, 210, 0.04)' : 'transparent'
                }}
              >
                <FormControlLabel
                  value={option.value}
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="subtitle1" fontWeight="500">
                        {option.label}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {option.description}
                      </Typography>
                      
                      <Box sx={{ mt: 1, display: 'flex', justifyContent: 'space-between' }}>
                        <Box 
                          sx={{ 
                            backgroundColor: '#f5f5f5', 
                            p: 1, 
                            borderRadius: 1,
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                            width: '70%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {option.example}
                        </Box>
                        
                        <Box sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          px: 2,
                          borderRadius: 1,
                          backgroundColor: 
                            option.security === 'High' ? '#e8f5e9' : 
                            option.security === 'Medium' ? '#fff8e1' : 
                            '#ffebee'
                        }}>
                          <Typography 
                            variant="caption" 
                            fontWeight="bold"
                            color={
                              option.security === 'High' ? 'success.main' : 
                              option.security === 'Medium' ? 'warning.main' : 
                              'error.main'
                            }
                          >
                            {option.security} Security
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  }
                  sx={{ width: '100%', m: 0 }}
                />
              </Paper>
            ))}
          </RadioGroup>
        </FormControl>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          Apply Options
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CertificateOptionsDialog;

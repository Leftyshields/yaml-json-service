import React, { useState } from 'react';
import yaml from 'js-yaml';
import plist from 'plist';
import { parseString } from 'xml2js';
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

function PasspointProfileConverter() {
  const [file, setFile] = useState(null);
  const [yamlOutput, setYamlOutput] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  
  // Function to handle file selection
  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      convertFile(selectedFile);
    }
  };
  
  // Function to convert file to YAML
  const convertFile = async (selectedFile) => {
    setLoading(true);
    setError(null);
    
    try {
      // Read file
      const content = await readFile(selectedFile);
      
      // Parse based on file type
      let parsedResult;
      if (selectedFile.name.toLowerCase().endsWith('.mobileconfig')) {
        parsedResult = parseMobileConfig(content);
      } else if (selectedFile.name.toLowerCase().endsWith('.xml')) {
        parsedResult = await parseXml(content);
      } else {
        throw new Error('Unsupported file type. Please upload .mobileconfig or .xml files.');
      }
      
      setParsedData(parsedResult);
      
      // Map to YAML schema
      const mappedData = mapToYamlSchema(parsedResult, selectedFile.name.toLowerCase().endsWith('.mobileconfig'));
      
      // Convert to YAML
      const yamlString = yaml.dump(mappedData);
      setYamlOutput(yamlString);
    } catch (err) {
      console.error('Error converting file:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Function to read file
  const readFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('Error reading file'));
      reader.readAsText(file);
    });
  };
  
  // Function to parse .mobileconfig files
  const parseMobileConfig = (content) => {
    try {
      // Parse the plist content
      const parsedPlist = plist.parse(content);
      return parsedPlist;
    } catch (err) {
      throw new Error(`Failed to parse .mobileconfig file: ${err.message}`);
    }
  };
  
  // Function to parse XML files
  const parseXml = (content) => {
    return new Promise((resolve, reject) => {
      parseString(content, { explicitArray: false }, (err, result) => {
        if (err) {
          reject(new Error(`Failed to parse XML file: ${err.message}`));
        } else {
          resolve(result);
        }
      });
    });
  };
  
  // Function to map parsed data to YAML schema
  const mapToYamlSchema = (parsedData, isMobileConfig) => {
    const mappedData = {
      "passpoint-properties": {
        "username": {
          type: 'string',
          description: 'User identifier',
          value: ''
        },
        "password": {
          type: 'string',
          description: 'User password',
          value: ''
        },
        "eap-method": {
          type: 'string',
          description: 'EAP authentication method',
          value: ''
        },
        "realm": {
          type: 'string',
          description: 'Authentication realm',
          value: ''
        }
      },
      "home-friendly-name": '',
      "home-domain": '',
      "home-ois": [],
      "roaming-consortiums": [],
      "other-home-partner-fqdns": [],
      "preferred-roaming-partners": []
    };
    
    if (isMobileConfig) {
      // .mobileconfig specific mapping
      // Find the Wi-Fi payload
      const wifiPayload = parsedData.PayloadContent?.find(payload => 
        payload.PayloadType === 'com.apple.wifi.managed'
      );
      
      if (wifiPayload) {
        // Map basic fields
        mappedData["home-friendly-name"] = wifiPayload.SSID_STR || '';
        mappedData["home-domain"] = wifiPayload.DomainName || '';
        
        // Map user credentials if available
        const eapConfig = wifiPayload.EAPClientConfiguration;
        if (eapConfig) {
          mappedData["passpoint-properties"].username.value = eapConfig.UserName || '';
          mappedData["passpoint-properties"].realm.value = eapConfig.UserName?.split('@')[1] || '';
          
          // Map EAP method if available
          if (eapConfig.AcceptEAPTypes && eapConfig.AcceptEAPTypes.length > 0) {
            const eapType = eapConfig.AcceptEAPTypes[0];
            // Map EAP type numbers to names
            const eapTypes = {
              13: 'TLS',
              18: 'SIM',
              21: 'TTLS',
              23: 'AKA',
              50: "AKA'"
            };
            mappedData["passpoint-properties"]["eap-method"].value = eapTypes[eapType] || eapType.toString();
          }
        }
        
        // Map roaming consortium OIs if available
        if (wifiPayload.RoamingConsortiumOIs && Array.isArray(wifiPayload.RoamingConsortiumOIs)) {
          mappedData["roaming-consortiums"] = wifiPayload.RoamingConsortiumOIs;
        }
        
        // Handle HomeOIs if present
        if (wifiPayload.HomeOIs && Array.isArray(wifiPayload.HomeOIs)) {
          mappedData["home-ois"] = wifiPayload.HomeOIs.map(oi => ({
            name: oi.Name || 'HomeOI',
            length: '5 Hex',
            'home-oi': oi.Value || ''
          }));
        }
      }
    } else {
      // XML specific mapping
      const passpoint = parsedData.Passpoint || parsedData.passpoint;
      
      if (passpoint) {
        if (passpoint.HomeSP || passpoint.homeSP) {
          const homeSP = passpoint.HomeSP || passpoint.homeSP;
          mappedData["home-friendly-name"] = homeSP.FriendlyName || homeSP.friendlyName || '';
          mappedData["home-domain"] = homeSP.FQDN || homeSP.fqdn || '';
          
          // Map roaming consortium OIs
          const roamingConsortium = homeSP.RoamingConsortiumOI || homeSP.roamingConsortiumOI;
          if (roamingConsortium) {
            const ois = Array.isArray(roamingConsortium) ? roamingConsortium : [roamingConsortium];
            mappedData["roaming-consortiums"] = ois;
          }
          
          // Map home OIs
          const homeOIs = homeSP.HomeOI || homeSP.homeOI;
          if (homeOIs) {
            const ois = Array.isArray(homeOIs) ? homeOIs : [homeOIs];
            mappedData["home-ois"] = ois.map(oi => ({
              name: oi.Name || oi.name || 'HomeOI',
              length: '5 Hex',
              'home-oi': oi.Value || oi.value || ''
            }));
          }
        }
        
        // Map credentials
        const credential = passpoint.Credential || passpoint.credential;
        if (credential) {
          // Username/password mapping
          const usernamePassword = credential.UsernamePassword || credential.usernamePassword;
          if (usernamePassword) {
            mappedData["passpoint-properties"].username.value = usernamePassword.Username || usernamePassword.username || '';
          }
          
          // Realm mapping
          mappedData["passpoint-properties"].realm.value = credential.Realm || credential.realm || '';
          
          // EAP method mapping
          const eapMethod = credential.EAPMethod || credential.eapMethod;
          if (eapMethod) {
            // Convert EAP type number to name if needed
            const eapType = eapMethod.Type || eapMethod.type;
            if (eapType) {
              const eapTypes = {
                13: 'TLS',
                18: 'SIM',
                21: 'TTLS',
                23: 'AKA',
                50: "AKA'"
              };
              mappedData["passpoint-properties"]["eap-method"].value = eapTypes[eapType] || eapType.toString();
            }
          }
        }
      }
    }
    
    return mappedData;
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
    a.download = 'passpoint_profile.yml';
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
              Step 1: Upload Configuration File
            </Typography>
            <Typography variant="body2" paragraph>
              Select a .mobileconfig or .xml file containing your Passpoint profile configuration.
            </Typography>
            
            <input
              type="file"
              accept=".mobileconfig,.xml"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              id="file-input"
            />
            <label htmlFor="file-input">
              <Button variant="contained" component="span">
                Upload File
              </Button>
            </label>
            {file && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                Selected file: <strong>{file.name}</strong>
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>
      
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}
      
      {error && (
        <Alert severity="error" sx={{ my: 2 }}>
          {error}
        </Alert>
      )}
      
      {yamlOutput && !loading && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Step 2: Review and Download YAML
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
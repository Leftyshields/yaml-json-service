// public/src/App.jsx
import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Paper,
  TextField,
  Box,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Chip,
  FormControlLabel,
  Switch,
  Divider,
  Card,
  CardContent,
  Grid,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
} from '@mui/material';
import { Add as AddIcon, Close as CloseIcon } from '@mui/icons-material';
import yaml from 'js-yaml';

function App() {
  // State for form data
  const [formData, setFormData] = useState({
    "home-friendly-name": "",
    "home-domain": ""
  });
  
  // State for schema and loading
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Add temporary state for the new OI being added
  const [newHomeOI, setNewHomeOI] = useState({
    name: '',
    length: '5 Hex',
    'home-oi': ''
  });
  
  // Add OI segment state to handle the separate input fields
  const [oiSegments, setOiSegments] = useState(Array(5).fill(''));
  
  // Update the new OI state
  const handleNewOIChange = (field) => (event) => {
    setNewHomeOI({
      ...newHomeOI,
      [field]: event.target.value
    });
  };
  
  // Handle OI segment changes
  const handleOISegmentChange = (index) => (event) => {
    const newSegments = [...oiSegments];
    // Force uppercase and only allow hex characters
    const value = event.target.value.toUpperCase().replace(/[^0-9A-F]/g, '');
    newSegments[index] = value;
    setOiSegments(newSegments);
    
    // Update the home-oi field in newHomeOI when segments change
    setNewHomeOI({
      ...newHomeOI,
      'home-oi': newSegments.join('')
    });
  };
  
  // Add home OI to the array
  const addHomeOI = () => {
    // Validate required fields
    if (!newHomeOI.name || !newHomeOI['home-oi']) {
      alert('Please fill in all required fields');
      return;
    }
    
    // Add the new OI to the array
    const newArray = [...(formData['home-ois'] || [])];
    newArray.push(newHomeOI);
    
    // Update the form data
    setFormData({
      ...formData,
      'home-ois': newArray
    });
    
    // Clear the input fields
    setNewHomeOI({
      name: '',
      length: '5 Hex',
      'home-oi': ''
    });
    setOiSegments(Array(5).fill(''));
  };
  
  // Clear the OI input form
  const clearOIForm = () => {
    setNewHomeOI({
      name: '',
      length: '5 Hex',
      'home-oi': ''
    });
    setOiSegments(Array(5).fill(''));
  };

  // Add state for the new roaming consortium being added
  const [newConsortium, setNewConsortium] = useState({
    name: '',  // For UI only, not stored in final data
    length: '5 Hex',
    value: ''
  });
  
  // Add consortium segment state to handle the separate input fields
  const [consortiumSegments, setConsortiumSegments] = useState(Array(5).fill(''));
  
  // Update the new consortium state
  const handleNewConsortiumChange = (field) => (event) => {
    setNewConsortium({
      ...newConsortium,
      [field]: event.target.value
    });
  };
  
  // Handle consortium segment changes
  const handleConsortiumSegmentChange = (index) => (event) => {
    const newSegments = [...consortiumSegments];
    // Force uppercase and only allow hex characters
    const value = event.target.value.toUpperCase().replace(/[^0-9A-F]/g, '');
    newSegments[index] = value;
    setConsortiumSegments(newSegments);
    
    // Update the value in newConsortium when segments change
    setNewConsortium({
      ...newConsortium,
      value: newSegments.join('')
    });
  };
  
  // Add consortium to the array
  const addConsortium = () => {
    // Validate required fields
    if (!newConsortium.name || !newConsortium.value) {
      alert('Please fill in all required fields');
      return;
    }
    
    // For roaming-consortiums, we only store the actual hex value
    const newArray = [...(formData['roaming-consortiums'] || [])];
    newArray.push(newConsortium.value);
    
    // Update the form data
    setFormData({
      ...formData,
      'roaming-consortiums': newArray
    });
    
    // Clear the input fields
    setNewConsortium({
      name: '',
      length: '5 Hex',
      value: ''
    });
    setConsortiumSegments(Array(5).fill(''));
  };
  
  // Clear the consortium input form
  const clearConsortiumForm = () => {
    setNewConsortium({
      name: '',
      length: '5 Hex',
      value: ''
    });
    setConsortiumSegments(Array(5).fill(''));
  };
  
  // Fetch schema from the API
  useEffect(() => {
    const fetchSchema = async () => {
      try {
        setLoading(true);
        
        // Fetch YAML from API
        const response = await fetch('/api/config');
        if (!response.ok) {
          throw new Error(`Failed to fetch schema: ${response.status} ${response.statusText}`);
        }
        
        const yamlText = await response.text();
        const parsedYaml = yaml.load(yamlText);
        
        // Extract properties from YAML safely
        let schemaProperties = {};
        if (parsedYaml && parsedYaml['passpoint-properties']) {
          schemaProperties = parsedYaml['passpoint-properties'];
        }
        
        console.log('Loaded schema properties:', schemaProperties);
        setSchema(schemaProperties);
        
        // Initialize form data with empty values for each field
        const initialData = {};
        Object.keys(schemaProperties).forEach(key => {
          if (schemaProperties[key].type === 'array') {
            initialData[key] = [];
          } else if (schemaProperties[key].type === 'boolean') {
            initialData[key] = false;
          } else if (schemaProperties[key].type === 'number' || schemaProperties[key].type === 'integer') {
            initialData[key] = 0;
          } else {
            initialData[key] = "";
          }
        });
        
        setFormData(initialData);
      } catch (err) {
        console.error('Error loading schema:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchSchema();
  }, []);
  
  // Handle form field changes
  const handleChange = (field) => (event) => {
    let value = event.target.value;
    
    setFormData({
      ...formData,
      [field]: value
    });
  };

  // Handle boolean switch changes
  const handleSwitchChange = (field) => (event) => {
    setFormData({
      ...formData,
      [field]: event.target.checked
    });
  };
  
  // Handle array field changes
  const handleArrayChange = (field, index, subField) => (event) => {
    const newArray = [...formData[field]];
    
    if (subField) {
      // Handle nested object in array
      newArray[index] = { 
        ...newArray[index],
        [subField]: event.target.value 
      };
    } else {
      // Handle simple array
      newArray[index] = event.target.value;
    }
    
    setFormData({
      ...formData,
      [field]: newArray
    });
  };
  
  // Add item to array
  const addArrayItem = (field, isObject = false) => () => {
    const newArray = [...(formData[field] || [])];
    
    if (isObject) {
      // Add empty object with default keys
      const objectSchema = schema[field].items.properties;
      const newObj = {};
      
      // Initialize object with empty values based on its schema
      Object.keys(objectSchema).forEach(key => {
        if (objectSchema[key].type === 'boolean') {
          newObj[key] = false;
        } else if (objectSchema[key].type === 'number') {
          newObj[key] = 0;
        } else {
          newObj[key] = '';
        }
      });
      
      newArray.push(newObj);
    } else {
      // Add empty string for simple array
      newArray.push("");
    }
    
    setFormData({
      ...formData,
      [field]: newArray
    });
  };
  
  // Remove item from array
  const removeArrayItem = (field, index) => () => {
    const newArray = [...formData[field]];
    newArray.splice(index, 1);
    
    setFormData({
      ...formData,
      [field]: newArray
    });
  };
  
  // Format field label from kebab-case to Title Case
  const formatFieldLabel = (key) => {
    return key.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };
  
  // Render fields based on schema
  const renderFields = () => {
    if (!schema) return null;
    
    return Object.keys(schema).map(key => {
      const field = schema[key];
      const fieldType = field.type;
      
      // Render different field types
      switch (fieldType) {
        case 'string':
          return (
            <TextField
              key={key}
              label={formatFieldLabel(key)}
              fullWidth
              margin="normal"
              value={formData[key] || ''}
              onChange={handleChange(key)}
              helperText={field.description}
            />
          );
          
        case 'number':
        case 'integer':
          return (
            <TextField
              key={key}
              label={formatFieldLabel(key)}
              type="number"
              fullWidth
              margin="normal"
              value={formData[key] || 0}
              onChange={handleChange(key)}
              helperText={field.description}
              InputProps={{
                inputProps: { 
                  min: field.minimum !== undefined ? field.minimum : null,
                  max: field.maximum !== undefined ? field.maximum : null
                }
              }}
            />
          );
          
        case 'boolean':
          return (
            <FormControlLabel
              key={key}
              control={
                <Switch 
                  checked={!!formData[key]} 
                  onChange={handleSwitchChange(key)}
                />
              }
              label={formatFieldLabel(key)}
              sx={{ mt: 2, display: 'block' }}
            />
          );
          
        case 'array':
          const isObjectArray = field.items && field.items.type === 'object';
          
          if (key === 'home-ois') {
            return (
              <Card key={key} sx={{ mt: 2, mb: 2 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {formatFieldLabel(key)}
                  </Typography>
                  
                  <Box sx={{ mb: 2 }}>
                    <Grid container spacing={2} alignItems="center">
                      <Grid item xs={4}>
                        <Typography variant="subtitle2" sx={{ ml: 1 }}>
                          <span style={{ color: '#ff9800' }}>*</span> Name
                        </Typography>
                        <TextField
                          fullWidth
                          size="small"
                          placeholder="Name"
                          value={newHomeOI.name}
                          onChange={handleNewOIChange('name')}
                        />
                      </Grid>
                      <Grid item xs={2}>
                        <Typography variant="subtitle2" sx={{ ml: 1 }}>
                          <span style={{ color: '#ff9800' }}>*</span> Length
                        </Typography>
                        <FormControl fullWidth size="small">
                          <Select 
                            value={newHomeOI.length}
                            onChange={handleNewOIChange('length')}
                          >
                            <MenuItem value="5 Hex">5 Hex</MenuItem>
                            <MenuItem value="6 Hex">6 Hex</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={4}>
                        <Typography variant="subtitle2" sx={{ ml: 1 }}>
                          <span style={{ color: '#ff9800' }}>*</span> Organization ID
                        </Typography>
                        <Box sx={{ display: 'flex' }}>
                          {oiSegments.map((segment, index) => (
                            <TextField
                              key={`oi-segment-${index}`}
                              size="small"
                              sx={{ width: '3rem', mx: 0.25 }}
                              inputProps={{ 
                                maxLength: 2, 
                                style: { textAlign: 'center' }
                              }}
                              value={segment}
                              onChange={handleOISegmentChange(index)}
                            />
                          ))}
                        </Box>
                      </Grid>
                      <Grid item xs={2}>
                        <Box sx={{ display: 'flex', mt: 3.5 }}>
                          <Button
                            variant="outlined"
                            color="primary"
                            size="small"
                            sx={{ mr: 1, fontSize: '0.75rem', py: 0.5 }}
                            onClick={addHomeOI}
                          >
                            ADD
                          </Button>
                          <Button
                            variant="outlined"
                            color="secondary"
                            size="small"
                            sx={{ mr: 1, fontSize: '0.75rem', py: 0.5 }}
                            onClick={clearOIForm}
                          >
                            CANCEL
                          </Button>
                        </Box>
                      </Grid>
                    </Grid>
                  </Box>
    
                  <Paper variant="outlined" sx={{ mb: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                          <TableCell>Name</TableCell>
                          <TableCell>Length</TableCell>
                          <TableCell>Organization ID</TableCell>
                          <TableCell width="5%"></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(formData[key] || []).map((item, index) => (
                          <TableRow key={`${key}-${index}`}>
                            <TableCell>{item.name || ''}</TableCell>
                            <TableCell>{item.length || '5 Hex'}</TableCell>
                            <TableCell>
                              {item['home-oi'] || ''}
                            </TableCell>
                            <TableCell width="5%">
                              <IconButton 
                                size="small"
                                onClick={removeArrayItem(key, index)}
                                color="error"
                              >
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Paper>
                </CardContent>
              </Card>
            );
          } else if (key === 'roaming-consortiums') {
            return (
              <Card key={key} sx={{ mt: 2, mb: 2 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {formatFieldLabel(key)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {field.description}
                  </Typography>
                  
                  <Box sx={{ mb: 2 }}>
                    <Grid container spacing={2} alignItems="center">
                      <Grid item xs={4}>
                        <Typography variant="subtitle2" sx={{ ml: 1 }}>
                          <span style={{ color: '#ff9800' }}>*</span> Name
                        </Typography>
                        <TextField
                          fullWidth
                          size="small"
                          placeholder="Name (for reference only)"
                          value={newConsortium.name}
                          onChange={handleNewConsortiumChange('name')}
                        />
                      </Grid>
                      <Grid item xs={2}>
                        <Typography variant="subtitle2" sx={{ ml: 1 }}>
                          <span style={{ color: '#ff9800' }}>*</span> Length
                        </Typography>
                        <FormControl fullWidth size="small">
                          <Select 
                            value={newConsortium.length}
                            onChange={handleNewConsortiumChange('length')}
                          >
                            <MenuItem value="5 Hex">5 Hex</MenuItem>
                            <MenuItem value="6 Hex">6 Hex</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={4}>
                        <Typography variant="subtitle2" sx={{ ml: 1 }}>
                          <span style={{ color: '#ff9800' }}>*</span> Organization ID
                        </Typography>
                        <Box sx={{ display: 'flex' }}>
                          {consortiumSegments.map((segment, index) => (
                            <TextField
                              key={`consortium-segment-${index}`}
                              size="small"
                              sx={{ width: '3rem', mx: 0.25 }}
                              inputProps={{ 
                                maxLength: 2, 
                                style: { textAlign: 'center' }
                              }}
                              value={segment}
                              onChange={handleConsortiumSegmentChange(index)}
                            />
                          ))}
                        </Box>
                      </Grid>
                      <Grid item xs={2}>
                        <Box sx={{ display: 'flex', mt: 3.5 }}>
                          <Button
                            variant="outlined"
                            color="primary"
                            size="small"
                            sx={{ mr: 1, fontSize: '0.75rem', py: 0.5 }}
                            onClick={addConsortium}
                          >
                            ADD
                          </Button>
                          <Button
                            variant="outlined"
                            color="secondary"
                            size="small"
                            sx={{ mr: 1, fontSize: '0.75rem', py: 0.5 }}
                            onClick={clearConsortiumForm}
                          >
                            CANCEL
                          </Button>
                        </Box>
                      </Grid>
                    </Grid>
                  </Box>

                  <Paper variant="outlined" sx={{ mb: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                          <TableCell>Name</TableCell>
                          <TableCell>Value</TableCell>
                          <TableCell width="5%"></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(formData[key] || []).map((item, index) => (
                          <TableRow key={`${key}-${index}`}>
                            <TableCell>{`Consortium ${index + 1}`}</TableCell>
                            <TableCell>{item}</TableCell>
                            <TableCell width="5%">
                              <IconButton 
                                size="small"
                                onClick={removeArrayItem(key, index)}
                              >
                                <span>×</span>
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Paper>
                </CardContent>
              </Card>
            );
          } else {
            return (
              <Card key={key} sx={{ mt: 2, mb: 2 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {formatFieldLabel(key)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {field.description}
                  </Typography>
                  
                  {(formData[key] || []).map((item, index) => (
                    <Box key={`${key}-${index}`} sx={{ mt: 1, p: 1, border: '1px solid #eee', borderRadius: 1 }}>
                      {isObjectArray ? (
                        // Render object array (with nested properties)
                        Object.keys(field.items.properties).map(propKey => (
                          <TextField
                            key={`${key}-${index}-${propKey}`}
                            label={formatFieldLabel(propKey)}
                            fullWidth
                            margin="dense"
                            value={item[propKey] || ''}
                            onChange={handleArrayChange(key, index, propKey)}
                            helperText={field.items.properties[propKey]?.description}
                          />
                        ))
                      ) : (
                        // Render simple string array
                        <TextField
                          fullWidth
                          margin="dense"
                          value={item || ''}
                          onChange={handleArrayChange(key, index)}
                          placeholder={`Enter ${formatFieldLabel(key)} item`}
                        />
                      )}
                      <Box sx={{ mt: 1, textAlign: 'right' }}>
                        <Chip 
                          label="Remove" 
                          color="secondary" 
                          size="small"
                          onClick={removeArrayItem(key, index)} 
                        />
                      </Box>
                    </Box>
                  ))}
                  
                  <Box sx={{ mt: 2 }}>
                    <Chip 
                      label={`Add ${formatFieldLabel(key)} Item`} 
                      color="primary" 
                      onClick={addArrayItem(key, isObjectArray)} 
                    />
                  </Box>
                </CardContent>
              </Card>
            );
          }
          
        default:
          return null;
      }
    });
  };

  // Function to generate YAML from the current form data
  const generateYaml = () => {
    try {
      // Create a copy of the original schema
      const fullConfig = {
        $id: "https://wballiance.com/passpoint-schema.json",
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        "passpoint-properties": {}
      };
      
      // Add form values to the config
      Object.keys(formData).forEach(key => {
        fullConfig["passpoint-properties"][key] = formData[key];
      });
      
      // Convert to YAML
      const yamlOutput = yaml.dump(fullConfig, {
        indent: 2,
        lineWidth: -1,
        noRefs: true
      });
      
      // Create a downloadable file
      const blob = new Blob([yamlOutput], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'passpoint-config.yml';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generating YAML:', err);
      alert('Failed to generate YAML file');
    }
  };

  // Function to generate a JSON file for download
  const generateJson = () => {
    try {
      // Create a downloadable file
      const blob = new Blob([JSON.stringify(formData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'passpoint-config.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generating JSON:', err);
      alert('Failed to generate JSON file');
    }
  };

  // Function to open a new window with only JSON
  const viewJsonOnly = () => {
    const jsonContent = JSON.stringify(formData, null, 2);
    const newWindow = window.open();
    newWindow.document.write(`
      <html>
        <head>
          <title>Passpoint JSON</title>
          <style>
            body {
              font-family: monospace;
              padding: 20px;
              background-color: #f6f6f6;
            }
            pre {
              background-color: white;
              padding: 15px;
              border-radius: 4px;
              border: 1px solid #ddd;
              overflow: auto;
            }
          </style>
        </head>
        <body>
          <h2>Passpoint Configuration JSON</h2>
          <pre>${jsonContent}</pre>
        </body>
      </html>
    `);
    newWindow.document.close();
  };

  return (
    <Box sx={{ 
      minHeight: '100vh',
      display: 'flex', 
      justifyContent: 'center',
      bgcolor: '#f5f5f5',
      padding: 0
    }}>
      <Container 
        maxWidth="md"
        sx={{ 
          mt: 4,
          mb: 4,
          bgcolor: '#ffffff',  
          p: 4,             
          borderRadius: 2,  
          boxShadow: 1,
          minHeight: '80vh',
          width: '100%'
        }}
      >
        <Typography variant="h4" gutterBottom sx={{ color: '#1976d2' }}>
          Passpoint Config Editor
        </Typography>
        
        {loading ? (
          <CircularProgress />
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <>
            <Box sx={{ mb: 3 }}>
              {renderFields()}
            </Box>
    
            <Paper 
              sx={{ 
                mt: 4, 
                p: 2, 
                whiteSpace: 'pre-wrap', 
                backgroundColor: '#f6f6f6' 
              }}
            >
              <Typography variant="subtitle1">JSON Preview</Typography>
              <code>{JSON.stringify(formData, null, 2)}</code>
            </Paper>

            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between' }}>
              <Button variant="contained" color="primary" onClick={generateYaml}>
                Download YAML
              </Button>
              <Button variant="contained" color="secondary" onClick={generateJson}>
                Download JSON
              </Button>
              <Button variant="outlined" color="primary" onClick={viewJsonOnly}>
                View JSON Only
              </Button>
            </Box>
          </>
        )}
      </Container>
    </Box>
  );
}

export default App;

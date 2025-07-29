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
  Tabs,
  Tab,
} from '@mui/material';
import { Add as AddIcon, Close as CloseIcon } from '@mui/icons-material';
import yaml from 'js-yaml';
import FileUploader from './components/FileUploader';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import PasspointProfileConverter from './components/PasspointProfileConverter';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';

// Navigation component that uses useLocation
function Navigation() {
  const location = useLocation();
  
  // Determine tab value based on current location
  const getTabValue = () => {
    if (location.pathname === '/') return 0;
    if (location.pathname === '/editor') return 1;
    return 0;
  };

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'white' }}>
      <Tabs 
        value={getTabValue()} 
        centered
        sx={{ mt: 2 }}
      >
        <Tab label="Profile Converter" component={Link} to="/" />
        <Tab label="Passpoint Config Editor" component={Link} to="/editor" />
      </Tabs>
    </Box>
  );
}

function App() {
  // State for form data
  const [formData, setFormData] = useState({
    "home-friendly-name": "",
    "home-domain": "",
    "home-ois": [],
    "roaming-consortiums": [],
    "other-home-partner-fqdns": [],
    "preferred-roaming-partners": []
  });
  
  // Separate schema storage
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
        
        // Initialize form data with proper structure
        const initialData = {};
        Object.keys(schemaProperties).forEach(key => {
          const prop = schemaProperties[key];
          
          if (prop.type === 'object' && prop.properties) {
            // Initialize object with all nested properties
            initialData[key] = {};
            Object.keys(prop.properties).forEach(subKey => {
              initialData[key][subKey] = '';
            });
          } else if (prop.type === 'array') {
            initialData[key] = [];
          } else if (prop.type === 'boolean') {
            initialData[key] = false;
          } else if (prop.type === 'number' || prop.type === 'integer') {
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

  // Add an effect to set the body background color
  useEffect(() => {
    // Set the body background color
    document.body.style.backgroundColor = '#F5F5F5';
    
    // Clean up function to reset the body background when component unmounts
    return () => {
      document.body.style.backgroundColor = '';
    };
  }, []);
  
  // Handle form field changes
  const handleChange = (field) => (event) => {
    let value = event.target.value;
    
    setFormData({
      ...formData,
      [field]: value
    });
  };

  // Add these additional state variables to track the original structure
  const [originalStructure, setOriginalStructure] = useState(null);
  const [userModifiedValues, setUserModifiedValues] = useState({});
  const [showDynamicFields, setShowDynamicFields] = useState(false); // Hide dynamic fields by default

  // Update the handleInputChange function to properly handle nested values
  const handleInputChange = (fieldPath) => (event) => {
    const value = event.target.value;
    console.log(`Updating ${fieldPath} with value: ${value}`);
    
    // Create a deep copy of form data
    const newFormData = JSON.parse(JSON.stringify(formData));
    
    // Handle special cases - preserve structure
    if (originalStructure && originalStructure['passpoint-properties'] && 
        originalStructure['passpoint-properties'][fieldPath]) {
      // If this field exists in the schema with a complex structure
      // Just update the form data for display purposes
      newFormData[fieldPath] = value;
      
      // Track modified value with special path for later export
      const newModifications = {...userModifiedValues};
      newModifications[`passpoint-properties.${fieldPath}.value`] = value;
      setUserModifiedValues(newModifications);
    } else {
      // Standard field - update directly
      newFormData[fieldPath] = value;
      
      // Track this field as user-modified
      const newModifications = {...userModifiedValues};
      newModifications[fieldPath] = value;
      setUserModifiedValues(newModifications);
    }
    
    setFormData(newFormData);
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
    // Handle special field name mappings
    const specialMappings = {
      'display-name': 'Display Name',
      'identifier': 'Identifier',
      'organization': 'Organization',
      'description': 'Description',
      'content': 'Content',
      'removal-disallowed': 'Removal Disallowed',
      'version': 'Version',
      'type': 'Type',
      'uuid': 'UUID'
    };
    
    if (specialMappings[key]) {
      return specialMappings[key];
    }
    
    return key.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };
  
  // Helper function to categorize fields
  const categorizeFields = () => {
    const boilerplateFields = new Set([
      'home-friendly-name',
      'home-domain', 
      'home-ois',
      'roaming-consortiums',
      'other-home-partner-fqdns',
      'preferred-roaming-partners'
    ]);

    const dynamicFields = {};
    const knownFields = {};

    Object.entries(formData).forEach(([key, value]) => {
      if (boilerplateFields.has(key)) {
        knownFields[key] = value;
      } else {
        dynamicFields[key] = value;
      }
    });

    return { dynamicFields, knownFields };
  };

  // Render dynamic fields extracted from uploaded files
  const renderDynamicFields = () => {
    const { dynamicFields } = categorizeFields();
    
    // Don't show dynamic fields section if no file uploaded or no dynamic fields
    if (!uploadedFile || Object.keys(dynamicFields).length === 0) {
      return null;
    }

    return (
      <>
        {/* Toggle button for dynamic fields */}
        <Card sx={{ mt: 2, mb: 2, bgcolor: '#fff3cd', border: '1px solid #ffeaa7' }}>
          <CardContent sx={{ py: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="h6" sx={{ color: '#856404', mb: 0.5 }}>
                  📁 Extracted Fields Available ({Object.keys(dynamicFields).length} fields)
                </Typography>
                <Typography variant="body2" sx={{ color: '#856404' }}>
                  These fields were automatically extracted from your uploaded configuration file.
                </Typography>
              </Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={showDynamicFields}
                    onChange={(e) => setShowDynamicFields(e.target.checked)}
                    color="primary"
                  />
                }
                label={showDynamicFields ? "Hide Fields" : "Show Fields"}
                sx={{ color: '#856404' }}
              />
            </Box>
          </CardContent>
        </Card>

        {/* Render the actual dynamic fields only when showDynamicFields is true */}
        {showDynamicFields && (
          <Card sx={{ mt: 2, mb: 2, bgcolor: '#e8f4fd' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ color: '#1976d2' }}>
                📁 Extracted from Uploaded File ({Object.keys(dynamicFields).length} fields)
              </Typography>
              <Typography variant="body2" sx={{ mb: 3, color: '#555' }}>
                These fields were automatically extracted from your uploaded configuration file.
              </Typography>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {Object.entries(dynamicFields).map(([key, value]) => {
              // Handle different value types
              if (Array.isArray(value)) {
                return (
                  <Paper key={key} sx={{ p: 2, bgcolor: '#f8f9fa', border: '1px solid #dee2e6' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1, color: '#495057' }}>
                      {formatFieldLabel(key)}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', mb: 2, color: '#6c757d' }}>
                      Array field with {value.length} items
                    </Typography>
                    <TextField
                      fullWidth
                      value={value.map(item => 
                        typeof item === 'object' ? JSON.stringify(item) : item
                      ).join(', ')}
                      onChange={(e) => {
                        const arrayValue = e.target.value.split(',').map(v => v.trim()).filter(Boolean);
                        setFormData({
                          ...formData,
                          [key]: arrayValue
                        });
                        setUserModifiedValues({
                          ...userModifiedValues,
                          [key]: arrayValue
                        });
                      }}
                      multiline={value.length > 3}
                      rows={value.length > 3 ? 3 : 1}
                      variant="outlined"
                    />
                  </Paper>
                );
              } else if (typeof value === 'object' && value !== null) {
                return (
                  <Paper key={key} sx={{ p: 2, bgcolor: '#f8f9fa', border: '1px solid #dee2e6' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1, color: '#495057' }}>
                      {formatFieldLabel(key)}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', mb: 2, color: '#6c757d' }}>
                      Complex object field (JSON format)
                    </Typography>
                    <TextField
                      fullWidth
                      value={JSON.stringify(value, null, 2)}
                      onChange={(e) => {
                        try {
                          const objectValue = JSON.parse(e.target.value);
                          setFormData({
                            ...formData,
                            [key]: objectValue
                          });
                          setUserModifiedValues({
                            ...userModifiedValues,
                            [key]: objectValue
                          });
                        } catch (err) {
                          // Invalid JSON, store as string temporarily
                          setFormData({
                            ...formData,
                            [key]: e.target.value
                          });
                        }
                      }}
                      multiline
                      rows={4}
                      variant="outlined"
                    />
                  </Paper>
                );
              } else if (typeof value === 'boolean') {
                return (
                  <Paper key={key} sx={{ p: 2, bgcolor: '#f8f9fa', border: '1px solid #dee2e6' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1, color: '#495057' }}>
                      {formatFieldLabel(key)}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', mb: 2, color: '#6c757d' }}>
                      Boolean field (true/false)
                    </Typography>
                    <FormControlLabel
                      control={
                        <Switch 
                          checked={!!value}
                          onChange={(e) => {
                            setFormData({
                              ...formData,
                              [key]: e.target.checked
                            });
                            setUserModifiedValues({
                              ...userModifiedValues,
                              [key]: e.target.checked
                            });
                          }}
                        />
                      }
                      label={value ? 'Enabled' : 'Disabled'}
                    />
                  </Paper>
                );
              } else if (typeof value === 'number') {
                return (
                  <Paper key={key} sx={{ p: 2, bgcolor: '#f8f9fa', border: '1px solid #dee2e6' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1, color: '#495057' }}>
                      {formatFieldLabel(key)}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', mb: 2, color: '#6c757d' }}>
                      Numeric field
                    </Typography>
                    <TextField
                      type="number"
                      fullWidth
                      value={value || ''}
                      onChange={(e) => {
                        const numValue = parseFloat(e.target.value) || 0;
                        setFormData({
                          ...formData,
                          [key]: numValue
                        });
                        setUserModifiedValues({
                          ...userModifiedValues,
                          [key]: numValue
                        });
                      }}
                      variant="outlined"
                    />
                  </Paper>
                );
              } else {
                // String or other primitive types
                return (
                  <Paper key={key} sx={{ p: 2, bgcolor: '#f8f9fa', border: '1px solid #dee2e6' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1, color: '#495057' }}>
                      {formatFieldLabel(key)}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', mb: 2, color: '#6c757d' }}>
                      Text field
                    </Typography>
                    <TextField
                      fullWidth
                      value={value || ''}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          [key]: e.target.value
                        });
                        setUserModifiedValues({
                          ...userModifiedValues,
                          [key]: e.target.value
                        });
                      }}
                      variant="outlined"
                    />
                  </Paper>
                );
              }
            })}
          </Box>
        </CardContent>
      </Card>
        )}
      </>
    );
  };

  // Render fields based on schema
  const renderFields = () => {
    if (!schema) return null;
    
    return Object.keys(schema).map(key => {
      const field = schema[key];
      const fieldType = field.type;
      
      // Handle nested objects
      if (fieldType === 'object' && field.properties) {
        return (
          <Card key={key} sx={{ mt: 2, mb: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {formatFieldLabel(key)}
              </Typography>
              
              {Object.keys(field.properties).map(propKey => {
                const propField = field.properties[propKey];
                const fullPath = `${key}.${propKey}`;
                const value = formData[key]?.[propKey] || '';
                
                return (
                  <TextField
                    key={fullPath}
                    label={formatFieldLabel(propKey)}
                    fullWidth
                    margin="normal"
                    value={getNestedValue(formData, fullPath)}
                    onChange={handleInputChange(fullPath)}
                    helperText={propField.description}
                  />
                );
              })}
            </CardContent>
          </Card>
        );
      }
      
      // Render different field types
      switch (fieldType) {
        case 'string':
          return (
            <TextField
              key={key}
              label={formatFieldLabel(key)}
              fullWidth
              margin="normal"
              value={getFormValue(formData, key)}
              onChange={handleInputChange(key)}
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
              onChange={handleInputChange(key)}
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

  // Enhanced convertYaml function with better structure extraction
  const convertYaml = async (filePath) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filePath }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error converting YAML file');
      }
      
      const data = await response.json();
      console.log('Received converted data:', data);
      
      // Store the complete original structure
      setOriginalStructure(data);
      
      // Extract user-editable values for the form
      const extractedValues = {};
      
      // Enhanced extraction that handles both direct values and {value: "..."} format
      const extractUserValues = (obj, prefix = '') => {
        if (!obj || typeof obj !== 'object') return;
        
        Object.entries(obj).forEach(([key, value]) => {
          const fullKey = prefix ? `${prefix}.${key}` : key;
          
          // Skip schema-related keys
          if (['$id', '$schema', 'type'].includes(key)) return;
          
          // Handle passpoint-properties specially
          if (key === 'passpoint-properties') {
            extractUserValues(value, key);
            return;
          }
          
          if (value && typeof value === 'object') {
            if (Array.isArray(value)) {
              extractedValues[key] = [...value]; // Clone array
            } else if (value.hasOwnProperty('value')) {
              // Handle the {value: "..."} format
              extractedValues[key] = value.value;
            } else {
              extractUserValues(value, key); // Recurse into objects
            }
          } else if (value !== undefined) {
            extractedValues[key] = value; // Store primitive values
          }
        });
      };

      // Helper function to clean up field names
      const cleanFieldName = (fieldName) => {
        // Remove "Payload" prefix
        let cleanName = fieldName.replace(/^Payload/, '');
        
        // If removing Payload leaves an empty string, use the original
        if (!cleanName) {
          cleanName = fieldName;
        }
        
        // Convert PascalCase to kebab-case for consistency
        cleanName = cleanName.replace(/([A-Z])/g, (match, letter, index) => {
          return index === 0 ? letter.toLowerCase() : '-' + letter.toLowerCase();
        });
        
        return cleanName;
      };

      // NEW: Enhanced extraction for dynamic fields from the actual configuration data
      const extractAllFields = (obj, prefix = '', depth = 0) => {
        if (!obj || typeof obj !== 'object' || depth > 5) return; // Prevent deep recursion
        
        Object.entries(obj).forEach(([key, value]) => {
          // Clean the field name by removing "Payload" prefix
          const cleanedKey = cleanFieldName(key);
          const fullKey = prefix ? `${prefix}.${cleanedKey}` : cleanedKey;
          
          // Skip certain system/meta fields but allow configuration fields
          if (['$id', '$schema', 'type', 'success', 'fileType', 'obfuscationInfo', 'mappingInfo', 'yamlOutput', 'comprehensiveYaml', 'filteredYaml', 'jsonOutput'].includes(key)) return;
          
          if (value && typeof value === 'object') {
            if (Array.isArray(value)) {
              // Special handling for PayloadContent arrays - extract individual WiFi config fields
              if (cleanedKey === 'content' && value.length > 0) {
                value.forEach((item, index) => {
                  if (item && typeof item === 'object') {
                    // Extract individual fields from each payload item
                    extractAllFields(item, index > 0 ? `${fullKey}.${index}` : fullKey, depth + 1);
                  }
                });
              } else {
                // Handle other arrays - store as comma-separated values for editing
                if (value.every(item => typeof item === 'string' || typeof item === 'number')) {
                  extractedValues[fullKey] = value.join(', ');
                } else {
                  // Complex array - store as JSON string for now
                  extractedValues[fullKey] = JSON.stringify(value);
                }
              }
            } else if (value.hasOwnProperty('value')) {
              // Handle {value: "..."} format
              extractedValues[fullKey] = value.value;
            } else if (value.hasOwnProperty('type') && value.hasOwnProperty('description')) {
              // This looks like a schema definition with a value
              if (value.hasOwnProperty('value')) {
                extractedValues[fullKey] = value.value;
              }
            } else {
              // Recurse into nested objects
              extractAllFields(value, fullKey, depth + 1);
            }
          } else if (value !== undefined && value !== null && typeof value !== 'function') {
            // Store primitive values with cleaned field name
            extractedValues[fullKey] = value;
          }
        });
      };

      // Extract all fields dynamically from the actual parsed configuration data
      if (data.originalData) {
        // Use originalData which contains the actual parsed configuration
        console.log('Extracting from originalData:', data.originalData);
        extractAllFields(data.originalData);
      } else {
        // Fallback to extracting from the response data
        console.log('Extracting from response data (fallback):', data);
        extractAllFields(data);
      }
      
      // Ensure boilerplate fields exist even if not in the uploaded file
      const boilerplateFields = {
        'home-friendly-name': extractedValues['home-friendly-name'] || '',
        'home-domain': extractedValues['home-domain'] || '',
        'home-ois': extractedValues['home-ois'] || [],
        'roaming-consortiums': extractedValues['roaming-consortiums'] || [],
        'other-home-partner-fqdns': extractedValues['other-home-partner-fqdns'] || [],
        'preferred-roaming-partners': extractedValues['preferred-roaming-partners'] || []
      };

      // Merge boilerplate with extracted values, giving priority to extracted values
      const mergedValues = { ...boilerplateFields, ...extractedValues };
      
      console.log('Extracted all fields:', mergedValues);
      
      // Update form data with merged values
      setFormData(mergedValues);
      setUserModifiedValues({}); // Reset user modifications
      
      toast.success(`YAML file converted successfully! Found ${Object.keys(extractedValues).length} fields.`);
    } catch (err) {
      console.error('Error converting YAML:', err);
      setError(err.message || 'Failed to convert YAML file');
      toast.error('Failed to convert YAML file');
    } finally {
      setLoading(false);
    }
  };

  // Update or add these export functions
  const generateYaml = () => {
    try {
      // Start with the original structure or a blank object if none
      let exportData = originalStructure ? JSON.parse(JSON.stringify(originalStructure)) : {};
      
      // Apply user modifications to the structure based on the path
      Object.entries(userModifiedValues).forEach(([path, value]) => {
        // Handle different path structures
        const parts = path.split('.');
        
        // Handle passpoint-properties structure
        if (parts[0] === 'passpoint-properties') {
          if (parts.length === 3 && parts[2] === 'value') {
            // It's a property value in the passpoint-properties.fieldname.value structure
            const propertyName = parts[1];
            
            // Make sure the passpoint-properties object exists
            if (!exportData['passpoint-properties']) {
              exportData['passpoint-properties'] = {};
            }
            
            // Make sure the property exists
            if (!exportData['passpoint-properties'][propertyName]) {
              exportData['passpoint-properties'][propertyName] = {};
            }
            
            // Set the value while preserving other property attributes
            exportData['passpoint-properties'][propertyName].value = value;
          } else if (parts.length === 2) {
            // Direct property under passpoint-properties
            if (!exportData['passpoint-properties']) {
              exportData['passpoint-properties'] = {};
            }
            
            // Check if this property has a complex structure in the original data
            const propName = parts[1];
            const origProp = exportData['passpoint-properties'] && 
                            exportData['passpoint-properties'][propName];
            
            if (origProp && typeof origProp === 'object' && !Array.isArray(origProp)) {
              // Preserve structure but update value
              exportData['passpoint-properties'][propName].value = value;
            } else {
              // Simple direct update
              exportData['passpoint-properties'][propName] = value;
            }
          }
        }
        else if (parts.length > 1) {
          // Handle other nested paths
          let current = exportData;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) current[parts[i]] = {};
            current = current[parts[i]];
          }
          
          // Check if this property had a complex structure before
          const lastPart = parts[parts.length - 1];
          const origValue = current[lastPart];
          
          if (origValue && typeof origValue === 'object' && origValue.hasOwnProperty('value')) {
            // Preserve the structure but update the value
            current[lastPart].value = value;
          } else {
            // Simple update
            current[lastPart] = value;
          }
        } 
        else {
          // For simple top-level fields, check if they had complex structure
          const origValue = exportData[path];
          if (origValue && typeof origValue === 'object' && origValue.hasOwnProperty('value')) {
            // Preserve the structure but update the value
            exportData[path].value = value;
          } else {
            // Simple update
            exportData[path] = value;
          }
        }
      });
      
      // Also merge any array changes from formData into the structure
      ['home-ois', 'roaming-consortiums', 'other-home-partner-fqdns', 'preferred-roaming-partners'].forEach(arrayKey => {
        if (formData[arrayKey]) {
          exportData[arrayKey] = [...formData[arrayKey]];
        }
      });

      // NEW: Include all dynamic fields extracted from uploaded files
      const { dynamicFields } = categorizeFields();
      Object.entries(dynamicFields).forEach(([key, value]) => {
        // Add dynamic fields to export data
        exportData[key] = value;
      });
      
      console.log('Export data includes dynamic fields:', Object.keys(dynamicFields));
      
      // Convert to YAML
      const yamlContent = yaml.dump(exportData);
      
      // Create download link
      const blob = new Blob([yamlContent], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'passpoint_config.yml';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('YAML file downloaded successfully!');
    } catch (error) {
      console.error('Error generating YAML:', error);
      toast.error('Failed to generate YAML file');
    }
  };

  const generateJson = () => {
    try {
      // Use current form data directly as it's already in JSON format
      const jsonContent = JSON.stringify(formData, null, 2);
      
      // Create download link
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'updated_config.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('JSON file downloaded successfully!');
    } catch (error) {
      console.error('Error generating JSON:', error);
      toast.error('Failed to generate JSON file');
    }
  };

  // Function to open a new window with only YAML
  const viewYamlOnly = () => {
    // Create the same preview data structure as in the preview section
    let previewData = originalStructure ? 
      JSON.parse(JSON.stringify(originalStructure)) : 
      {
        "home-ois": [],
        "roaming-consortiums": [],
        "other-home-partner-fqdns": [],
        "preferred-roaming-partners": []
      };

    // Apply all the user modifications
    Object.entries(userModifiedValues).forEach(([path, value]) => {
      const parts = path.split('.');
      if (parts[0] === 'passpoint-properties' && parts.length === 3 && parts[2] === 'value') {
        const propertyName = parts[1];
        if (!previewData['passpoint-properties']) previewData['passpoint-properties'] = {};
        if (!previewData['passpoint-properties'][propertyName]) {
          previewData['passpoint-properties'][propertyName] = {};
        }
        previewData['passpoint-properties'][propertyName].value = value;
      } else {
        previewData[path] = value;
      }
    });
    
    // Add array data
    ['home-ois', 'roaming-consortiums', 'other-home-partner-fqdns', 'preferred-roaming-partners'].forEach(key => {
      if (formData[key]) previewData[key] = formData[key];
    });
    
    // Include all dynamic fields
    const { dynamicFields } = categorizeFields();
    Object.entries(dynamicFields).forEach(([key, value]) => {
      previewData[key] = value;
    });

    const yamlContent = yaml.dump(previewData, { indent: 2, lineWidth: 80, noRefs: true });
    const newWindow = window.open();
    newWindow.document.write(`
      <html>
        <head>
          <title>Passpoint YAML Configuration</title>
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
              white-space: pre-wrap;
            }
          </style>
        </head>
        <body>
          <h2>Passpoint Configuration YAML</h2>
          <pre>${yamlContent}</pre>
        </body>
      </html>
    `);
    newWindow.document.close();
  };

  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState(null);

  // Add handler for uploaded files
  const handleFileUploaded = (filePath, fileName) => {
    setUploadedFile(filePath);
    setUploadedFileName(fileName);
    // Automatically convert the uploaded file
    convertYaml(filePath);
  };

  return (
    <BrowserRouter>
      <div style={{ 
        backgroundColor: '#f5f5f5',
        minHeight: '100vh'
      }}>
        <ToastContainer position="top-right" autoClose={3000} />
        
        {/* Add navigation tabs */}
        <Navigation />
        
        {/* Add routes */}
        <Routes>
          <Route path="/" element={<PasspointProfileConverter />} />
          <Route path="/editor" element={
            <Container maxWidth="lg" sx={{ py: 4 }}>
              <Paper sx={{ 
                p: 3, 
                borderRadius: 2,
                boxShadow: '0px 2px 4px rgba(0,0,0,0.1)'
              }}>
                <Typography variant="h4" gutterBottom sx={{ color: '#1976d2' }}>
                  Passpoint Config Editor
                </Typography>
                <Typography variant="body1" paragraph>
                  Edit and create Passpoint configuration files interactively. Upload existing configurations to modify them, or create new ones from scratch using the form fields below.
                </Typography>
              
              {/* File uploader moved to the top */}
              <Box sx={{ mb: 3, mt: 2 }}>
                <FileUploader onFileUploaded={handleFileUploaded} />
                
                {uploadedFile && (
                  <Paper sx={{ p: 2, mt: 2, bgcolor: '#f0f7ff', borderLeft: '4px solid #1976d2' }}>
                    <Typography variant="body1">
                      Using uploaded file: <strong>{uploadedFileName}</strong>
                    </Typography>
                    <Button 
                      variant="contained" 
                      size="small"
                      sx={{ mt: 1 }}
                      onClick={() => convertYaml(uploadedFile)}
                    >
                      Convert Uploaded File
                    </Button>
                  </Paper>
                )}
              </Box>
              
              {loading ? (
                <CircularProgress />
              ) : error ? (
                <Alert severity="error">{error}</Alert>
              ) : (
                <>
                  <Box sx={{ mb: 3 }}>
                    {/* Show summary of extracted fields only after file upload */}
                    {uploadedFile && Object.keys(categorizeFields().dynamicFields).length > 0 && (
                      <Alert severity="info" sx={{ mb: 2 }}>
                        📊 Loaded configuration with {Object.keys(formData).length} total fields: 
                        {Object.keys(categorizeFields().dynamicFields).length} extracted from file + 
                        {Object.keys(categorizeFields().knownFields).length} standard fields
                      </Alert>
                    )}
                    
                    {/* Render dynamic fields from uploaded file first */}
                    {renderDynamicFields()}
                    
                    {/* Then render standard boilerplate fields */}
                    {renderFields()}
                  </Box>
    
                  <Paper 
                    sx={{ 
                      mt: 4, 
                      p: 2, 
                      whiteSpace: 'pre-wrap', 
                      backgroundColor: '#f6f6f6',
                      maxHeight: '300px',
                      overflow: 'auto'
                    }}
                  >
                    <Typography variant="subtitle1">YAML Preview</Typography>
                    <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.875rem' }}>
                      {yaml.dump(
                        // Create a preview that shows how the YAML structure will look
                        (() => {
                          // Start with the original structure or a blank object
                          let previewData = originalStructure ? 
                            JSON.parse(JSON.stringify(originalStructure)) : 
                            {
                              "home-ois": [],
                              "roaming-consortiums": [],
                              "other-home-partner-fqdns": [],
                              "preferred-roaming-partners": []
                            };
          
                          // Apply all the user modifications correctly
                          Object.entries(userModifiedValues).forEach(([path, value]) => {
                            const parts = path.split('.');
                            
                            // If this is a passpoint-properties nested value
                            if (parts[0] === 'passpoint-properties' && parts.length === 3 && parts[2] === 'value') {
                              const propertyName = parts[1];
                              
                              // Ensure path exists
                              if (!previewData['passpoint-properties']) previewData['passpoint-properties'] = {};
                              if (!previewData['passpoint-properties'][propertyName]) {
                              previewData['passpoint-properties'][propertyName] = {};
                            }
                            
                            previewData['passpoint-properties'][propertyName].value = value;
                          }
                          else if (parts.length > 1) {
                            // Handle other nested paths
                            let current = previewData;
                            for (let i = 0; i < parts.length - 1; i++) {
                              if (!current[parts[i]]) current[parts[i]] = {};
                              current = current[parts[i]];
                            }
                            current[parts[parts.length - 1]] = value;
                          }
                          else {
                            // For simple fields
                            previewData[path] = value;
                          }
                        });
                        
                        // Add array data
                        ['home-ois', 'roaming-consortiums', 'other-home-partner-fqdns', 'preferred-roaming-partners'].forEach(key => {
                          if (formData[key]) previewData[key] = formData[key];
                        });
                        
                        // Include all dynamic fields from uploaded file
                        const { dynamicFields } = categorizeFields();
                        Object.entries(dynamicFields).forEach(([key, value]) => {
                          previewData[key] = value;
                        });
                        
                        return previewData;
                      })(),
                      {
                        indent: 2,
                        lineWidth: 80,
                        noRefs: true
                      })}
                    </pre>
                  </Paper>

                  <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <Button variant="contained" color="primary" onClick={generateYaml}>
                      Download YAML
                    </Button>
                    <Button variant="contained" color="secondary" onClick={generateJson}>
                      Download JSON
                    </Button>
                    <Button variant="outlined" color="primary" onClick={viewYamlOnly}>
                      View YAML Only
                    </Button>
                  </Box>
                </>
              )}
              </Paper>
            </Container>
          } />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;

// This helper function gets a value at any depth in the object
const getNestedValue = (obj, path) => {
  const parts = path.split('.');
  let value = obj;
  
  for (const part of parts) {
    if (!value) return '';
    value = value[part];
  }
  
  return value !== undefined ? value : '';
};

// Add this helper function to ensure consistent form value population
const getFormValue = (dataObj, fieldPath) => {
  // Handle cases with nested paths
  if (fieldPath.includes('.')) {
    const parts = fieldPath.split('.');
    let current = dataObj;
    
    for (const part of parts) {
      if (!current) return '';
      current = current[part];
      
      // Check for value property
      if (current && typeof current === 'object' && current.hasOwnProperty('value')) {
        return current.value;
      }
    }
    return current !== undefined ? current : '';
  }
  
  // Handle top-level fields that might have value property
  const field = dataObj[fieldPath];
  if (field && typeof field === 'object' && field.hasOwnProperty('value')) {
    return field.value;
  }
  
  return dataObj[fieldPath] !== undefined ? dataObj[fieldPath] : '';
};

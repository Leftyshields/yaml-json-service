// public/src/FieldEditor.jsx
import React from 'react';
import {
  Box,
  Typography,
  TextField,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Grid,
} from '@mui/material';

function FieldEditor({ schema, data, onChange }) {
  if (!schema || !schema.properties) return null;

  const handleInputChange = (fieldName, fieldSpec, rawValue) => {
    let value = rawValue;

    // Handle arrays of strings
    if (fieldSpec.type === 'array' && fieldSpec.items?.type === 'string') {
      value = rawValue.split(',').map((v) => v.trim()).filter(Boolean);
    }

    // Handle arrays of objects (e.g., { oi: "value" })
    if (
      fieldSpec.type === 'array' &&
      fieldSpec.items?.type === 'object' &&
      fieldSpec.items?.properties?.oi
    ) {
      value = rawValue
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => ({ oi: v }));
    }

    // Update form data
    onChange({
      ...data,
      [fieldName]: value,
    });
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" gutterBottom>
        Config Editor
      </Typography>
      <Grid container spacing={2}>
        {Object.entries(schema.properties).map(([fieldName, fieldSpec]) => {
          const value = data[fieldName] || '';

          // Boolean field
          if (fieldSpec.type === 'boolean') {
            return (
              <Grid item xs={12} key={fieldName}>
                <FormGroup>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={Boolean(value)}
                        onChange={(e) =>
                          onChange({
                            ...data,
                            [fieldName]: e.target.checked,
                          })
                        }
                      />
                    }
                    label={fieldName}
                  />
                </FormGroup>
              </Grid>
            );
          }

          // All others
          return (
            <Grid item xs={12} md={6} key={fieldName}>
              <TextField
                fullWidth
                label={fieldName}
                value={
                  Array.isArray(value)
                    ? fieldSpec.items?.type === 'object'
                      ? value.map((v) => v.oi).join(', ')
                      : value.join(', ')
                    : value
                }
                onChange={(e) =>
                  handleInputChange(fieldName, fieldSpec, e.target.value)
                }
                helperText={fieldSpec.description || ''}
                type={fieldSpec.type === 'number' ? 'number' : 'text'}
              />
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}

export default FieldEditor;

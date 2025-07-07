# Passpoint Config Editor

A Node.js service that provides a web interface for creating and editing Passpoint configurations, with YAML/JSON conversion capabilities.

## Features

- Interactive web-based Passpoint configuration editor
- Form-based editing with specialized UI for complex fields
- YAML and JSON import/export with structure preservation
- JSON Schema validation
- Support for WBA Passpoint Profile Provisioning attributes
- Specialized UI components for Home OIs and Roaming Consortiums
- UTF-8 character support
- Automatic file conversion on upload
- Preserves original YAML structure when editing values
- Correctly handles nested object structures and value fields
- Real-time JSON preview of the current configuration
- **NEW: Passpoint Profile Converter tool for importing .mobileconfig and .xml files**

## Setup

1. Clone the repository:
```bash
git clone https://github.com/Leftyshields/yaml-json-service.git
cd yaml-json-service
```

2. Install dependencies:
```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd public
npm install
cd ..
```

## Running the Application

### Start the Backend Server

```bash
# From the project root directory
npm run dev
```

This will start the backend server on port 6001.

### Start the Frontend Development Server

```bash
# From the project root directory
cd public
npm run dev
```

This will start the Vite development server, typically on port 5173.

### Access the Application

- Frontend UI: http://localhost:5173
- Backend API: http://localhost:6001

## API Usage

Convert YAML to JSON:
```bash
curl -X POST http://localhost:6001/api/convert \
  -H "Content-Type: application/json" \
  -d '{"filePath": "src/config/sample.yml"}'
```

## Available YAML Schemas

1. `sample.yml` - Basic example configuration
2. `passpoint_rev0.yml` - WBA Passpoint Profile Provisioning schema following JSON Schema specification

## Project Structure
```
yaml-json-service/
├── src/                         # Backend code
│   ├── config/                  # YAML schema files
│   │   ├── sample.yml
│   │   └── passpoint_rev0.yml   # JSON Schema for Passpoint attributes
│   ├── routes/
│   │   └── yaml.routes.js
│   ├── services/
│   │   └── yaml.service.js
│   └── app.js
├── public/                      # Frontend code
│   ├── src/
│   │   ├── App.jsx              # Main React component
│   │   ├── components/
│   │   │   ├── FileUploader.jsx
│   │   │   └── PasspointProfileConverter.jsx  # New converter component
│   │   └── ...
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── package.json
```

## Configuration

### Backend Configuration

Edit `src/app.js` to update the CORS origins to match your hostname:
```javascript
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:6001', 'http://YOUR-HOSTNAME:6001'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
```

### Frontend Configuration

If your backend is running on a different host or port, update the API URL in the frontend code.

## Usage Guide

### Importing and Editing Files

1. Upload a YAML configuration file using the file uploader
2. The file will be automatically converted and loaded into the form
3. Edit values in the form as needed
4. The JSON preview will update in real-time to show the current configuration
5. Download the updated configuration as YAML or JSON

### Using the Passpoint Profile Converter

1. Navigate to the "Profile Converter" tab
2. Upload a legacy Passpoint configuration file (.mobileconfig or .xml)
3. The converter will automatically parse the file and extract Passpoint-related fields
4. The parsed data will be displayed in YAML format
5. You can copy the generated YAML or download it as a file
6. This YAML can then be imported into the main editor for further modification

### Structure Preservation

When editing an existing YAML file:
- The original structure of the file is preserved
- Only the specific values you modify are updated
- Complex structures (like objects with `value` fields) maintain their format
- Arrays and nested objects are correctly handled

### Special Field Types

- **Home OIs**: Specialized UI for entering and managing Home OIs with validation
- **Roaming Consortiums**: Dedicated interface for managing roaming consortium entries
- **Complex Objects**: Properly structured form inputs for nested object properties

## Development

### Building for Production

```bash
# Build the frontend
cd public
npm run build

# Copy frontend build to backend public directory (if needed)
cp -r dist/* ../public/

# Start the production server
cd ..
npm start
```

## Important Note

The default server configuration uses `sandbox-mac-mini` as the hostname. You'll need to update this in `src/app.js` to match your system's hostname or use `localhost` for local development.

## Version History

### v0.4
- Added Passpoint Profile Converter for importing legacy configurations
- Support for .mobileconfig (PLIST) format conversion
- Support for XML format conversion
- Automatic mapping of common Passpoint fields
- Tab navigation between editor and converter
- Integration with react-router-dom for page navigation

### v0.3
- Added structure preservation for YAML edits
- Implemented proper handling of nested object structures
- Added support for complex objects with value fields
- Added real-time JSON preview
- Automatic file conversion on upload
- Fixed form field mapping to maintain original structure

### v0.2
- Added specialized UI components for Home OIs and Roaming Consortiums
- Added JSON export functionality
- Added YAML export with schema preservation
- Added "View JSON Only" feature
- Improved UI layout and styling
- Fixed button rendering issues

### v0.1
- Initial release with basic YAML to JSON conversion
- Web interface for visualization
- JSON Schema validation

## License
This project is licensed under the MIT License. See the LICENSE file for more details.
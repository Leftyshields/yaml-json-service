# YAML to JSON Converter Service

A Node.js service that converts YAML files to JSON with a web interface for visualization.

## Features

- YAML to JSON conversion
- Web interface for easy interaction
- Pretty-printed JSON output
- Support for WBA Passpoint Profile Provisioning certificate attributes
- JSON Schema validation
- UTF-8 character support

## Setup

1. Clone the repository:
```bash
git clone https://github.com/Leftyshields/yaml-json-service.git
cd yaml-json-service
```

2. Install dependencies:
```bash
npm install
```

3. Update server configuration:
Edit `src/app.js` and update the CORS origins to match your hostname:
```javascript
app.use(cors({
  origin: ['http://localhost:6001', 'http://YOUR-HOSTNAME:6001'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
```

4. Start the server:
```bash
npm run dev
```

5. Access the web interface:
```
http://localhost:6001
```

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
├── src/
│   ├── config/
│   │   ├── sample.yml
│   │   └── passpoint_rev0.yml    # JSON Schema for Passpoint attributes
│   ├── routes/
│   │   └── yaml.routes.js
│   ├── services/
│   │   └── yaml.service.js
│   └── app.js
├── public/
│   ├── index.html
│   ├── style.css
│   └── script.js
└── package.json
```

## Important Note

The default server configuration uses `sandbox-mac-mini` as the hostname. You'll need to update this in `src/app.js` to match your system's hostname or use `localhost` for local development.

## License
This project is licensed under the MIT License. See the LICENSE file for more details.
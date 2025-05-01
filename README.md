# YAML to JSON Converter Service

A Node.js service that converts YAML files to JSON with a web interface for visualization.

## Features

- YAML to JSON conversion
- Web interface for easy interaction
- Pretty-printed JSON output
- Support for WBA Passpoint Profile Provisioning certificate attributes

## Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/yaml-json-service.git
cd yaml-json-service
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm run dev
```

4. Access the web interface:
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

## Project Structure
```
yaml-json-service/
├── src/
│   ├── config/
│   │   └── sample.yml
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
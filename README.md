# Passpoint Profile Converter

A comprehensive web application for editing Passpoint WiFi configurations and converting between various mobile configuration formats (.mobileconfig, .xml, .eap-config, etc.) to YAML/JSON with advanced certificate and password handling.

## ✨ Features

### Profile Converter
- **Multi-format Support**: Convert .mobileconfig, .xml, .eap-config, .yml/.yaml, .json, .txt/.conf/.cfg files
- **Smart Parsing**: Automatic detection and parsing of configuration formats
- **Certificate Handling**: Advanced certificate detection and display options:
  - **Preserve**: Show original certificate data
  - **Obfuscate**: Replace with `[CERTIFICATE DATA REDACTED]`
  - **Info**: Show certificate metadata only (subject, issuer, validity dates)
  - **Hash**: Show SHA-256 hash reference
  - **Truncate**: Show BEGIN/END markers only
  - **Base64**: Ensure certificates are in base64 format
- **Password Security**: Multiple obfuscation levels for sensitive data:
  - **None**: Show all data as-is
  - **Mask**: Replace with `***REDACTED***`
  - **Partial**: Show first/last 2 characters
  - **Length**: Show character count indicators
  - **Hash**: Show SHA-256 hash
  - **Base64**: Base64 encode passwords
- **Certificate Detection**: Automatic detection of X.509 certificates in various formats and nested structures
- **EAP/Passpoint Support**: Enhanced support for EAP configuration files with certificate detection under `_` properties
- **Real-time Processing**: Dynamic re-processing when certificate or password handling options change
- **Multi-tab View**: Switch between YAML, JSON, and original data views
- **Copy & Download**: One-click copy to clipboard and file downloads with HTTP fallback support



### Technical Features
- **Certificate Processing**: Backend certificate detection and transformation with metadata extraction
- **Automatic Cleanup**: Uploaded files are automatically cleaned up after processing
- **Multi-format Input**: Support for 15+ file formats including binary files
- **Security**: Non-root Docker containers, input sanitization, certificate data protection
- **Performance**: Multi-stage Docker builds, optimized frontend, efficient file processing
- **Monitoring**: Health checks, comprehensive logging, and WebSocket progress updates
- **HTTP Compatibility**: Clipboard functionality works on both HTTP and HTTPS with graceful fallbacks

## 🔧 Local access

When running locally (see Development Setup below):
- Frontend: http://localhost:5173
- Backend API: http://localhost:6001

## 🛠️ Development Setup

### Prerequisites
- **Node.js** 18+ 
- **Docker** (optional, for containerized development)

### Quick Start (Local Development)

```bash
# Clone the repository
git clone https://github.com/Leftyshields/yaml-json-service.git
cd yaml-json-service

# Install backend dependencies
npm install

# Install frontend dependencies  
cd public && npm install && cd ..

# Start backend server (Terminal 1)
npm run dev

# Start frontend dev server (Terminal 2)
cd public && npm run dev
```

**Access the application:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:6001
- Health Check: http://localhost:6001/health

### Docker Development Setup

```bash
# Build the Docker image
docker build -t yaml-json-service .

# Run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Access the containerized application:**
- Application: http://localhost:6001

## 🚢 Deployment

### TLS / HTTPS (production)

In production, do not rely on auto-generated self-signed credentials. Mount real TLS material and point the app at it:

- `TLS_CERT_PATH` — path to the server certificate (PEM)
- `TLS_KEY_PATH` — path to the private key (PEM)
- `ENABLE_HTTPS=true` — serve HTTPS instead of plain HTTP

Optional: `TLS_CERT_DIR` overrides the default runtime directory (`certs/`) used only when env paths are not set (local/dev self-signed fallback).

### Self-hosted Docker

There is no hosted demo and no GitHub Actions workflow in this repository that deploys to a cloud VM. Run the app on your own infrastructure using the included `Dockerfile` and `docker-compose.yml`.

**Build and run locally with Compose (production compose file):**

```bash
docker-compose up --build -d
```

By default the service listens on container port `6001` and is published on host port `80` (see `docker-compose.yml`). Adjust ports and environment variables as needed.

**Build, push, and run on a remote host:**

```bash
# Build and tag
docker build -t your-registry/yaml-json-service .

# Push to your registry (optional)
docker push your-registry/yaml-json-service

# On the server: pull and run (example)
docker pull your-registry/yaml-json-service
docker stop yaml-json-service 2>/dev/null || true
docker rm yaml-json-service 2>/dev/null || true
docker run -d \
  --name yaml-json-service \
  -p 80:6001 \
  --restart unless-stopped \
  -e NODE_ENV=production \
  your-registry/yaml-json-service
```

Set `TLS_CERT_PATH`, `TLS_KEY_PATH`, and `ENABLE_HTTPS=true` when serving HTTPS in production (see above). For day-to-day development, use the local URLs in **Local access** (`http://localhost:5173` frontend, `http://localhost:6001` backend).

## 🛡️ Security Considerations

1. **Certificate Handling**: Multiple display modes for X.509 certificates to protect sensitive data
2. **Password Obfuscation**: Configurable obfuscation levels for passwords and sensitive fields
3. **Docker Security**: Application runs as a non-root user in the container
4. **Input Validation**: File uploads are validated and sanitized before processing
5. **Automatic Cleanup**: Temporary files are removed after processing to prevent data leakage
6. **Data Protection**: Certificates and sensitive data are processed securely on the backend

## 📝 Troubleshooting

### Local development

- **Frontend not loading**: Confirm the Vite dev server is running (`cd public && npm run dev`) and open http://localhost:5173.
- **API errors**: Confirm the backend is running (`npm run dev`) and reachable at http://localhost:6001/health.
- **Port conflicts**: Change the dev server or `PORT` in `.env` if 5173 or 6001 is already in use.

### Docker / self-hosted

1. **Check container logs**
   ```bash
   docker logs yaml-json-service
   # or
   docker-compose logs -f yaml-json-service
   ```

2. **Verify health** (Compose with default port mapping)
   ```bash
   curl http://localhost/health
   # or, when using dev split stack:
   curl http://localhost:6001/health
   ```

3. **Restart**
   ```bash
   docker-compose restart yaml-json-service
   ```

4. **Common issues**
   - `Connection refused`: Confirm the container is running and the host port mapping matches your curl URL.
   - `Error pulling image`: Registry credentials or image name/tag may be wrong.
   - TLS errors in production: Ensure `TLS_CERT_PATH` and `TLS_KEY_PATH` point to valid PEM files and `ENABLE_HTTPS=true` is set.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

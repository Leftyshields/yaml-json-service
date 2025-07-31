# Passpoint Configuration Editor & Profile Converter

A comprehensive web application for editing Passpoint WiFi configurations and converting between various mobile configuration formats (.mobileconfig, .xml, .eap-config, etc.) to YAML/JSON with advanced certificate and password handling.

## ✨ Features

### Profile Converter
- **Multi-format Support**: Convert .mobileconfig, .xml, .eap-config, .docx, .json, .yml, .txt, .conf files
- **Smart Parsing**: Automatic detection and parsing of configuration formats including ZIP archives
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

### Configuration Editor  
- **Interactive Forms**: Dynamic form generation from YAML schema
- **Field Validation**: Real-time validation with helpful error messages
- **Export Options**: Download as YAML or JSON
- **File Upload**: Load existing configurations for editing
- **Schema-driven**: Flexible schema-based field rendering

### Technical Features
- **Certificate Processing**: Backend certificate detection and transformation with metadata extraction
- **Automatic Cleanup**: Uploaded files are automatically cleaned up after processing
- **Multi-format Input**: Support for 15+ file formats including binary and ZIP archives
- **Security**: Non-root Docker containers, input sanitization, certificate data protection
- **Performance**: Multi-stage Docker builds, optimized frontend, efficient file processing
- **Monitoring**: Health checks, comprehensive logging, and WebSocket progress updates
- **HTTP Compatibility**: Clipboard functionality works on both HTTP and HTTPS with graceful fallbacks

## 🔧 Live Demo

The application is deployed on Digital Ocean and available at:
- [http://your-droplet-ip](http://your-droplet-ip)

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

## 🚢 Deployment to Digital Ocean

### Method 1: Automated Deployment with GitHub Actions

1. **Create a Digital Ocean Droplet**
   - Create a new Ubuntu droplet
   - Install Docker and Docker Compose on the droplet using the provided setup script:
     ```bash
     ./scripts/setup-droplet.sh
     ```

2. **Set up GitHub Secrets**
   Go to your GitHub repository Settings > Secrets > Actions and add the following secrets:
   - `DOCKER_USERNAME`: Your Docker Hub username
   - `DOCKER_PASSWORD`: Your Docker Hub password
   - `DROPLET_IP`: The IP address of your Digital Ocean droplet
   - `SSH_USER`: SSH username (usually 'root')
   - `SSH_PRIVATE_KEY`: The private SSH key for accessing your droplet

3. **Configure GitHub Actions**
   - The workflow file is already configured in `.github/workflows/deploy.yml`
   - It will build the Docker image, push to Docker Hub, and deploy to your droplet
   - Commits to the main branch will automatically trigger deployment

4. **Initial Server Setup**
   Connect to your Digital Ocean server and prepare it:
   ```bash
   # Install Docker and Docker Compose
   curl -L https://raw.githubusercontent.com/Leftyshields/yaml-json-service/main/scripts/setup-droplet.sh > setup-droplet.sh
   chmod +x setup-droplet.sh
   ./setup-droplet.sh
   
   # Initialize the application
   curl -L https://raw.githubusercontent.com/Leftyshields/yaml-json-service/main/scripts/init-app.sh > init-app.sh
   chmod +x init-app.sh
   ./init-app.sh your-docker-username
   ```

### Method 2: Manual Deployment

```bash
# Run the deploy script locally
./deploy.sh
```

You'll need to set the following environment variables:
- `DIGITALOCEAN_ACCESS_TOKEN` or `DROPLET_IP`
- `DOCKER_USERNAME` and `DOCKER_PASSWORD` (for pushing to Docker Hub)
- `SSH_PRIVATE_KEY` (for connecting to your droplet)
- `SSH_USER` (usually 'root')

## 🛡️ Security Considerations

1. **Certificate Handling**: Multiple display modes for X.509 certificates to protect sensitive data
2. **Password Obfuscation**: Configurable obfuscation levels for passwords and sensitive fields
3. **Docker Security**: Application runs as a non-root user in the container
4. **Input Validation**: File uploads are validated and sanitized before processing
5. **Automatic Cleanup**: Temporary files are removed after processing to prevent data leakage
6. **Data Protection**: Certificates and sensitive data are processed securely on the backend

## 📝 Troubleshooting

If you encounter issues with the deployment:

1. **Check Docker Container Logs**
   ```bash
   docker logs yaml-json-service
   ```

2. **Verify the Application Health**
   ```bash
   curl http://localhost/health
   ```

3. **Restart the Container**
   ```bash
   docker-compose restart yaml-json-service
   ```

4. **Digital Ocean Specific Issues**
   - Ensure firewall is configured to allow port 80:
     ```bash
     ufw allow http
     ```
   - Check if Docker is running:
     ```bash
     systemctl status docker
     ```
   - Verify GitHub Actions secrets are correctly configured
   - Check SSH connection from GitHub Actions

5. **Common Deployment Errors**
   - `Permission denied (publickey)`: SSH key is not correctly configured
   - `No such file or directory`: Path issues on the droplet
   - `Error pulling image`: Docker Hub credentials incorrect
   - `Connection refused`: Firewall blocking traffic

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
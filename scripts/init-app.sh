#!/bin/bash

# This script initializes the Digital Ocean droplet with your Docker image
# It should be run after the setup-droplet.sh script

# Usage: ./init-app.sh <docker_username>

if [ -z "$1" ]; then
  echo "Usage: ./init-app.sh <docker_username>"
  echo "Example: ./init-app.sh leftyshields"
  exit 1
fi

DOCKER_USERNAME=$1

echo "Initializing YAML/JSON Service application..."

# Create application directory if it doesn't exist
mkdir -p /root/yaml-json-service
cd /root/yaml-json-service

# Create docker-compose.yml if it doesn't exist
if [ ! -f "docker-compose.yml" ]; then
  echo "Creating docker-compose.yml..."
  cat > docker-compose.yml << EOF
version: '3.8'

services:
  yaml-json-service:
    image: ${DOCKER_USERNAME}/yaml-json-service:latest
    container_name: yaml-json-service
    ports:
      - "80:6001"
    environment:
      - NODE_ENV=production
      - PORT=6001
    volumes:
      # Mount uploads directory for persistence
      - uploads_data:/app/src/config/uploads
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:6001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  uploads_data:
EOF
fi

# Pull the latest image
echo "Pulling latest Docker image..."
docker pull ${DOCKER_USERNAME}/yaml-json-service:latest

# Start the application
echo "Starting the application..."
docker-compose down
docker-compose up -d

# Check if the application is running
echo "Checking application status..."
sleep 5
docker ps

# Get application logs
echo "Application logs:"
docker-compose logs -f yaml-json-service

echo "Application initialized and running!"
echo "Your application should now be available at http://$(curl -s ifconfig.me)"

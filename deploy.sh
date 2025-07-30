#!/bin/bash

# Deployment script for Digital Ocean
echo "🚀 Starting deployment to Digital Ocean..."

# Environment variables (set these or use environment variables from CI/CD)
DIGITALOCEAN_ACCESS_TOKEN=${DIGITALOCEAN_ACCESS_TOKEN:-""}
DOCKER_USERNAME=${DOCKER_USERNAME:-""}
DOCKER_PASSWORD=${DOCKER_PASSWORD:-""}
DOCKER_IMAGE_NAME=${DOCKER_IMAGE_NAME:-"yaml-json-service"}
DOCKER_IMAGE_TAG=${DOCKER_IMAGE_TAG:-"latest"}
SSH_PRIVATE_KEY=${SSH_PRIVATE_KEY:-""}
DROPLET_IP=${DROPLET_IP:-""}
SSH_USER=${SSH_USER:-"root"}

# Verify required environment variables
if [ -z "$DIGITALOCEAN_ACCESS_TOKEN" ] && [ -z "$DROPLET_IP" ]; then
  echo "❌ ERROR: Either DIGITALOCEAN_ACCESS_TOKEN or DROPLET_IP must be provided."
  exit 1
fi

# Login to Docker Hub
if [ -n "$DOCKER_USERNAME" ] && [ -n "$DOCKER_PASSWORD" ]; then
  echo "🔑 Logging in to Docker Hub..."
  echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
fi

# Build the Docker image
echo "🏗️ Building Docker image..."
docker build -t $DOCKER_USERNAME/$DOCKER_IMAGE_NAME:$DOCKER_IMAGE_TAG .

# Push to Docker Hub if credentials were provided
if [ -n "$DOCKER_USERNAME" ] && [ -n "$DOCKER_PASSWORD" ]; then
  echo "� Pushing image to Docker Hub..."
  docker push $DOCKER_USERNAME/$DOCKER_IMAGE_NAME:$DOCKER_IMAGE_TAG
fi

# Deploy to Digital Ocean Droplet if IP is provided
if [ -n "$DROPLET_IP" ] && [ -n "$SSH_PRIVATE_KEY" ]; then
  echo "🚢 Deploying to Digital Ocean Droplet at $DROPLET_IP..."
  
  # Create a temporary SSH key file
  SSH_KEY_FILE=$(mktemp)
  echo "$SSH_PRIVATE_KEY" > $SSH_KEY_FILE
  chmod 600 $SSH_KEY_FILE
  
  # Copy docker-compose.yml to the server
  scp -i $SSH_KEY_FILE -o StrictHostKeyChecking=no docker-compose.yml $SSH_USER@$DROPLET_IP:/root/
  
  # Pull latest image and restart containers
  ssh -i $SSH_KEY_FILE -o StrictHostKeyChecking=no $SSH_USER@$DROPLET_IP << EOF
    cd /root
    docker pull $DOCKER_USERNAME/$DOCKER_IMAGE_NAME:$DOCKER_IMAGE_TAG
    docker-compose down
    docker-compose up -d
    docker system prune -f
EOF
  
  # Clean up
  rm $SSH_KEY_FILE
  
  echo "✅ Deployment complete!"
  echo "Your app should now be available at: http://$DROPLET_IP:6001"
else
  echo "⚠️ No Digital Ocean deployment performed - missing IP or SSH key."
fi

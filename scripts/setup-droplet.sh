#!/bin/bash

# This script helps set up a Digital Ocean droplet for running this application
# Run this script on your new Digital Ocean droplet

echo "Setting up Digital Ocean droplet for YAML/JSON Service..."

# Update system packages
echo "Updating system packages..."
apt-get update
apt-get upgrade -y

# Install required packages
echo "Installing required packages..."
apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git

# Install Docker
echo "Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker $(whoami)

# Install Docker Compose
echo "Installing Docker Compose..."
curl -L "https://github.com/docker/compose/releases/download/v2.20.3/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Create directory for application
echo "Creating application directory..."
mkdir -p /root/yaml-json-service
cd /root/yaml-json-service

# Setup firewall (allow only SSH and HTTP)
echo "Configuring firewall..."
ufw allow ssh
ufw allow http
ufw --force enable

# Setup basic monitoring
echo "Installing basic monitoring tools..."
apt-get install -y htop iotop

# Setup automatic updates
echo "Setting up automatic security updates..."
apt-get install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

echo "Installation complete!"
echo ""
echo "Next steps:"
echo "1. Copy your docker-compose.yml to this server"
echo "2. Pull your Docker image"
echo "3. Run 'docker-compose up -d' to start the application"
echo ""
echo "Your application will be available at http://YOUR_DROPLET_IP"

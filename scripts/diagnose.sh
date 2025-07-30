#!/bin/bash

# This script helps diagnose issues with a Digital Ocean droplet
# Copy this script to your Digital Ocean droplet and run it

echo "=== SYSTEM INFO ==="
echo "Date: $(date)"
uname -a
echo "Memory:"
free -h
echo "Disk:"
df -h

echo -e "\n=== DOCKER INFO ==="
echo "Docker version:"
docker --version
echo "Docker Compose version:"
docker-compose --version
echo "Docker status:"
systemctl status docker --no-pager | grep Active

echo -e "\n=== CONTAINER STATUS ==="
echo "All containers:"
docker ps -a
echo "Running containers:"
docker ps
echo "Container logs (last 50 lines):"
docker logs --tail 50 yaml-json-service 2>&1

echo -e "\n=== NETWORK INFO ==="
echo "Network interfaces:"
ip addr
echo "Listening ports:"
netstat -tulpn | grep LISTEN
echo "Firewall status:"
if command -v ufw &> /dev/null; then
    ufw status
else
    echo "UFW not installed"
fi

echo -e "\n=== APPLICATION TESTS ==="
echo "Testing local connectivity to application health endpoint:"
curl -v http://localhost:6001/health 2>&1
echo -e "\nTesting local connectivity on port 80:"
curl -v http://localhost:80 2>&1

echo -e "\n=== DOCKER COMPOSE CONFIG ==="
docker-compose config

echo -e "\nDiagnostic complete. Please share this output for troubleshooting."

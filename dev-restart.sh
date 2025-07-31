#!/bin/bash

# Restart development services script

echo "🔄 Restarting YAML-JSON Service Development Environment..."

# Stop services first
./dev-stop.sh

# Wait a moment
sleep 2

# Start services again
./dev-start.sh

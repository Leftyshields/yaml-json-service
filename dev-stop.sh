#!/bin/bash

# Stop development services script

echo "🛑 Stopping YAML-JSON Service Development Environment..."

# Read PIDs if they exist
if [ -f "logs/backend.pid" ]; then
    BACKEND_PID=$(cat logs/backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo "Stopping backend (PID: $BACKEND_PID)..."
        kill $BACKEND_PID
    fi
    rm -f logs/backend.pid
fi

if [ -f "logs/frontend.pid" ]; then
    FRONTEND_PID=$(cat logs/frontend.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "Stopping frontend (PID: $FRONTEND_PID)..."
        kill $FRONTEND_PID
    fi
    rm -f logs/frontend.pid
fi

# Fallback: kill any remaining processes
echo "🧹 Cleaning up any remaining processes..."
pkill -f "nodemon.*app.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "node.*app.js" 2>/dev/null || true

echo "✅ Development environment stopped"

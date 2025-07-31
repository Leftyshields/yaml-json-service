#!/bin/bash

# Development startup script - runs both backend and frontend locally
# This is faster than Docker for development iteration

echo "🚀 Starting YAML-JSON Service Development Environment..."
echo ""

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Function to check if port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null; then
        echo "⚠️  Port $1 is already in use. Please stop the process using this port."
        return 1
    fi
    return 0
}

# Check if required ports are available
echo "🔍 Checking if ports are available..."
if ! check_port 6001; then
    echo "Backend port 6001 is in use. Run: pkill -f 'node.*app.js' to stop backend"
    exit 1
fi

if ! check_port 5173; then
    echo "Frontend port 5173 is in use. Run: pkill -f 'vite' to stop frontend"
    exit 1
fi

echo "✅ Ports 6001 (backend) and 5173 (frontend) are available"
echo ""

# Install dependencies if node_modules don't exist
echo "📦 Checking dependencies..."

# Backend dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install
fi

# Frontend dependencies
if [ ! -d "public/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd public && npm install && cd ..
fi

echo "✅ Dependencies ready"
echo ""

# Create log directory
mkdir -p logs

# Start backend in background
echo "🔧 Starting backend server (Node.js/Express)..."
nohup npm run dev > logs/backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend started with PID: $BACKEND_PID"

# Wait a moment for backend to start
sleep 2

# Start frontend in background
echo "🎨 Starting frontend server (React/Vite)..."
cd public
nohup npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..
echo "Frontend started with PID: $FRONTEND_PID"

# Store PIDs for later cleanup
echo $BACKEND_PID > logs/backend.pid
echo $FRONTEND_PID > logs/frontend.pid

echo ""
echo "🎉 Development environment started successfully!"
echo ""
echo "📍 Access URLs:"
echo "   Frontend (React): http://localhost:5173"
echo "   Backend API:      http://localhost:6001"
echo "   API Health:       http://localhost:6001/health"
echo ""
echo "📋 Useful commands:"
echo "   Stop services:    ./dev-stop.sh (or npm run dev:stop)"
echo "   View logs:        ./dev-logs.sh (or npm run dev:logs)"
echo "   Restart:          ./dev-restart.sh (or npm run dev:restart)"
echo ""
echo "📊 Log files:"
echo "   Backend:  logs/backend.log"
echo "   Frontend: logs/frontend.log"
echo ""

# Wait a bit more and check if services are running
sleep 3
echo "🔍 Checking service status..."

if kill -0 $BACKEND_PID 2>/dev/null; then
    echo "✅ Backend is running"
else
    echo "❌ Backend failed to start - check logs/backend.log"
fi

if kill -0 $FRONTEND_PID 2>/dev/null; then
    echo "✅ Frontend is running"
else
    echo "❌ Frontend failed to start - check logs/frontend.log"
fi

echo ""
echo "Happy coding! 🚀"

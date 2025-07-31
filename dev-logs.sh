#!/bin/bash

# Show development logs script

echo "📊 Development Logs for YAML-JSON Service"
echo "=========================================="
echo ""

if [ "$1" = "backend" ]; then
    echo "🔧 Backend logs (last 50 lines):"
    echo "----------------------------------"
    tail -n 50 logs/backend.log 2>/dev/null || echo "No backend logs found"
elif [ "$1" = "frontend" ]; then
    echo "🎨 Frontend logs (last 50 lines):"
    echo "-----------------------------------"
    tail -n 50 logs/frontend.log 2>/dev/null || echo "No frontend logs found"
elif [ "$1" = "follow" ] || [ "$1" = "-f" ]; then
    echo "📡 Following logs (Ctrl+C to exit)..."
    echo "-------------------------------------"
    tail -f logs/backend.log logs/frontend.log 2>/dev/null
else
    echo "🔧 Backend logs (last 20 lines):"
    echo "----------------------------------"
    tail -n 20 logs/backend.log 2>/dev/null || echo "No backend logs found"
    echo ""
    echo "🎨 Frontend logs (last 20 lines):"
    echo "-----------------------------------"
    tail -n 20 logs/frontend.log 2>/dev/null || echo "No frontend logs found"
    echo ""
    echo "Usage:"
    echo "  ./dev-logs.sh          - Show both logs"
    echo "  ./dev-logs.sh backend  - Show only backend logs"
    echo "  ./dev-logs.sh frontend - Show only frontend logs"
    echo "  ./dev-logs.sh follow   - Follow logs in real-time"
fi

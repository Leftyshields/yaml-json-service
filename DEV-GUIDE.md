# Quick Development Guide

## 🚀 Fast Local Development (Recommended for iteration)

For fast development with hot reloading on your local machine:

```bash
# Start both backend and frontend (fastest option)
npm run dev:start
# OR
./dev-start.sh
```

This will:
- Start backend on http://localhost:6001
- Start frontend on http://localhost:5173
- Enable hot reloading for both
- Run in background with logs

### Development Commands

```bash
npm run dev:start     # Start both services
npm run dev:stop      # Stop both services
npm run dev:restart   # Restart both services
npm run dev:logs      # View logs from both services
```

### Log Management

```bash
./dev-logs.sh           # Show recent logs from both services
./dev-logs.sh backend   # Show only backend logs
./dev-logs.sh frontend  # Show only frontend logs
./dev-logs.sh follow    # Follow logs in real-time
```

---

## 🐳 Docker Development (For containerized environment)

For Docker-based development (slower but more isolated):

```bash
# Start with Docker (takes longer to build)
npm run docker:dev
```

### Docker Commands

```bash
npm run docker:dev            # Start Docker development environment
npm run docker:dev:detached   # Start in background
npm run docker:dev:stop       # Stop Docker environment
npm run docker:dev:logs       # View Docker logs
npm run docker:dev:restart    # Restart Docker containers
```

---

## 📊 Service URLs

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:6001
- **Health Check**: http://localhost:6001/health

---

## 🔧 Troubleshooting

### Ports in use
```bash
# Check what's using the ports
lsof -i :6001  # Backend port
lsof -i :5173  # Frontend port

# Kill processes if needed
npm run dev:stop  # or ./dev-stop.sh
```

### Missing dependencies
```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd public && npm install
```

### View logs
```bash
# Quick log check
npm run dev:logs

# Follow logs in real-time
./dev-logs.sh follow
```

---

## 💡 Development Tips

1. **Use local development** (`npm run dev:start`) for fastest iteration
2. **Use Docker** (`npm run docker:dev`) when you need environment isolation
3. **Check logs** if services don't start properly
4. **Hot reloading** works in both modes - edit files and see changes immediately

---

## 📁 File Structure

```
/
├── dev-start.sh           # Local development startup
├── dev-stop.sh            # Stop local development
├── dev-logs.sh            # View development logs
├── dev-restart.sh         # Restart local development
├── logs/                  # Development logs directory
├── docker-compose.dev.yml # Docker development config
├── src/                   # Backend source
└── public/                # Frontend source
```

# Docker Development Setup

This project includes Docker configurations for both development and production environments.

## Quick Start - Development

To run both the backend and frontend in development mode with hot reloading:

```bash
npm run docker:dev
```

This single command will:
- Build and start both backend (port 6001) and frontend (port 5173) services
- Enable hot reloading for both services
- Set up proper networking between services
- Mount source code for live editing

## Available Docker Commands

### Development
- `npm run docker:dev` - Start development environment (builds and runs both services)
- `npm run docker:dev:detached` - Start development environment in background
- `npm run docker:dev:stop` - Stop development environment
- `npm run docker:dev:logs` - View logs from all services
- `npm run docker:dev:restart` - Restart all services

### Production
- `npm run docker:prod` - Start production environment

## Access URLs

- **Frontend (React)**: http://localhost:5173
- **Backend API**: http://localhost:6001
- **API Health Check**: http://localhost:6001/health

## File Structure

```
/
├── docker-compose.yml          # Production configuration
├── docker-compose.dev.yml      # Development configuration
├── Dockerfile                  # Production Dockerfile
├── Dockerfile.dev             # Development Dockerfile
├── src/                       # Backend source code
└── public/                    # Frontend source code
```

## Development Features

- **Hot Reloading**: Both frontend and backend automatically reload on file changes
- **Live Editing**: Edit files locally and see changes immediately in Docker containers
- **Isolated Environment**: All dependencies run in containers
- **Easy Setup**: Single command to start entire development stack

## Troubleshooting

If you encounter issues:

1. **Stop all containers**: `npm run docker:dev:stop`
2. **Rebuild containers**: `npm run docker:dev`
3. **View logs**: `npm run docker:dev:logs`

## Manual Docker Commands

If you prefer using Docker commands directly:

```bash
# Development
docker-compose -f docker-compose.dev.yml up --build

# Production
docker-compose up --build
```

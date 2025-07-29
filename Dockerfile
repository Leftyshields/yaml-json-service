# Multi-stage build for Node.js application
FROM node:18-alpine AS base

# Set working directory
WORKDIR /app

# Copy package files for both backend and frontend
COPY package*.json ./
COPY public/package*.json ./public/

# Install backend dependencies
RUN npm ci --only=production

# Install frontend dependencies and copy source files
WORKDIR /app/public
RUN npm ci

# Copy frontend source code
COPY public/ ./

# Build frontend
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Create app directory
WORKDIR /app

# Copy backend dependencies
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package*.json ./

# Copy built frontend
COPY --from=base /app/public/dist ./public

# Copy backend source code
COPY src/ ./src/

# Create uploads directory with proper permissions
RUN mkdir -p src/config/uploads && \
    chmod 755 src/config/uploads

# Expose the port the app runs on
EXPOSE 6001

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 && \
    chown -R nextjs:nodejs /app

USER nextjs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:6001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "src/app.js"]

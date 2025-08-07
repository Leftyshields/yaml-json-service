#!/bin/bash

# YAML-JSON Service Monitoring Stack Startup Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    log_error "Docker is not running. Please start Docker first."
    exit 1
fi

log_info "🚀 Starting YAML-JSON Service Monitoring Stack..."

# Check if monitoring stack is already running
if docker-compose -f docker-compose.monitoring.yml ps | grep -q "Up"; then
    log_warning "Monitoring stack is already running. Stopping existing containers..."
    docker-compose -f docker-compose.monitoring.yml down
fi

# Start the monitoring stack
log_info "Starting services..."
docker-compose -f docker-compose.monitoring.yml up -d

# Wait for services to be ready
log_info "Waiting for services to be ready..."

# Wait for YAML-JSON service
for i in {1..30}; do
    if curl -s http://localhost:6001/health > /dev/null 2>&1; then
        log_success "YAML-JSON Service is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        log_error "YAML-JSON Service failed to start within 30 seconds"
        exit 1
    fi
    sleep 1
done

# Wait for Prometheus
for i in {1..30}; do
    if curl -s http://localhost:9090/-/ready > /dev/null 2>&1; then
        log_success "Prometheus is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        log_error "Prometheus failed to start within 30 seconds"
        exit 1
    fi
    sleep 1
done

# Wait for Grafana
for i in {1..30}; do
    if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        log_success "Grafana is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        log_error "Grafana failed to start within 30 seconds"
        exit 1
    fi
    sleep 1
done

# Display service URLs
echo ""
log_success "🎉 Monitoring stack is ready!"
echo ""
echo "📊 Service URLs:"
echo "  • YAML-JSON Service: http://localhost:6001"
echo "  • YAML-JSON Health: http://localhost:6001/health"
echo "  • YAML-JSON Metrics: http://localhost:6001/metrics"
echo "  • Prometheus: http://localhost:9090"
echo "  • Grafana: http://localhost:3000 (admin/admin)"
echo "  • Node Exporter: http://localhost:9101"
echo ""
echo "📈 Grafana Dashboards:"
echo "  • YAML-JSON Service Dashboard: http://localhost:3000/d/yaml-json-service"
echo ""
echo "🔧 Useful Commands:"
echo "  • View logs: docker-compose -f docker-compose.monitoring.yml logs -f"
echo "  • Stop stack: docker-compose -f docker-compose.monitoring.yml down"
echo "  • Restart stack: docker-compose -f docker-compose.monitoring.yml restart"
echo ""

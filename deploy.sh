#!/bin/bash

# Enhanced Deployment script with comprehensive testing
echo "🚀 Starting YAML-JSON Service deployment with comprehensive testing..."

# Set strict error handling
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
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

# Function to run comprehensive tests
run_comprehensive_tests() {
    log_info "Running comprehensive test suite before deployment..."
    
    # Check if development server is running
    if ! curl -s http://localhost:6001/health > /dev/null 2>&1; then
        log_warning "Development server not running, starting it for testing..."
        ./dev-start.sh
        
        # Wait for server to be ready
        for i in {1..30}; do
            if curl -s http://localhost:6001/health > /dev/null 2>&1; then
                log_success "Development server is ready"
                break
            fi
            if [ $i -eq 30 ]; then
                log_error "Development server failed to start within 30 seconds"
                exit 1
            fi
            sleep 1
        done
    else
        log_success "Development server is already running"
    fi
    
    # Run comprehensive test suite
    log_info "Executing comprehensive validation tests..."
    if node comprehensive-validation-test.js; then
        log_success "All comprehensive tests passed! ✨"
    else
        log_error "Comprehensive tests FAILED! Deployment blocked."
        log_error "Please fix test failures before deploying to production."
        exit 1
    fi
}

# Function to validate test files
validate_test_environment() {
    log_info "Validating test environment..."
    
    # Check if test files exist
    if [ ! -d "test-files" ]; then
        log_error "test-files directory not found!"
        exit 1
    fi
    
    # Check if test script exists
    if [ ! -f "comprehensive-validation-test.js" ]; then
        log_error "comprehensive-validation-test.js not found!"
        exit 1
    fi
    
    # Check if we have test files
    file_count=$(find test-files -name "*" -type f | wc -l)
    if [ $file_count -eq 0 ]; then
        log_error "No test files found in test-files directory!"
        exit 1
    fi
    
    log_success "Test environment validated ($file_count test files found)"
}

# Environment variables (set these or use environment variables from CI/CD)
DIGITALOCEAN_ACCESS_TOKEN=${DIGITALOCEAN_ACCESS_TOKEN:-""}
DOCKER_USERNAME=${DOCKER_USERNAME:-""}
DOCKER_PASSWORD=${DOCKER_PASSWORD:-""}
DOCKER_IMAGE_NAME=${DOCKER_IMAGE_NAME:-"yaml-json-service"}
DOCKER_IMAGE_TAG=${DOCKER_IMAGE_TAG:-"latest"}
SSH_PRIVATE_KEY=${SSH_PRIVATE_KEY:-""}
DROPLET_IP=${DROPLET_IP:-""}
SSH_USER=${SSH_USER:-"root"}

# STEP 1: Validate test environment and run comprehensive tests
log_info "🧪 STEP 1: Running comprehensive test suite..."
validate_test_environment
run_comprehensive_tests

log_success "All tests passed! Proceeding with deployment..."

# STEP 2: Verify deployment configuration
log_info "🔧 STEP 2: Verifying deployment configuration..."

# Verify required environment variables
if [ -z "$DIGITALOCEAN_ACCESS_TOKEN" ] && [ -z "$DROPLET_IP" ]; then
  log_error "Either DIGITALOCEAN_ACCESS_TOKEN or DROPLET_IP must be provided."
  exit 1
fi

# STEP 3: Build and push Docker image
log_info "🏗️ STEP 3: Building and pushing Docker image..."

# Login to Docker Hub
if [ -n "$DOCKER_USERNAME" ] && [ -n "$DOCKER_PASSWORD" ]; then
  log_info "Logging in to Docker Hub..."
  echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
  log_success "Docker Hub login successful"
fi

# Build the Docker image
log_info "Building Docker image: $DOCKER_USERNAME/$DOCKER_IMAGE_NAME:$DOCKER_IMAGE_TAG"
if docker build -t $DOCKER_USERNAME/$DOCKER_IMAGE_NAME:$DOCKER_IMAGE_TAG .; then
  log_success "Docker image built successfully"
else
  log_error "Docker build failed!"
  exit 1
fi

# Push to Docker Hub if credentials were provided
if [ -n "$DOCKER_USERNAME" ] && [ -n "$DOCKER_PASSWORD" ]; then
  log_info "Pushing image to Docker Hub..."
  if docker push $DOCKER_USERNAME/$DOCKER_IMAGE_NAME:$DOCKER_IMAGE_TAG; then
    log_success "Image pushed to Docker Hub successfully"
  else
    log_error "Docker push failed!"
    exit 1
  fi
fi

# STEP 4: Deploy to production
if [ -n "$DROPLET_IP" ] && [ -n "$SSH_PRIVATE_KEY" ]; then
  log_info "🚢 STEP 4: Deploying to Digital Ocean Droplet at $DROPLET_IP..."
  
  # Create a temporary SSH key file
  SSH_KEY_FILE=$(mktemp)
  echo "$SSH_PRIVATE_KEY" > $SSH_KEY_FILE
  chmod 600 $SSH_KEY_FILE
  
  log_info "Copying docker-compose.yml to server..."
  if scp -i $SSH_KEY_FILE -o StrictHostKeyChecking=no docker-compose.yml $SSH_USER@$DROPLET_IP:/root/; then
    log_success "docker-compose.yml copied successfully"
  else
    log_error "Failed to copy docker-compose.yml to server"
    rm $SSH_KEY_FILE
    exit 1
  fi
  
  log_info "Pulling latest image and restarting containers..."
  if ssh -i $SSH_KEY_FILE -o StrictHostKeyChecking=no $SSH_USER@$DROPLET_IP << EOF
    cd /root
    docker pull $DOCKER_USERNAME/$DOCKER_IMAGE_NAME:$DOCKER_IMAGE_TAG
    docker-compose down
    docker-compose up -d
    docker system prune -f
EOF
  then
    log_success "Container deployment successful"
  else
    log_error "Container deployment failed"
    rm $SSH_KEY_FILE
    exit 1
  fi
  
  # Clean up
  rm $SSH_KEY_FILE
  
  log_success "🎉 DEPLOYMENT COMPLETE!"
  log_success "Your app is now available at: http://$DROPLET_IP:6001"
  log_info "Health check: http://$DROPLET_IP:6001/health"
else
  log_warning "No Digital Ocean deployment performed - missing IP or SSH key."
  log_info "Docker image has been built and pushed successfully."
fi

# Final summary
echo ""
log_success "📊 Deployment Summary:"
log_info "✅ Comprehensive tests: PASSED (100% success rate)"
log_info "✅ Docker image: Built and pushed"
if [ -n "$DROPLET_IP" ] && [ -n "$SSH_PRIVATE_KEY" ]; then
  log_info "✅ Production deployment: SUCCESSFUL"
else
  log_info "⚠️  Production deployment: SKIPPED (manual Docker build only)"
fi
echo ""
log_success "🚀 YAML-JSON Service deployment process complete!"

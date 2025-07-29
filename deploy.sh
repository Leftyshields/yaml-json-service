#!/bin/bash

# Deployment script for Firebase
echo "🚀 Starting Firebase deployment..."

# Build the frontend
echo "📦 Building frontend..."
cd public && npm run build && cd ..

# Install dependencies for Firebase functions
echo "📦 Installing Firebase functions dependencies..."
npm install firebase-functions firebase-admin

# Deploy to Firebase
echo "🔥 Deploying to Firebase..."
firebase deploy

echo "✅ Deployment complete!"
echo "Your app should now be available at: https://your-project-id.web.app"

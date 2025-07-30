/**
 * Configuration for the frontend application
 * This provides environment-specific settings
 */

// Determine API base URL based on environment
const getApiBaseUrl = () => {
  // For production, use relative URLs (served by the same origin)
  if (import.meta.env.PROD) {
    return '';
  }
  
  // For development, use the proxy configured in vite.config.js
  return '';
};

export const API_BASE_URL = getApiBaseUrl();

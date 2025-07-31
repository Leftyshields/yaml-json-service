// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': process.env.NODE_ENV === 'development' && process.env.DOCKER_ENV 
        ? 'http://backend:6001'  // Docker service name
        : 'http://localhost:6001' // Local development
    }
  }
});

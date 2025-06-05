const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const yamlRoutes = require('./routes/yaml.routes');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:6001'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Serve static files
app.use(express.static('public'));

// Basic health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Add console logging to debug the upload route
app.use('/api', (req, res, next) => {
  console.log(`API Request: ${req.method} ${req.path}`);
  next();
}, yamlRoutes);

const PORT = process.env.PORT || 6001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
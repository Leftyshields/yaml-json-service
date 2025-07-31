// Test script to simulate Firebase Functions upload
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Set Firebase Functions environment
process.env.FUNCTION_TARGET = 'app';

// Import the routes
const yamlRoutes = require('./src/routes/yaml.routes');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

app.use('/api', yamlRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = 6002;
app.listen(PORT, () => {
  console.log(`Test Firebase Functions server running on http://localhost:${PORT}`);
});

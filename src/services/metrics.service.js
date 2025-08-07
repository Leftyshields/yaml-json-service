const promClient = require('prom-client');

// Create a Registry to register the metrics
const register = new promClient.Registry();

// Enable the collection of default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics for the YAML-JSON service
const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const fileUploadTotal = new promClient.Counter({
  name: 'file_uploads_total',
  help: 'Total number of file uploads',
  labelNames: ['file_type', 'status']
});

const fileConversionTotal = new promClient.Counter({
  name: 'file_conversions_total',
  help: 'Total number of file conversions',
  labelNames: ['file_type', 'conversion_type', 'status']
});

const conversionDurationSeconds = new promClient.Histogram({
  name: 'conversion_duration_seconds',
  help: 'Duration of file conversions in seconds',
  labelNames: ['file_type', 'conversion_type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active WebSocket connections'
});

const errorTotal = new promClient.Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['error_type', 'route']
});

const certificateProcessingTotal = new promClient.Counter({
  name: 'certificate_processing_total',
  help: 'Total number of certificate processing operations',
  labelNames: ['operation_type', 'status']
});

const passwordObfuscationTotal = new promClient.Counter({
  name: 'password_obfuscation_total',
  help: 'Total number of password obfuscation operations',
  labelNames: ['obfuscation_level', 'status']
});

// Register all metrics
register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(httpRequestTotal);
register.registerMetric(fileUploadTotal);
register.registerMetric(fileConversionTotal);
register.registerMetric(conversionDurationSeconds);
register.registerMetric(activeConnections);
register.registerMetric(errorTotal);
register.registerMetric(certificateProcessingTotal);
register.registerMetric(passwordObfuscationTotal);

// Middleware to track HTTP requests
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    
    httpRequestDurationMicroseconds
      .labels(req.method, route, res.statusCode)
      .observe(duration);
    
    httpRequestTotal
      .labels(req.method, route, res.statusCode)
      .inc();
  });
  
  next();
};

// Helper functions for tracking specific metrics
const trackFileUpload = (fileType, status) => {
  fileUploadTotal.labels(fileType, status).inc();
};

const trackFileConversion = (fileType, conversionType, status) => {
  fileConversionTotal.labels(fileType, conversionType, status).inc();
};

const trackConversionDuration = (fileType, conversionType, duration) => {
  conversionDurationSeconds.labels(fileType, conversionType).observe(duration);
};

const trackError = (errorType, route) => {
  errorTotal.labels(errorType, route).inc();
};

const trackCertificateProcessing = (operationType, status) => {
  certificateProcessingTotal.labels(operationType, status).inc();
};

const trackPasswordObfuscation = (obfuscationLevel, status) => {
  passwordObfuscationTotal.labels(obfuscationLevel, status).inc();
};

const updateActiveConnections = (count) => {
  activeConnections.set(count);
};

// Metrics endpoint
const getMetrics = async () => {
  return await register.metrics();
};

module.exports = {
  register,
  metricsMiddleware,
  trackFileUpload,
  trackFileConversion,
  trackConversionDuration,
  trackError,
  trackCertificateProcessing,
  trackPasswordObfuscation,
  updateActiveConnections,
  getMetrics
};

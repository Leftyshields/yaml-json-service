# YAML-JSON Service Monitoring

This document describes the monitoring setup for the YAML-JSON Service using Prometheus and Grafana.

## 🎯 Overview

The monitoring stack provides comprehensive observability for the YAML-JSON Service, including:

- **Application Metrics**: Request rates, response times, error rates
- **Business Metrics**: File uploads, conversions, certificate processing
- **System Metrics**: CPU, memory, disk usage
- **Custom Metrics**: WebSocket connections, password obfuscation operations

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   YAML-JSON     │    │   Prometheus    │    │     Grafana     │
│    Service      │    │                 │    │                 │
│                 │    │                 │    │                 │
│ • /metrics      │───▶│ • Scrapes       │───▶│ • Dashboards    │
│ • /health       │    │ • Stores        │    │ • Alerts        │
│ • Business      │    │ • Queries       │    │ • Visualization │
│   metrics       │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Node Exporter │    │   Alert Manager │    │   WebSocket     │
│                 │    │                 │    │   Connections   │
│ • System        │    │ • Notifications │    │ • Real-time     │
│   metrics       │    │ • Escalation    │    │   monitoring    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Ports 6001, 9090, 3000, 9101 available

### Start Monitoring Stack

```bash
# Start the complete monitoring stack
./start-monitoring.sh

# Or manually with Docker Compose
docker-compose -f docker-compose.monitoring.yml up -d
```

### Access Services

- **YAML-JSON Service**: http://localhost:6001
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin)
- **Node Exporter**: http://localhost:9101

## 📊 Metrics

### Application Metrics

#### HTTP Metrics
- `http_requests_total`: Total number of HTTP requests
- `http_request_duration_seconds`: Request duration histogram
- `errors_total`: Total number of errors by type and route

#### Business Metrics
- `file_uploads_total`: File uploads by type and status
- `file_conversions_total`: File conversions by type and status
- `conversion_duration_seconds`: Conversion duration histogram
- `certificate_processing_total`: Certificate processing operations
- `password_obfuscation_total`: Password obfuscation operations
- `active_connections`: Active WebSocket connections

#### System Metrics
- `node_cpu_seconds_total`: CPU usage
- `node_memory_MemAvailable_bytes`: Available memory
- `node_filesystem_avail_bytes`: Disk space
- `node_network_receive_bytes_total`: Network receive
- `node_network_transmit_bytes_total`: Network transmit

### Custom Metrics Examples

#### File Upload Rate
```promql
rate(file_uploads_total[5m])
```

#### 95th Percentile Response Time
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

#### Error Rate
```promql
rate(errors_total[5m])
```

#### Conversion Success Rate
```promql
rate(file_conversions_total{status="success"}[5m]) / rate(file_conversions_total[5m])
```

## 📈 Grafana Dashboards

### YAML-JSON Service Dashboard

**URL**: http://localhost:3000/d/yaml-json-service

**Panels**:
1. **Request Rate**: HTTP requests per second by method and route
2. **Response Time**: 95th and 50th percentile response times
3. **File Upload Rate**: File uploads per second by type
4. **File Conversion Rate**: File conversions per second by type
5. **Error Rate**: Errors per second by type and route
6. **Active WebSocket Connections**: Real-time connection count
7. **5xx Error Rate**: Server error rate
8. **95th Percentile Conversion Time**: Conversion performance

### System Dashboard

**URL**: http://localhost:3000/d/node-exporter

**Panels**:
1. **CPU Usage**: CPU utilization over time
2. **Memory Usage**: Memory consumption
3. **Disk Usage**: Disk space utilization
4. **Network Traffic**: Network I/O
5. **System Load**: System load average

## 🔧 Configuration

### Prometheus Configuration

**File**: `../monitoring/prometheus/prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'yaml-json-service'
    static_configs:
      - targets: ['yaml-json-service:6001']
    metrics_path: '/metrics'
    scrape_interval: 30s
    scrape_timeout: 10s
```

### Grafana Configuration

**File**: `../monitoring/grafana/provisioning/dashboards/dashboards.yml`

```yaml
apiVersion: 1

providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    editable: true
    options:
      path: /etc/grafana/provisioning/dashboards
```

## 🚨 Alerts

### Pre-configured Alerts

1. **High Error Rate**
   - Condition: Error rate > 5% for 5 minutes
   - Severity: Warning

2. **High Response Time**
   - Condition: 95th percentile response time > 2s for 5 minutes
   - Severity: Warning

3. **Service Down**
   - Condition: Service health check fails for 1 minute
   - Severity: Critical

4. **High CPU Usage**
   - Condition: CPU usage > 80% for 5 minutes
   - Severity: Warning

5. **Low Disk Space**
   - Condition: Available disk space < 10%
   - Severity: Warning

### Adding Custom Alerts

1. **Create Alert Rule**
   ```yaml
   groups:
   - name: yaml-json-service
     rules:
     - alert: HighConversionFailureRate
       expr: rate(file_conversions_total{status="error"}[5m]) > 0.1
       for: 5m
       labels:
         severity: warning
       annotations:
         summary: "High conversion failure rate"
         description: "Conversion failure rate is {{ $value }}"
   ```

2. **Configure Notification Channels**
   - Email
   - Slack
   - PagerDuty
   - Webhook

## 🔍 Troubleshooting

### Common Issues

#### Service Not Starting
```bash
# Check service logs
docker-compose -f docker-compose.monitoring.yml logs yaml-json-service

# Check service health
curl http://localhost:6001/health
```

#### Metrics Not Appearing
```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Check metrics endpoint
curl http://localhost:6001/metrics
```

#### Grafana Dashboard Issues
```bash
# Check Grafana logs
docker-compose -f docker-compose.monitoring.yml logs grafana

# Check datasource configuration
curl http://localhost:3000/api/datasources
```

### Debug Commands

```bash
# View all container logs
docker-compose -f docker-compose.monitoring.yml logs -f

# Check container status
docker-compose -f docker-compose.monitoring.yml ps

# Restart specific service
docker-compose -f docker-compose.monitoring.yml restart yaml-json-service

# Access container shell
docker-compose -f docker-compose.monitoring.yml exec yaml-json-service sh
```

## 📚 Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Node Exporter Documentation](https://github.com/prometheus/node_exporter)
- [Prometheus Query Language](https://prometheus.io/docs/prometheus/latest/querying/)

## 🔄 Maintenance

### Backup

```bash
# Backup Prometheus data
docker run --rm -v prometheus_data:/data -v $(pwd):/backup alpine tar czf /backup/prometheus_backup.tar.gz -C /data .

# Backup Grafana data
docker run --rm -v grafana_data:/data -v $(pwd):/backup alpine tar czf /backup/grafana_backup.tar.gz -C /data .
```

### Updates

```bash
# Update monitoring stack
docker-compose -f docker-compose.monitoring.yml pull
docker-compose -f docker-compose.monitoring.yml up -d

# Update YAML-JSON service
docker-compose -f docker-compose.monitoring.yml build yaml-json-service
docker-compose -f docker-compose.monitoring.yml up -d yaml-json-service
```

### Cleanup

```bash
# Stop and remove all containers
docker-compose -f docker-compose.monitoring.yml down

# Remove volumes (WARNING: This will delete all data)
docker-compose -f docker-compose.monitoring.yml down -v
```

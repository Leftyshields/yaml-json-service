# Digital Ocean Deployment Checklist

## Server Configuration
- [x] Application set to listen on `0.0.0.0` instead of just localhost
- [x] Application explicitly listening on PORT env variable
- [x] CORS configured correctly to allow Digital Ocean domains
- [x] Root route handler provides basic information
- [x] Health check endpoint working

## Docker Configuration
- [x] Dockerfile exposes correct port (6001)
- [x] docker-compose.yml maps port 80 to 6001
- [x] Container has proper healthcheck
- [x] Persistent volume for uploads
- [x] Proper logging configuration

## Digital Ocean Setup
- [ ] Droplet has sufficient resources (recommended: 1GB RAM, 1 CPU)
- [ ] Docker and Docker Compose installed
- [ ] Firewall configured to allow HTTP/HTTPS
- [ ] Domain name pointed to droplet IP (if using custom domain)
- [ ] SSL certificate configured (if using HTTPS)

## GitHub Actions CI/CD
- [x] Workflow file properly configured
- [x] Docker Hub credentials stored as secrets
- [x] SSH key stored as secret
- [x] Droplet IP stored as secret
- [x] Tests run before deployment

## Monitoring & Maintenance
- [ ] Regular backups of persistent data
- [ ] Monitoring for application health
- [ ] Log rotation configured
- [ ] Regular security updates

## Troubleshooting
If you encounter issues with the deployment:
1. Run the diagnostic script: `scripts/diagnose.sh`
2. Check container logs: `docker logs yaml-json-service`
3. Verify the application is listening on the correct port
4. Check that the firewall allows HTTP traffic
5. Ensure your domain's DNS records are pointing to the correct IP

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:6001';

// Test data
const testYamlContent = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: test-config
data:
  key1: value1
  key2: value2
  password: secret123
  certificate: |
    -----BEGIN CERTIFICATE-----
    MIIDXTCCAkWgAwIBAgIJAKoK8pZqkqkqkMA0GCSqGSIb3DQEBCwUAMEUxCzAJ
    BgNVBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRl
    cm5ldCBXaWRnaXRzIFB0eSBMdGQwHhcNMTkwMTAxMDAwMDAwWhcNMjAwMTAx
    MDAwMDAwWjBFMQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEh
    MB8GA1UECgwYSW50ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG
    9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
    -----END CERTIFICATE-----
`;

const testEapConfigContent = `<?xml version="1.0" encoding="UTF-8"?>
<EAPIdentityProviderList xmlns="http://www.apple.com/profiles/EAP/v1">
  <EAPIdentityProvider>
    <EAPIdentityProviderID>test-provider</EAPIdentityProviderID>
    <EAPIdentityProviderName>Test Provider</EAPIdentityProviderName>
    <EAPIdentityProviderType>PEAP</EAPIdentityProviderType>
    <EAPIdentityProviderUsername>testuser</EAPIdentityProviderUsername>
    <EAPIdentityProviderPassword>testpass123</EAPIdentityProviderPassword>
  </EAPIdentityProvider>
</EAPIdentityProviderList>`;

async function testHealthEndpoint() {
    console.log('🔍 Testing health endpoint...');
    try {
        const response = await axios.get(`${BASE_URL}/health`);
        console.log('✅ Health check passed:', response.data.status);
    } catch (error) {
        console.log('❌ Health check failed:', error.message);
    }
}

async function testMetricsEndpoint() {
    console.log('📊 Testing metrics endpoint...');
    try {
        const response = await axios.get(`${BASE_URL}/metrics`);
        console.log('✅ Metrics endpoint working, length:', response.data.length);
    } catch (error) {
        console.log('❌ Metrics endpoint failed:', error.message);
    }
}

async function testFileUpload(fileContent, filename, fileType) {
    console.log(`📁 Testing file upload: ${filename} (${fileType})`);
    try {
        const formData = new FormData();
        formData.append('yamlFile', Buffer.from(fileContent), {
            filename: filename,
            contentType: 'application/octet-stream'
        });
        formData.append('obfuscationLevel', 'mask');
        formData.append('certHandling', 'hash');

        const response = await axios.post(`${BASE_URL}/api/upload-and-convert`, formData, {
            headers: {
                ...formData.getHeaders(),
            },
            timeout: 10000
        });

        console.log(`✅ File upload successful: ${filename}`);
        return true;
    } catch (error) {
        console.log(`❌ File upload failed: ${filename} - ${error.message}`);
        return false;
    }
}

async function testErrorScenarios() {
    console.log('🚨 Testing error scenarios...');
    
    // Test invalid file upload
    try {
        const formData = new FormData();
        formData.append('yamlFile', Buffer.from('invalid content'), {
            filename: 'invalid.txt',
            contentType: 'text/plain'
        });

        await axios.post(`${BASE_URL}/api/upload-and-convert`, formData, {
            headers: {
                ...formData.getHeaders(),
            },
            timeout: 5000
        });
    } catch (error) {
        console.log('✅ Expected error caught:', error.response?.status || error.message);
    }

    // Test missing file
    try {
        const formData = new FormData();
        await axios.post(`${BASE_URL}/api/upload-and-convert`, formData, {
            headers: {
                ...formData.getHeaders(),
            },
            timeout: 5000
        });
    } catch (error) {
        console.log('✅ Expected error caught (no file):', error.response?.status || error.message);
    }
}

async function testWebSocketConnection() {
    console.log('🔌 Testing WebSocket connection...');
    try {
        const WebSocket = require('ws');
        const ws = new WebSocket('ws://localhost:6001/api/ws');
        
        ws.on('open', () => {
            console.log('✅ WebSocket connected');
            ws.close();
        });
        
        ws.on('error', (error) => {
            console.log('❌ WebSocket error:', error.message);
        });
    } catch (error) {
        console.log('❌ WebSocket test failed:', error.message);
    }
}

async function runTests() {
    console.log('🚀 Starting monitoring test suite...\n');

    // Test basic endpoints
    await testHealthEndpoint();
    await testMetricsEndpoint();
    
    console.log('');
    
    // Test file uploads
    await testFileUpload(testYamlContent, 'test-config.yaml', 'yaml');
    await testFileUpload(testEapConfigContent, 'test-provider.eap-config', 'eap-config');
    
    console.log('');
    
    // Test error scenarios
    await testErrorScenarios();
    
    console.log('');
    
    // Test WebSocket
    await testWebSocketConnection();
    
    console.log('\n🎉 Test suite completed!');
    console.log('📊 Check your Grafana dashboard for updated metrics:');
    console.log('   http://localhost:3000/d/yaml-json-service');
}

// Run the tests
runTests().catch(console.error);

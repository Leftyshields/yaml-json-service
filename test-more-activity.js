const axios = require('axios');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:6001';

const testFiles = [
    {
        name: 'simple.yaml',
        content: `
apiVersion: v1
kind: Pod
metadata:
  name: test-pod
spec:
  containers:
  - name: nginx
    image: nginx:latest
    password: mysecret123
`,
        type: 'yaml'
    },
    {
        name: 'complex.json',
        content: JSON.stringify({
            name: 'test-config',
            version: '1.0.0',
            settings: {
                database: {
                    host: 'localhost',
                    password: 'dbpass123',
                    port: 5432
                },
                api: {
                    key: 'apikey123',
                    secret: 'secret456'
                }
            }
        }, null, 2),
        type: 'json'
    }
];

async function generateActivity() {
    console.log('🚀 Generating comprehensive activity for monitoring...\n');

    // Generate various types of requests
    for (let i = 0; i < 10; i++) {
        try {
            // Health checks
            await axios.get(`${BASE_URL}/health`);
            console.log(`✅ Health check ${i + 1}`);
            
            // Metrics requests
            await axios.get(`${BASE_URL}/metrics`);
            console.log(`📊 Metrics request ${i + 1}`);
            
            // File uploads with different parameters
            for (const file of testFiles) {
                const formData = new FormData();
                formData.append('yamlFile', Buffer.from(file.content), {
                    filename: file.name,
                    contentType: 'application/octet-stream'
                });
                
                // Vary the parameters
                const obfuscationLevels = ['none', 'mask', 'partial', 'length'];
                const certHandlings = ['preserve', 'hash', 'obfuscate'];
                
                formData.append('obfuscationLevel', obfuscationLevels[i % obfuscationLevels.length]);
                formData.append('certHandling', certHandlings[i % certHandlings.length]);

                await axios.post(`${BASE_URL}/api/upload-and-convert`, formData, {
                    headers: {
                        ...formData.getHeaders(),
                    },
                    timeout: 10000
                });
                
                console.log(`📁 File upload ${i + 1}: ${file.name} (${obfuscationLevels[i % obfuscationLevels.length]}/${certHandlings[i % certHandlings.length]})`);
            }
            
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            console.log(`⚠️  Request ${i + 1} failed:`, error.message);
        }
    }
    
    console.log('\n🎉 Activity generation completed!');
    console.log('📊 Check your Grafana dashboard for updated metrics:');
    console.log('   http://localhost:3000/d/yaml-json-service');
}

generateActivity().catch(console.error);

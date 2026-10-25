#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const certService = require('../src/services/cert.service');

function run() {
  const sampleCertPem =
    '-----BEGIN CERTIFICATE-----\n' +
    'MIIDXTCCAkWgAwIBAgIJAKoK/OEExample0GCSqGSIb3DQEBCwUAMEUxCzAJ\n' +
    'BgNVBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRl\n' +
    'cm5ldCBXaWRnaXRzIFB0eSBMdGQwHhcNMTkwMTAxMDAwMDAwWhcNMjAwMTAx\n' +
    'MDAwMDAwWjBFMQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEh\n' +
    'MB8GA1UECgwYSW50ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG\n' +
    '9w0BAQEFAAOCAQ8AMIIBCgKCAQEAexampleplaceholderonlynotrealcert\n' +
    '-----END CERTIFICATE-----';

  assert.strictEqual(certService.isCertificateData(sampleCertPem), true);
  assert.strictEqual(certService.isCertificateData('hello'), false);

  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaml-json-tls-test-'));
  certService.clearTlsCredentialsCache();

  assert.strictEqual(fs.readdirSync(certDir).length, 0, 'temp cert dir should start empty');

  const creds = certService.resolveTlsCredentials({ certDir });
  assert.ok(creds.cert && creds.key, 'expected TLS credential material');
  assert.match(creds.cert, /BEGIN CERTIFICATE/);
  assert.match(creds.key, /BEGIN.*KEY/);
  assert.strictEqual(creds.source, 'generated');
  assert.ok(fs.existsSync(path.join(certDir, 'cert.pem')));
  assert.ok(fs.existsSync(path.join(certDir, 'key.pem')));

  const loaded = certService.resolveTlsCredentials({ certDir });
  assert.strictEqual(loaded.source, 'runtime-files');

  certService.clearTlsCredentialsCache();
  fs.rmSync(certDir, { recursive: true, force: true });

  console.log('cert-tls.test.js: all assertions passed');
}

run();

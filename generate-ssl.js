const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Create SSL directory if it doesn't exist
const sslDir = path.join(__dirname, 'ssl');
if (!fs.existsSync(sslDir)) {
  fs.mkdirSync(sslDir);
}

console.log('Generating SSL certificates for localhost...');

// Generate private key and certificate using Node.js selfsigned package
try {
  // First, try to install selfsigned package if not available
  try {
    require('selfsigned');
  } catch (e) {
    console.log('Installing selfsigned package...');
    execSync('npm install selfsigned', { stdio: 'inherit' });
  }

  const selfsigned = require('selfsigned');
  
  // Generate certificate with proper SAN
  const attrs = [
    { name: 'commonName', value: 'localhost' },
    { name: 'countryName', value: 'PL' },
    { name: 'stateOrProvinceName', value: 'Poland' },
    { name: 'localityName', value: 'Warsaw' },
    { name: 'organizationName', value: 'Development' },
    { name: 'organizationalUnitName', value: 'IT' }
  ];
  
  const options = {
    keySize: 2048,
    days: 365,
    algorithm: 'sha256',
    extensions: [{
      name: 'basicConstraints',
      cA: true
    }, {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true
    }, {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true
    }, {
      name: 'subjectAltName',
      altNames: [{
        type: 2, // DNS
        value: 'localhost'
      }, {
        type: 7, // IP
        ip: '127.0.0.1'
      }, {
        type: 7, // IP
        ip: '::1'
      }]
    }]
  };
  
  const pems = selfsigned.generate(attrs, options);

  // Write certificate and key files
  fs.writeFileSync(path.join(sslDir, 'localhost.crt'), pems.cert);
  fs.writeFileSync(path.join(sslDir, 'localhost.key'), pems.private);

  console.log('✅ SSL certificates generated successfully with SAN!');
  console.log('📁 Certificate: ssl/localhost.crt');
  console.log('🔑 Private key: ssl/localhost.key');
  console.log('Certificate includes Subject Alternative Names for:');
  console.log('- DNS: localhost');
  console.log('- IP: 127.0.0.1');
  console.log('- IP: ::1');
  
} catch (error) {
  console.error('❌ Error generating SSL certificates:', error.message);
  console.log('\n📝 Manual certificate generation instructions:');
  console.log('1. Install OpenSSL or use online certificate generator');
  console.log('2. Generate private key: openssl genrsa -out ssl/localhost.key 2048');
  console.log('3. Generate certificate: openssl req -new -x509 -key ssl/localhost.key -out ssl/localhost.crt -days 365 -subj "/CN=localhost"');
}
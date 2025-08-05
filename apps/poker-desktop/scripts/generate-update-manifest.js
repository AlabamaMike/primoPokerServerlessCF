const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const VERSION = process.env.VERSION || '0.1.0';
const RELEASE_NOTES = process.env.RELEASE_NOTES || 'Bug fixes and performance improvements';
const BASE_URL = 'https://primo-poker-updates.s3.amazonaws.com';

// Platform configurations
const PLATFORMS = {
  'darwin-x86_64': {
    signature: 'primo-poker_${version}_x64.app.tar.gz.sig',
    url: `${BASE_URL}/primo-poker_\${version}_x64.app.tar.gz`
  },
  'darwin-aarch64': {
    signature: 'primo-poker_${version}_aarch64.app.tar.gz.sig',
    url: `${BASE_URL}/primo-poker_\${version}_aarch64.app.tar.gz`
  },
  'linux-x86_64': {
    signature: 'primo-poker_${version}_amd64.AppImage.tar.gz.sig',
    url: `${BASE_URL}/primo-poker_\${version}_amd64.AppImage.tar.gz`
  },
  'windows-x86_64': {
    signature: 'primo-poker_${version}_x64-setup.nsis.zip.sig',
    url: `${BASE_URL}/primo-poker_\${version}_x64-setup.nsis.zip`
  }
};

// Generate update manifest
function generateManifest() {
  const manifest = {
    version: VERSION,
    notes: RELEASE_NOTES,
    pub_date: new Date().toISOString(),
    platforms: {}
  };

  // Add platform-specific update info
  for (const [platform, config] of Object.entries(PLATFORMS)) {
    manifest.platforms[platform] = {
      signature: config.signature.replace('${version}', VERSION),
      url: config.url.replace('${version}', VERSION)
    };
  }

  return manifest;
}

// Generate latest.json for Tauri updater
function generateLatestJson() {
  const manifest = generateManifest();
  
  // Create a simplified version for latest.json
  const latest = {
    version: manifest.version,
    notes: manifest.notes,
    pub_date: manifest.pub_date,
    platforms: {}
  };

  // Convert to Tauri's expected format
  for (const [platform, config] of Object.entries(manifest.platforms)) {
    latest.platforms[platform] = {
      signature: '', // Will be filled in after signing
      url: config.url
    };
  }

  return latest;
}

// Main execution
const outputDir = path.join(__dirname, '..', 'dist', 'updates');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Generate manifests
const manifest = generateManifest();
const latest = generateLatestJson();

// Write files
fs.writeFileSync(
  path.join(outputDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2)
);

fs.writeFileSync(
  path.join(outputDir, 'latest.json'),
  JSON.stringify(latest, null, 2)
);

console.log('Update manifests generated successfully!');
console.log('Version:', VERSION);
console.log('Output directory:', outputDir);
console.log('\nNext steps:');
console.log('1. Build the application for all platforms');
console.log('2. Sign the binaries with your private key');
console.log('3. Update the signature fields in latest.json');
console.log('4. Upload all files to S3');
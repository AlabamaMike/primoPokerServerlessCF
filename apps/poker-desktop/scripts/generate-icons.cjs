const fs = require('fs');
const path = require('path');

// SVG template for Primo Poker icon
const svgIcon = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6B46C1;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#F59E0B;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background Circle -->
  <circle cx="256" cy="256" r="240" fill="url(#gradient)"/>
  
  <!-- Inner Circle -->
  <circle cx="256" cy="256" r="200" fill="#0F172A" opacity="0.9"/>
  
  <!-- P Letter -->
  <text x="256" y="300" font-family="Arial, sans-serif" font-size="180" font-weight="bold" 
        text-anchor="middle" fill="white">P</text>
  
  <!-- Poker Chips -->
  <circle cx="180" cy="380" r="30" fill="#F59E0B" opacity="0.8"/>
  <circle cx="256" cy="400" r="30" fill="#6B46C1" opacity="0.8"/>
  <circle cx="332" cy="380" r="30" fill="#F59E0B" opacity="0.8"/>
</svg>`;

// Windows ICO generation placeholder
const generateIco = () => {
  // For a real implementation, you'd use a library like png-to-ico
  // This is a placeholder that creates a simple text file
  return 'ICO file placeholder - use a proper ICO generator tool';
};

// Generate PNG from SVG (placeholder)
const generatePng = (size) => {
  // For a real implementation, you'd use a library like sharp or svg2png
  // This is a placeholder
  return `PNG ${size}x${size} placeholder - use a proper PNG generator tool`;
};

// Create icons directory structure
const iconsDir = path.join(__dirname, '..', 'src-tauri', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Save SVG icon
fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgIcon);

// Create placeholder files for other formats
const sizes = ['32x32', '128x128', '128x128@2x'];
sizes.forEach(size => {
  const content = generatePng(size);
  fs.writeFileSync(path.join(iconsDir, `${size}.png`), content);
});

// Create ICO file for Windows
fs.writeFileSync(path.join(iconsDir, 'icon.ico'), generateIco());

// Create ICNS file for macOS (placeholder)
fs.writeFileSync(path.join(iconsDir, 'icon.icns'), 'ICNS file placeholder - use a proper ICNS generator tool');

console.log('Icon placeholders generated successfully!');
console.log('Icons directory:', iconsDir);
console.log('\nIMPORTANT: These are placeholder files.');
console.log('For production, generate proper icons using:');
console.log('- PNG: Use an SVG to PNG converter');
console.log('- ICO: Use a PNG to ICO converter');
console.log('- ICNS: Use iconutil on macOS');
console.log('\nRecommended tools:');
console.log('- tauri icon command: cargo tauri icon path/to/icon.png');
console.log('- Online converters: convertio.co, cloudconvert.com');
console.log('- Command line: ImageMagick, iconutil');
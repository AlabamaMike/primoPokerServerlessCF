const fs = require('fs');
const path = require('path');

console.log('Validating types package structure...');

const typesPackagePath = path.join(__dirname, 'packages/types');
const requiredFiles = [
  'package.json',
  'tsconfig.json',
  'src/index.ts',
  'src/domain/game.ts',
  'src/domain/player.ts',
  'src/domain/table.ts',
  'src/api/responses.ts',
  'src/websocket/messages.ts'
];

let hasErrors = false;

// Check if all required files exist
requiredFiles.forEach(file => {
  const filePath = path.join(typesPackagePath, file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Missing required file: ${file}`);
    hasErrors = true;
  } else {
    console.log(`✅ Found: ${file}`);
  }
});

// Check package.json structure
try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(typesPackagePath, 'package.json'), 'utf8'));
  if (packageJson.name !== '@primo-poker/types') {
    console.error('❌ Package name mismatch');
    hasErrors = true;
  } else {
    console.log('✅ Package name is correct');
  }
} catch (error) {
  console.error('❌ Failed to read package.json:', error.message);
  hasErrors = true;
}

if (!hasErrors) {
  console.log('\n✅ Types package structure is valid!');
} else {
  console.log('\n❌ Types package has structural issues');
  process.exit(1);
}
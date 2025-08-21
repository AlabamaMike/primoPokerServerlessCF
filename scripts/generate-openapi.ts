#!/usr/bin/env node

/**
 * Script to generate OpenAPI specification file
 */

import { generateOpenAPISpec } from '../packages/api/src/openapi/api-spec';
import * as fs from 'fs';
import * as path from 'path';

const outputDir = path.join(__dirname, '..', 'docs', 'api');
const outputFile = path.join(outputDir, 'openapi.json');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Generate the specification
console.log('Generating OpenAPI specification...');
const spec = generateOpenAPISpec();

// Write to file
fs.writeFileSync(outputFile, spec, 'utf-8');
console.log(`OpenAPI specification written to: ${outputFile}`);

// Also generate a pretty-printed version for readability
const prettyFile = path.join(outputDir, 'openapi-pretty.json');
fs.writeFileSync(prettyFile, JSON.stringify(JSON.parse(spec), null, 2), 'utf-8');
console.log(`Pretty-printed version written to: ${prettyFile}`);

// Generate a simple HTML viewer
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Primo Poker API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: './openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;

const htmlFile = path.join(outputDir, 'index.html');
fs.writeFileSync(htmlFile, htmlContent, 'utf-8');
console.log(`API documentation viewer written to: ${htmlFile}`);

console.log('\nOpenAPI specification generation complete!');
console.log('\nYou can view the documentation by:');
console.log('1. Opening docs/api/index.html in a browser');
console.log('2. Running the app and visiting /api/docs');
console.log('3. Using the OpenAPI spec at /api/openapi.json');
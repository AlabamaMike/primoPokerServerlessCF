#!/bin/bash

echo "Starting Cloudflare log tail..."
echo "Please try to create a table in production and watch for errors here."
echo "Press Ctrl+C to stop."
echo ""

npx wrangler tail primo-poker-server --format pretty | grep -E "Table creation|GameTableDO|handleCreateTable|error|Error|failed|Failed"
#!/bin/bash

set -e

echo "🎭 Setting up Playwright environment..."

# Update package lists
echo "📦 Updating package lists..."
sudo apt-get update -q

# Install Playwright system dependencies using the official method
echo "🔧 Installing Playwright system dependencies..."
sudo npx playwright install-deps

# Install Playwright browsers
echo "🌐 Installing Playwright browsers..."
cd /workspaces/primoPokerServerlessCF/tests/e2e
if [ -f "package.json" ]; then
  npm install
  npx playwright install chromium firefox webkit
  echo "✅ Playwright browsers installed successfully!"
else
  echo "⚠️  E2E test package.json not found, skipping browser installation"
fi

# Clean up
echo "🧹 Cleaning up..."
sudo apt-get clean
sudo rm -rf /var/lib/apt/lists/*

echo "🎉 Playwright environment setup complete!"
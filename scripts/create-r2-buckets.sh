#!/bin/bash
set -e

echo "Creating R2 buckets for Primo Poker..."

# Check if wrangler is available
if ! command -v wrangler &> /dev/null; then
    echo "Error: wrangler CLI not found. Please install it first."
    exit 1
fi

# Check if user is logged in
if ! wrangler whoami &> /dev/null; then
    echo "Error: Not logged in to Cloudflare. Please run 'wrangler login' first."
    exit 1
fi

# Create RNG audit bucket
echo "Creating primo-poker-rng-audit bucket..."
if wrangler r2 bucket create primo-poker-rng-audit 2>/dev/null; then
    echo "✅ Successfully created primo-poker-rng-audit bucket"
else
    echo "⚠️  Bucket primo-poker-rng-audit might already exist or creation failed"
fi

# Create preview bucket for development
echo "Creating primo-poker-rng-audit-preview bucket..."
if wrangler r2 bucket create primo-poker-rng-audit-preview 2>/dev/null; then
    echo "✅ Successfully created primo-poker-rng-audit-preview bucket"
else
    echo "⚠️  Bucket primo-poker-rng-audit-preview might already exist or creation failed"
fi

# List all R2 buckets to verify
echo ""
echo "Current R2 buckets in your account:"
wrangler r2 bucket list

echo ""
echo "R2 bucket setup complete!"
echo "You can now uncomment the AUDIT_BUCKET configuration in wrangler.toml"
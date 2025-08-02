#!/bin/bash
set -e

echo "📊 Checking RNG Audit Logs in R2..."

# Check if wrangler is available
if ! command -v wrangler &> /dev/null; then
    echo "Error: wrangler CLI not found. Please install it first."
    exit 1
fi

# Check environment variables
if [ -z "$CLOUDFLARE_API_TOKEN" ] && ! wrangler whoami &> /dev/null; then
    echo "Error: Not logged in to Cloudflare. Please run 'wrangler login' or set CLOUDFLARE_API_TOKEN"
    exit 1
fi

echo ""
echo "🪣 Listing contents of primo-poker-rng-audit bucket..."
echo ""

# List audit logs
echo "📁 Audit Logs:"
npx wrangler r2 object list primo-poker-rng-audit --prefix="audit-logs/" 2>/dev/null || echo "No audit logs found yet"

echo ""
echo "📁 Security Alerts:"
npx wrangler r2 object list primo-poker-rng-audit --prefix="security-alert/" 2>/dev/null || echo "No security alerts found"

echo ""
echo "📁 RNG Backups:"
npx wrangler r2 object list primo-poker-rng-audit --prefix="rng-backup/" 2>/dev/null || echo "No RNG backups found yet"

echo ""
echo "📁 Batch Audits:"
npx wrangler r2 object list primo-poker-rng-audit --prefix="batch-audit/" 2>/dev/null || echo "No batch audits found yet"

echo ""
echo "ℹ️  Note: Audit logs are batched hourly for efficiency."
echo "    Individual operations may not appear immediately."
echo ""
echo "To download a specific audit log:"
echo "  npx wrangler r2 object get primo-poker-rng-audit <key> --file output.json"
echo ""
echo "To view audit log details in Cloudflare Dashboard:"
echo "  1. Go to dash.cloudflare.com"
echo "  2. Navigate to R2 > primo-poker-rng-audit"
echo "  3. Browse the folder structure"
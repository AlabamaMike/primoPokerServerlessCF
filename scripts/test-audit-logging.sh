#!/bin/bash
set -e

echo "🔍 Testing RNG Audit Logging..."

# Check if API endpoint is provided
API_URL="${1:-https://primo-poker-server.alabamamike.workers.dev}"
echo "Using API URL: $API_URL"

# You'll need to provide a valid JWT token
if [ -z "$JWT_TOKEN" ]; then
  echo "❌ Please set JWT_TOKEN environment variable with a valid token"
  echo "Example: export JWT_TOKEN='your-jwt-token-here'"
  exit 1
fi

# Test RNG shuffle operation
echo ""
echo "📤 Sending shuffle request..."
RESPONSE=$(curl -s -X POST "$API_URL/api/rng/shuffle" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tableId": "audit-test-table-'$(date +%s)'",
    "gameId": "audit-test-game-'$(date +%s)'",
    "playerCount": 4
  }')

echo "📥 Response:"
echo "$RESPONSE" | jq '.' || echo "$RESPONSE"

# Check if successful
if echo "$RESPONSE" | grep -q '"success":true'; then
  echo ""
  echo "✅ Shuffle request successful!"
  echo ""
  echo "🔍 To verify audit logs:"
  echo "1. Go to Cloudflare Dashboard > R2 > primo-poker-rng-audit"
  echo "2. Look for entries in audit-logs/audit-test-table-*/"
  echo "3. Audit logs are batched hourly, so may not appear immediately"
  echo ""
  echo "📊 Log structure should include:"
  echo "- Timestamp"
  echo "- Table ID and Game ID"
  echo "- Operation type (shuffle)"
  echo "- Hashed entropy and seeds"
  echo "- Verification hashes"
else
  echo ""
  echo "❌ Shuffle request failed"
  echo "Check that:"
  echo "- JWT token is valid"
  echo "- User has permission to access RNG API"
  echo "- API endpoint is correct"
fi
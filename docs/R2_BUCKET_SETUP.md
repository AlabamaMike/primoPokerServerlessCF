# R2 Bucket Setup Instructions

## Quick Start

To enable full audit logging functionality, you need to create the R2 buckets first. Choose one of these methods:

### Option 1: GitHub Actions (Recommended)

1. Go to the [Actions tab](https://github.com/AlabamaMike/primoPokerServerlessCF/actions) in your repository
2. Select "Create R2 Buckets" workflow
3. Click "Run workflow"
4. Select environment (production)
5. Click "Run workflow" button

Or use GitHub CLI:
```bash
gh workflow run create-r2-buckets.yml -f environment=production
```

### Option 2: Cloudflare Dashboard

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to R2 > Overview
3. Click "Create bucket"
4. Create these buckets:
   - `primo-poker-rng-audit` (for production)
   - `primo-poker-rng-audit-preview` (for development)

### Option 3: Wrangler CLI

If you have Cloudflare API credentials:

```bash
# Set environment variables
export CLOUDFLARE_API_TOKEN="your-api-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"

# Run the setup script
./scripts/create-r2-buckets.sh
```

## Verification

After creating the buckets, verify they exist:

```bash
# With wrangler CLI
npx wrangler r2 bucket list

# Or check Cloudflare Dashboard
# R2 > Overview > You should see both buckets listed
```

## Deployment

Once buckets are created, the application will automatically deploy with full audit logging enabled on the next push to main branch.

## Troubleshooting

### "R2 bucket not found" error during deployment
- Ensure the bucket names match exactly: `primo-poker-rng-audit`
- Verify buckets are created in the correct Cloudflare account
- Check that the API token has R2 read/write permissions

### Cannot create buckets via GitHub Actions
- Ensure `CLOUDFLARE_API_TOKEN` secret is set in repository settings
- Verify the token has R2 Admin permissions
- Check `CLOUDFLARE_ACCOUNT_ID` secret is correct

### Wrangler CLI errors
- Run `wrangler login` if not authenticated
- Ensure you have R2 permissions on your Cloudflare account
- Update wrangler to latest version: `npm install -g wrangler@latest`

## Required Permissions

The Cloudflare API token needs these permissions:
- Account: R2:Edit
- Zone: Workers Scripts:Edit (for deployment)

## Cost Considerations

R2 pricing (as of 2024):
- Storage: $0.015 per GB-month
- Class A operations (writes): $4.50 per million requests
- Class B operations (reads): $0.36 per million requests
- No egress fees

Estimated monthly costs for audit logging:
- Small poker room (1000 games/day): ~$0.50/month
- Medium poker room (10,000 games/day): ~$5/month
- Large poker room (100,000 games/day): ~$50/month

## Next Steps

After bucket creation:
1. Monitor the next CI/CD deployment
2. Verify audit logs are being written to R2
3. Set up lifecycle policies for data retention (optional)
4. Configure alerts for audit anomalies (optional)
# Decommissioning Cloudflare Pages Site

The old Next.js frontend has been removed from the codebase. To complete the decommissioning of the Cloudflare Pages site, follow these steps:

## 1. Via Cloudflare Dashboard

1. Log into the Cloudflare Dashboard
2. Navigate to "Workers & Pages" 
3. Select "Pages" tab
4. Find the project "primo-poker-frontend"
5. Click on the project
6. Go to Settings → Delete project
7. Confirm deletion

## 2. Via Wrangler CLI (Alternative)

```bash
# List all Pages projects
npx wrangler pages project list

# Delete the project
npx wrangler pages project delete primo-poker-frontend
```

## 3. Update DNS Records (if applicable)

If you have any custom domains pointing to the Pages deployment:
1. Remove or update the CNAME records
2. Consider redirecting to a landing page explaining the move to desktop client

## 4. Update CI/CD Secrets

Since the frontend deployment job has been removed from CI/CD, you may want to:
1. Keep CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID for backend deployments
2. Remove any frontend-specific environment variables from GitHub secrets

## What Has Been Done

✅ Removed `apps/poker-frontend` directory completely  
✅ Updated CI/CD workflow to remove frontend deployment job  
✅ Updated package.json to remove frontend-related scripts  
✅ Updated documentation (CLAUDE.md, README.md)  
✅ Updated backend ALLOWED_ORIGINS to remove Pages URLs  

## Desktop Client Status

The new desktop client is located in `apps/poker-desktop` and uses:
- Tauri framework (Rust + React)
- Secure OS keyring for token storage
- Direct connection to production backend
- All E2E tests passing

## Next Steps

After decommissioning the Pages site, development can continue on:
1. Porting game table UI to desktop client
2. Implementing WebSocket game logic
3. Adding installer and auto-update functionality
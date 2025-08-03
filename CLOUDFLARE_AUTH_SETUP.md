# Cloudflare Authentication Setup

This guide will help you set up authentication for Wrangler CLI to deploy to Cloudflare.

## Option 1: Using Cloudflare API Token (Recommended)

1. **Create an API Token**
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - Click "Create Token"
   - Use the "Edit Cloudflare Workers" template or create a custom token with these permissions:
     - Account: Cloudflare Workers Scripts:Edit
     - Account: Cloudflare Pages:Edit
     - Account: Account Settings:Read
     - Zone: Workers Routes:Edit (if using custom domains)

2. **Set the Environment Variable**
   ```bash
   export CLOUDFLARE_API_TOKEN="your-api-token-here"
   ```

3. **Make it Persistent** (optional)
   Add to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):
   ```bash
   echo 'export CLOUDFLARE_API_TOKEN="your-api-token-here"' >> ~/.bashrc
   source ~/.bashrc
   ```

## Option 2: Using Wrangler Login (Interactive)

If you're in an interactive environment:
```bash
wrangler login
```

This will open a browser window for authentication.

## Option 3: Using Account ID and API Key

1. **Get your Account ID**
   - Go to any domain in your Cloudflare dashboard
   - Right sidebar shows "Account ID"

2. **Get your Global API Key**
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - View your Global API Key

3. **Set Environment Variables**
   ```bash
   export CLOUDFLARE_ACCOUNT_ID="your-account-id"
   export CLOUDFLARE_API_KEY="your-global-api-key"
   export CLOUDFLARE_EMAIL="your-email@example.com"
   ```

## Verify Authentication

Test your authentication:
```bash
wrangler whoami
```

## For GitHub Actions

Add these secrets to your repository:
- `CLOUDFLARE_API_TOKEN` - Your API token
- `CLOUDFLARE_ACCOUNT_ID` - Your account ID (if needed)

## Troubleshooting

If you see "In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN":
1. You're in a non-interactive environment (like a container or CI/CD)
2. You must use Option 1 (API Token) or Option 3 (API Key)
3. Make sure the environment variable is exported, not just set

## Security Notes

- Never commit API tokens or keys to git
- Use environment variables or secret management tools
- Rotate tokens regularly
- Use scoped tokens with minimum required permissions
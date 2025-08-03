#!/bin/bash

# Cloudflare Authentication Setup Script
# This script helps you configure authentication for Wrangler CLI

echo "🔐 Cloudflare Authentication Setup"
echo "=================================="
echo ""
echo "This script will help you set up authentication for deploying to Cloudflare."
echo ""

# Check if already authenticated
if wrangler whoami >/dev/null 2>&1; then
    echo "✅ You are already authenticated with Cloudflare!"
    wrangler whoami
    echo ""
    read -p "Do you want to reconfigure authentication? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
fi

echo "Choose an authentication method:"
echo "1) API Token (Recommended for CI/CD)"
echo "2) Interactive Login (Browser-based)"
echo "3) Global API Key"
echo ""
read -p "Enter your choice (1-3): " choice

case $choice in
    1)
        echo ""
        echo "📋 To create an API token:"
        echo "1. Go to https://dash.cloudflare.com/profile/api-tokens"
        echo "2. Click 'Create Token'"
        echo "3. Use 'Edit Cloudflare Workers' template"
        echo "4. Or create custom token with these permissions:"
        echo "   - Account: Cloudflare Workers Scripts:Edit"
        echo "   - Account: Cloudflare Pages:Edit"
        echo "   - Account: Account Settings:Read"
        echo ""
        read -p "Enter your API Token: " -s api_token
        echo ""
        
        if [ -z "$api_token" ]; then
            echo "❌ No token provided. Exiting."
            exit 1
        fi
        
        # Test the token
        export CLOUDFLARE_API_TOKEN="$api_token"
        if wrangler whoami >/dev/null 2>&1; then
            echo "✅ Authentication successful!"
            echo ""
            echo "To make this permanent, add to your shell profile:"
            echo "export CLOUDFLARE_API_TOKEN=\"$api_token\""
            echo ""
            read -p "Add to ~/.bashrc? (y/N) " -n 1 -r
            echo ""
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                echo "export CLOUDFLARE_API_TOKEN=\"$api_token\"" >> ~/.bashrc
                echo "✅ Added to ~/.bashrc"
                echo "Run 'source ~/.bashrc' to reload"
            fi
        else
            echo "❌ Authentication failed. Please check your token."
            exit 1
        fi
        ;;
        
    2)
        echo ""
        echo "🌐 Opening browser for authentication..."
        wrangler login
        ;;
        
    3)
        echo ""
        echo "📋 To get your Global API Key:"
        echo "1. Go to https://dash.cloudflare.com/profile/api-tokens"
        echo "2. View your Global API Key"
        echo ""
        read -p "Enter your Email: " email
        read -p "Enter your Global API Key: " -s api_key
        echo ""
        read -p "Enter your Account ID: " account_id
        
        if [ -z "$email" ] || [ -z "$api_key" ] || [ -z "$account_id" ]; then
            echo "❌ Missing required information. Exiting."
            exit 1
        fi
        
        export CLOUDFLARE_EMAIL="$email"
        export CLOUDFLARE_API_KEY="$api_key"
        export CLOUDFLARE_ACCOUNT_ID="$account_id"
        
        if wrangler whoami >/dev/null 2>&1; then
            echo "✅ Authentication successful!"
            echo ""
            echo "To make this permanent, add to your shell profile:"
            echo "export CLOUDFLARE_EMAIL=\"$email\""
            echo "export CLOUDFLARE_API_KEY=\"$api_key\""
            echo "export CLOUDFLARE_ACCOUNT_ID=\"$account_id\""
        else
            echo "❌ Authentication failed. Please check your credentials."
            exit 1
        fi
        ;;
        
    *)
        echo "❌ Invalid choice. Exiting."
        exit 1
        ;;
esac

echo ""
echo "🎉 Setup complete!"
echo ""
echo "You can now use commands like:"
echo "  wrangler deploy"
echo "  wrangler pages deploy"
echo "  wrangler tail"
# Page snapshot

```yaml
- alert
- banner:
  - link "🃏 Primo Poker":
    - /url: /
    - text: 🃏
    - heading "Primo Poker" [level=1]
  - navigation:
    - link "Home":
      - /url: /
      - button "Home"
    - link "Live Demo":
      - /url: /demo/table/
      - button "Live Demo"
  - text: smoketest1754114281188 $1,000
  - button
  - button "Logout"
- main:
  - heading "Login to Primo Poker" [level=1]
  - text: Email
  - textbox "Email"
  - text: Password
  - textbox "Password"
  - button "Sign In"
  - paragraph:
    - text: Don't have an account?
    - link "Sign up":
      - /url: /auth/register/
- contentinfo: © 2025 Primo Poker - Serverless Poker Platform Powered by Cloudflare Workers Online
```
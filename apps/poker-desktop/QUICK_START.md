# Quick Start Guide - Primo Poker

Get playing in 5 minutes!

---

## Step 1: Install (2 minutes)

1. Download: [Latest Release](https://github.com/AlabamaMike/primoPokerServerlessCF/releases/latest)
2. Run `Primo-Poker_0.1.0_x64-setup.exe`
3. Handle Windows SmartScreen: Click "More info" → "Run anyway"
4. Complete installation wizard

---

## Step 2: Connect and Login (1 minute)

1. Launch "Primo Poker" from Start Menu
2. Click **"Connect to Server"**
3. Wait for "Connected" status

**Test Credentials** (instant access):
- Username: `e2e_test_1754187899779`
- Password: `TestPass123!_1754187899779`

Or click **"Register"** to create your own account.

---

## Step 3: Join a Game (2 minutes)

### Browse Available Tables

1. Click **"Tables"** tab in top navigation
2. View list of active tables with:
   - Table name
   - Stakes (e.g., 10/20 chips)
   - Players (e.g., 3/9 seated)
   - Game type (Texas Hold'em, Omaha, etc.)

### Create Your Own Table

1. Click **"Create Table"** tab
2. Configure table settings:
   - **Table Name**: Choose descriptive name (e.g., "Beginner Friendly")
   - **Stakes**: Small blind / Big blind (e.g., 10/20)
   - **Max Players**: 2-9 players (recommend 2-5 for v0.1.0)
   - **Buy-in**: Minimum/maximum chips to sit (e.g., 500-2000)
3. Click **"Create Table"**
4. You'll be seated automatically

### Sit at a Table

1. Browse tables list
2. Click **"Join"** on desired table
3. Choose seat position (click empty seat)
4. Enter buy-in amount (between min/max)
5. Click **"Sit Down"**

---

## Step 4: Play Poker! (ongoing)

### Basic Controls

- **Fold**: Discard hand and forfeit pot
- **Call**: Match current bet
- **Raise**: Increase bet amount
- **Check**: Pass action (if no bet to call)
- **All-In**: Bet all remaining chips

### Game Flow

1. **Pre-Flop**: Receive 2 hole cards
2. Betting round (clockwise from small blind)
3. **Flop**: 3 community cards revealed
4. Betting round
5. **Turn**: 4th community card revealed
6. Betting round
7. **River**: 5th community card revealed
8. Final betting round
9. **Showdown**: Best 5-card hand wins

### Chat

- Type messages in chat box (bottom of table view)
- Visible to all players at table
- Rate limited: 10 messages per 60 seconds

---

## Tips for New Players

### Starting Out

- **Start with low stakes**: 10/20 or 25/50 tables
- **Limit to 2-5 players**: Avoids known button rotation bug in v0.1.0
- **Watch a hand**: Observe gameplay before jumping in
- **Use test account**: Practice with test credentials before playing for real

### Common Mistakes

- **Betting too much pre-flop**: Preserve chips for later streets
- **Chasing bad hands**: Fold weak hands early to save chips
- **Ignoring position**: Later positions have more information
- **Playing too many hands**: Be selective with starting hands

### Bankroll Management

- **Never risk more than 5%** of total chips on single hand
- **Leave table if down 50%** of buy-in to preserve bankroll
- **Move up stakes slowly**: Master lower stakes first

---

## Known Limitations (v0.1.0)

### Player Count

- **Recommended**: 2-5 players per table
- **Issue**: Button rotation may fail in 6+ player games
- **Workaround**: Avoid full 9-player tables until v0.1.1

### Message Parsing

- **Issue**: Occasional WebSocket parsing errors
- **Symptom**: Game state appears frozen or incorrect
- **Workaround**: Leave table and rejoin to refresh state

### Platform Support

- **Windows Only**: macOS and Linux builds coming in future releases

---

## Next Steps

### Explore Features

- **Profile**: View stats, adjust settings
- **Leaderboards**: See top players (coming soon)
- **Hand History**: Review past hands (coming soon)
- **Friends**: Add friends, create private tables (coming soon)

### Provide Feedback

This is an **Early Access** release. Your feedback helps us improve!

- **Report Bugs**: https://github.com/AlabamaMike/primoPokerServerlessCF/issues
- **Request Features**: Open GitHub issue with "enhancement" label
- **Share Experience**: Tell us what you love and what needs work

### Stay Updated

- **Changelog**: https://github.com/AlabamaMike/primoPokerServerlessCF/blob/main/apps/poker-desktop/CHANGELOG.md
- **Releases**: https://github.com/AlabamaMike/primoPokerServerlessCF/releases
- **Backend Status**: https://primo-poker-server.alabamamike.workers.dev/api/health

---

## Support

Need help? Check these resources:

- **Installation Guide**: [INSTALLATION.md](./INSTALLATION.md)
- **FAQ**: [FAQ.md](./FAQ.md) (coming soon)
- **GitHub Issues**: https://github.com/AlabamaMike/primoPokerServerlessCF/issues

Happy playing! 🃏♠️♥️♦️♣️
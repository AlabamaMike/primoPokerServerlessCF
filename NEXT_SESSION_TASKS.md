# Next Session Tasks - Start Here Tomorrow

## Priority 1: Verify Production Flow
1. **Test Complete User Journey**
   - Login with test credentials
   - Navigate to multiplayer
   - Create a table successfully 
   - Verify it goes to `/game/{tableId}` (not `/demo/table`)
   - Check that game page loads without errors

2. **CDN Cache Investigation**
   - If still routing to demo, investigate cache headers
   - May need to wait for full CDN propagation
   - Consider cache purging if needed

## Priority 2: Game Page Functionality  
1. **Verify Game Page Loading**
   - Check that created tables fetch properly via API
   - Ensure WebSocket connection works for gameplay
   - Test table not found scenarios

2. **Multi-Player Testing**
   - Create table with one user
   - Join with second user (different browser/incognito)
   - Test basic game interactions

## Priority 3: Error Handling & Edge Cases
1. **Test Error Scenarios**
   - Invalid table IDs
   - Network disconnections
   - JWT token edge cases
   - API failures

2. **User Experience Polish**
   - Loading states
   - Error messages
   - Connection status indicators

## Quick Start Commands

### Test Current Status
```bash
# Check if frontend is working
curl https://6e77d385.primo-poker-frontend.pages.dev

# Test login flow
cd tests/e2e
npm test -- --config=playwright.production.config.ts production-smoke/test-404-fix.spec.ts
```

### Debug Tools
```bash
# Check latest deployment
gh run list --limit 3

# View build logs if needed
gh run view [RUN_ID] --log

# Test API directly
curl https://primo-poker-server.alabamamike.workers.dev/api/health
```

## Test Credentials Ready
- **Email**: e2e_test_1754187899779@example.com
- **Password**: TestPass123!_1754187899779

## Expected Behavior Tomorrow
✅ Login should redirect to `/multiplayer`  
✅ "Create Table" should navigate to `/game/{UUID}` (not `/demo/table`)  
✅ Game page should load without 404 errors  
✅ JWT refresh should work automatically  

## If Issues Persist
1. Check CDN cache propagation time
2. Verify latest code is deployed via build logs
3. Test with hard browser refresh (Ctrl+F5)
4. Check network tab for API call responses

## Files to Reference
- `SESSION_SUMMARY.md` - Complete work summary
- `CLAUDE.md` - Updated project instructions  
- Test files in `tests/e2e/production-smoke/`
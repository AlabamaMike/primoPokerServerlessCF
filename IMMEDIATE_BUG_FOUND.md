# 🚨 IMMEDIATE BUG FOUND - Likely Cause of Internal Server Error

## Critical Routing Bug Discovered

**Location:** `/packages/api/src/routes.ts` around line 580-590

**Issue:** The player action endpoint is using the wrong Durable Object namespace:

```typescript
// WRONG - Using TABLE_OBJECTS (old namespace)
const tableObjectId = request.env.TABLE_OBJECTS.idFromName(tableId);
const tableObject = request.env.TABLE_OBJECTS.get(tableObjectId);

// SHOULD BE - Using GAME_TABLES (correct namespace)  
const durableObjectId = request.env.GAME_TABLES.idFromName(tableId);
const gameTable = request.env.GAME_TABLES.get(durableObjectId);
```

## Why This Causes Internal Server Error

1. **TABLE_OBJECTS** points to a different (possibly non-existent) Durable Object class
2. When the frontend tries to send player actions, it hits this broken endpoint
3. The broken endpoint tries to access a non-existent or misconfigured Durable Object
4. This throws an unhandled exception → Internal Server Error

## Quick Fix Required

This is a **critical bug** that needs immediate fixing. All other endpoints correctly use `GAME_TABLES`, but this one player action endpoint uses the wrong namespace.

**Impact:** This affects all player actions (bet, fold, check, call) which would trigger during gameplay.

**Fix Time:** 2 minutes to change the variable names

This is likely the **root cause** of your Internal Server Error!
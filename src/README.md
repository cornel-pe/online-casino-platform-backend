# Backend source structure

This document describes the **origin-bet366-backend** folder layout, conventions, and where to add new code.

---

## Folder overview

| Folder | Purpose |
|--------|--------|
| **config/** | App and database configuration (e.g. `database.ts`). |
| **controllers/** | HTTP request handlers. Use **controllers/admin/** for admin-only logic. |
| **engine/** | **Pure game logic** (no HTTP, no DB, no sockets). Engines receive RNG and config; they return results. |
| **middleware/** | Auth and guards: `localAuth`, `adminAuth`, `anonymousAuth`, etc. |
| **models/** | Mongoose models (User, Coinflip, Mine, Crash, Trading, Transaction, etc.). |
| **platform/** | Platform layer: RNG, shared game-facing APIs. Controllers and WebSocket handlers call platform + engine. |
| **routes/** | Express routers; one file per domain (auth, user, admin, crash, mine, coinflip, etc.). |
| **services/** | Business logic, external APIs, cron, notifications, wallet, payments. |
| **utils/** | Helpers: `requestParams` (getParam), `apiResponse`, `randomGenerator`, `adminUtils`, etc. |
| **types/** | Shared TypeScript types (e.g. notifications, WebSocket messages). |
| **websocket/** | Socket.IO: connection, auth, game-specific event handlers (mine, crash, roulette, trading). |
| **bot-service/** | Bot engine and game-specific bot logic. |
| **sdk/** | API client and external SDK usage. |
| **scripts/** | One-off or maintenance scripts. |

---

## Layering rules

1. **Engine (`engine/`)**  
   - **Pure functions/classes**: no `Request`/`Response`, no DB, no Socket.IO.  
   - Inputs: game state, config, and an **RNG abstraction** (e.g. from `platform/rng`).  
   - Outputs: winner, payouts, next state, etc.  
   - **No HTTP handlers** in engine files (e.g. no `getCrashGame` in `engine/crash.ts`; those live in controllers).

2. **Platform (`platform/`)**  
   - Wraps RNG and other cross-cutting concerns.  
   - `platform/rng.ts` re-exports/ wraps `utils/randomGenerator` (seeds, crash point, mine positions, coinflip, roulette, verification).  
   - Controllers and WebSocket handlers use platform RNG and call engines for pure logic.

3. **Controllers**  
   - Parse request (use `getParam(req, 'id')` for route params).  
   - Call services + platform + engine.  
   - Persist (DB, wallet, XP, etc.) and send responses (e.g. `res.json(...)` or `apiResponse.success(res, data)`).

4. **Routes**  
   - Mount middleware (auth, optional anonymous).  
   - Delegate to controller methods.  
   - All API routes are mounted under `/api/*` in `server.ts`.

---

## Game-related code (quick map)

| Game | Engine | Platform usage | Controller | Routes |
|------|--------|----------------|------------|--------|
| Coinflip | `engine/coinflipGameEngine.ts` | `platform/rng` | `controllers/coinflipController.ts` | `routes/coinflip.ts` |
| Mine | `engine/mineGameEngine.ts` | `platform/rng` | `controllers/MineController.ts` | `routes/mine.ts` |
| Roulette | `engine/rouletteGameEngine.ts` + `engine/rouletteRoundEngine.ts` | `platform/rng` | `controllers/rouletteController.ts` | `routes/roulette.ts` |
| Crash | `engine/crashGameEngine.ts` (+ legacy `engine/crash.ts` timers) | `platform/rng` | `controllers/crashController.ts` | `routes/crash.ts` |
| Trading | `engine/tradingEngine.ts` | — | `controllers/tradingController.ts` | `routes/trading.ts` |

Admin crash: `controllers/admin/crashAdminController.ts`; admin routes live in `routes/admin.ts` under `/api/admin`.

---

## Shared utilities

- **`utils/requestParams.ts`**  
  `getParam(req, key)` → `string | undefined`. Use for every route param so types are consistent and you can return 400 when required param is missing.

- **`utils/apiResponse.ts`** (optional)  
  Helpers for consistent JSON responses, e.g. `apiResponse.success(res, data)`, `apiResponse.badRequest(res, 'Message')`, so all APIs share the same success/error shape.

- **`utils/adminUtils.ts`**  
  `isAdmin`, `isAdminById` for admin checks.

- **`utils/randomGenerator.ts`**  
  Core RNG; use via **`platform/rng.ts`** in game code.

---

## Auth

- **Middleware:** `middleware/localAuth.ts` (JWT from cookie or `Authorization`), `middleware/adminAuth.ts` (requires admin after auth), `middleware/anonymousAuth.ts` (optional auth).
- **Admin routes:** `routes/admin.ts` uses `authenticateLocalToken` then `authenticateAdmin` for protected admin endpoints.

---

## Entry point and route mounting

- **Entry:** `server.ts` creates the Express app, mounts all routes under `/api/*`, sets up Socket.IO, error handler, and 404.
- **Route files:** One router per domain (auth, user, chat, mine, crash, roulette, coinflip, admin, trading, etc.); no single “routes index” required, but you can add one to re-export routers if you want fewer imports in `server.ts`.

---

## Summary

- **Engines** = pure game logic; **platform** = RNG and shared game APIs; **controllers** = HTTP + DB + wallet + sockets; **routes** = mount + auth.
- Use **getParam** for params and **apiResponse** (or a consistent pattern) for responses.
- Keep the backend **clean and well-structured** by adding new game logic in `engine/`, new HTTP in `controllers/`, and new endpoints in `routes/`.

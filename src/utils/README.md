# Random Generator Utility

A comprehensive random number generation utility for provably fair gaming using EOS blockchain integration.

## Features

- 🎲 **EOS Blockchain Integration**: Uses EOS block numbers as public seeds
- 🔒 **Provably Fair**: Cryptographically secure random generation
- 🎮 **Game-Specific Generators**: Tailored for Coinflip, Crash, Mine, and Roulette
- ✅ **Result Verification**: Verify any game result using seeds
- 🛡️ **Risk Control**: Built-in anomaly detection and analysis
- 🌐 **Multi-Endpoint Support**: Multiple EOS RPC endpoints for reliability
- ⚡ **Performance Optimized**: Caching and async operations

## Quick Start

```typescript
import { RandomGenerator } from './randomGenerator';

// Generate a coinflip result
const result = await RandomGenerator.generateCoinflipResult(serverSeed, gameId);
console.log(result.winnerSide); // 'HEADS' or 'TAILS'

// Generate a crash point
const crash = await RandomGenerator.generateCrashPoint(serverSeed, gameId, houseEdge);
console.log(crash.crashPoint / 100); // e.g., 2.35x

// Generate mine positions
const mines = await RandomGenerator.generateMinePositions(serverSeed, gameId, 5, 3);
console.log(mines.minePositions); // [2, 7, 15]

// Generate roulette result
const roulette = await RandomGenerator.generateRouletteResult(serverSeed, gameId);
console.log(roulette.winningSlot); // 0-36
```

## API Reference

### Core Functions

#### `getPublicSeed(): Promise<string>`
Gets the latest EOS block number as a public seed.

```typescript
const publicSeed = await getPublicSeed();
console.log(publicSeed); // "123456789"
```

#### `generateServerSeed(): string`
Generates a secure 32-byte server seed.

```typescript
const serverSeed = generateServerSeed();
console.log(serverSeed); // "a1b2c3d4e5f6..."
```

#### `generateServerSeedHash(serverSeed: string): string`
Generates SHA-256 hash of server seed for client verification.

```typescript
const hash = generateServerSeedHash(serverSeed);
console.log(hash); // "sha256hash..."
```

### Game-Specific Generators

#### Coinflip Game

```typescript
const result = await generateCoinflipResult(serverSeed, gameId);
// Returns: { winnerSide: 'HEADS' | 'TAILS', ticket: number, publicSeed: string }
```

#### Crash Game

```typescript
const result = await generateCrashPoint(serverSeed, gameId, houseEdge);
// Returns: { crashPoint: number, publicSeed: string }
// crashPoint is in basis points (100 = 1.00x, 200 = 2.00x, etc.)
```

#### Mine Game

```typescript
const result = await generateMinePositions(serverSeed, gameId, gridSize, numMines);
// Returns: { minePositions: number[], publicSeed: string }
// minePositions are 0-indexed tile positions
```

#### Roulette Game

```typescript
const result = await generateRouletteResult(serverSeed, gameId);
// Returns: { winningSlot: number, publicSeed: string }
// winningSlot is 0-36 (European roulette)
```

### Verification

#### `verifyGameResult(serverSeed, publicSeed, gameId, gameType, expectedResult, additionalParams?)`
Verifies a game result using the same seeds.

```typescript
const isValid = verifyGameResult(
  serverSeed,
  publicSeed,
  gameId,
  'coinflip',
  { ticket: 123456, winnerSide: 'HEADS' }
);
console.log(isValid); // true or false
```

### Risk Control

#### `analyzeGameResults(gameType, recentResults, threshold?)`
Analyzes recent game results for anomalies.

```typescript
const analysis = await analyzeGameResults('crash', recentResults, 0.05);
console.log(analysis.isAnomalous); // true or false
console.log(analysis.anomalyScore); // 0.0 to 1.0
```

## Configuration

### EOS RPC Endpoints

The utility uses multiple EOS RPC endpoints for reliability:

```typescript
const EOS_RPC_ENDPOINTS = [
  'https://eos.greymass.com',
  'https://api.eosn.io',
  'https://eos.api.eosnation.io',
  'https://mainnet.eosamsterdam.net'
];
```

### Caching

Block numbers are cached for 5 seconds to reduce API calls:

```typescript
const CACHE_DURATION_MS = 5000;
```

## Error Handling

The utility includes comprehensive error handling:

```typescript
try {
  const result = await generateCrashPoint(serverSeed, gameId);
} catch (error) {
  if (error.message.includes('EOS')) {
    // EOS blockchain unavailable, using fallback
  } else {
    // Other error
  }
}
```

## Testing

Run the comprehensive test suite:

```bash
npx ts-node src/utils/randomGenerator.test.ts
```

The test suite includes:
- Public seed generation
- Game-specific generators
- Result verification
- Randomness distribution analysis

## Migration Guide

See `RANDOM_GENERATOR_MIGRATION.md` for detailed migration instructions from existing random generation methods.

## Security Considerations

1. **Server Seeds**: Never expose server seeds to clients
2. **Seed Hashes**: Only share server seed hashes for verification
3. **Public Seeds**: EOS blockchain provides external verification
4. **Cryptographic Security**: All generation uses SHA-512 and HMAC-SHA256

## Performance

- **Caching**: 5-second cache for EOS block numbers
- **Async Operations**: Non-blocking random generation
- **Fallback**: Timestamp-based seeds if EOS unavailable
- **Multiple Endpoints**: Redundancy for reliability

## Examples

### Basic Usage

```typescript
import { RandomGenerator } from './randomGenerator';

// Generate seeds
const serverSeed = RandomGenerator.generateServerSeed();
const serverSeedHash = RandomGenerator.generateServerSeedHash(serverSeed);

// Generate game result
const gameId = 'game_12345';
const result = await RandomGenerator.generateCoinflipResult(serverSeed, gameId);

// Verify result
const isValid = RandomGenerator.verifyGameResult(
  serverSeed,
  result.publicSeed,
  gameId,
  'coinflip',
  { ticket: result.ticket, winnerSide: result.winnerSide }
);
```

### Advanced Usage with Risk Control

```typescript
// Collect recent results
const recentResults = await getRecentGameResults('crash', 100);

// Analyze for anomalies
const analysis = await RandomGenerator.analyzeGameResults('crash', recentResults);

if (analysis.isAnomalous) {
  console.warn(`Anomaly detected: ${analysis.details}`);
  // Trigger risk management protocols
}
```

### Integration with Game Controllers

```typescript
// In your game controller
import { generateCoinflipResult, generateServerSeed, generateServerSeedHash } from '../utils/randomGenerator';

export class CoinflipController {
  static async joinGame(req: AuthenticatedRequest, res: Response) {
    const { gameId } = req.body;
    
    // Generate game result
    const result = await generateCoinflipResult(game.serverSeed, gameId);
    
    // Update game with result
    game.winner = result.winnerSide === 'HEADS' ? game.creator : req.user._id;
    game.publicSeed = result.publicSeed;
    game.status = 'completed';
    
    await game.save();
    
    res.json({
      success: true,
      winner: game.winner,
      publicSeed: result.publicSeed
    });
  }
}
```

## Troubleshooting

### EOS API Issues

If EOS endpoints are unavailable, the utility falls back to timestamp-based seeds:

```typescript
// Fallback seed generation
const fallbackSeed = Math.floor(Date.now() / 500).toString();
```

### Performance Issues

If you experience performance issues:

1. Check EOS endpoint availability
2. Verify network connectivity
3. Consider increasing cache duration
4. Use multiple EOS endpoints

### Verification Failures

If verification fails:

1. Ensure seeds match exactly
2. Check game type parameter
3. Verify additional parameters for mine games
4. Confirm result format matches expected structure

## Contributing

When contributing to this utility:

1. Maintain backward compatibility
2. Add comprehensive tests
3. Update documentation
4. Follow security best practices
5. Test with multiple EOS endpoints

## License

This utility is part of the SpinX gaming platform.


<svg class="absolute w-[204px] h-auto bottom-0 right-[5%] opacity-40 gb-blur-svg" width="204" height="64" viewBox="0 0 204 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="mask-image: url(&quot;/img/flame.gif&quot;); mask-size: contain; mask-repeat: no-repeat; mask-position: center bottom;"><mask id="svgmask2" mask-type="alpha" maskUnits="userSpaceOnUse" x="0" y="0"><image href="/img/chat/streak/dots.webp" width="204" height="64"></image></mask><rect mask="url(#svgmask2)" width="204" height="64" fill="#D941FF"></rect></svg>


OK, now we update provably fair page,
so player can verify the game result if it is fairness
there are four tabs for 4 games.
in each tab there is input field for serverseed, publicseed, some game require clientseed and nonce, 
the nonce will be for example game id.
and below, there will be game history.
don't need complex formating, just simple HeroUI Table, for showing game history.

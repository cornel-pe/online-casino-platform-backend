import {
  generateServerSeed,
  generateServerSeedHash,
  generateSeedHashPair,
  generateCoinflipResult,
  generateMinePositions,
  generateClientSeed,
  generateClientSeedHash,
  generateCrashPoint,
  verifyCrashPoint,
  generateRouletteResult,
  verifyRouletteResult,
  verifyRouletteResultWithBlockNumber,
} from '../utils/randomGenerator';

export const rng = {
  // Core server seed helpers
  generateServerSeed,
  generateServerSeedHash,
  generateSeedHashPair,

  // Coinflip
  generateCoinflipResult,

  // Mine
  generateMinePositions,
  generateClientSeed,
  generateClientSeedHash,

  // Crash
  generateCrashPoint,
  verifyCrashPoint,

  // Roulette
  generateRouletteResult,
  verifyRouletteResult,
  verifyRouletteResultWithBlockNumber,
} as const;

export type Rng = typeof rng;

export default rng;


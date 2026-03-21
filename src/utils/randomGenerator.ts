/**
 * Comprehensive Random Number Generation Utility
 * 
 * This module provides provably fair random number generation for all games
 * using EOS blockchain block numbers as public seeds and server seeds.
 * 
 * Features:
 * - EOS blockchain integration for public seed generation
 * - Game-specific random generators
 * - Provably fair verification
 * - Risk control and seed collection
 * - Support for all 4 games: Coinflip, Crash, Mine, Roulette
 * - Mine game uses client seed instead of public seed
 */

import * as crypto from 'crypto';
import axios from 'axios';

// EOS blockchain configuration
const EOS_RPC_ENDPOINTS = [
  'https://eos.greymass.com',
  'https://api.eosn.io',
  'https://eos.api.eosnation.io',
  'https://mainnet.eosamsterdam.net'
];

// Cache for recent block numbers to avoid repeated API calls
const blockCache = new Map<string, { blockNumber: number; timestamp: number }>();
const CACHE_DURATION_MS = 5000; // 5 seconds cache

/**
 * Get the latest EOS block number as public seed
 * Falls back to multiple RPC endpoints for reliability
 */
export async function getPublicSeed(): Promise<string> {
  const now = Date.now();
  
  // Check cache first
  const cached = blockCache.get('latest');
  if (cached && (now - cached.timestamp) < CACHE_DURATION_MS) {
    return cached.blockNumber.toString();
  }

  // Try each RPC endpoint
  for (const endpoint of EOS_RPC_ENDPOINTS) {
    try {
      const response = await axios.get(`${endpoint}/v1/chain/get_info`, {
        timeout: 3000
      });
      
      if (response.data && response.data.head_block_num) {
        const blockNumber = response.data.head_block_num;
        
        // Cache the result
        blockCache.set('latest', {
          blockNumber,
          timestamp: now
        });
        
        console.log(`🎲 Retrieved EOS block number: ${blockNumber} from ${endpoint}`);
        return blockNumber.toString();
      }
    } catch (error) {
      console.warn(`⚠️ Failed to get block from ${endpoint}:`, error instanceof Error ? error.message : 'Unknown error');
      continue;
    }
  }
  
  // Fallback to timestamp-based seed if all RPC endpoints fail
  console.warn('⚠️ All EOS RPC endpoints failed, using timestamp fallback');
  return Math.floor(Date.now() / 500).toString(); // Changes every 0.5 seconds
}

/**
 * Get multiple recent block numbers for risk control
 */
export async function getRecentBlockNumbers(count: number = 5): Promise<string[]> {
  const blocks: string[] = [];
  const now = Date.now();
  
  // Get current block
  const currentBlock = await getPublicSeed();
  blocks.push(currentBlock);
  
  // Try to get recent blocks (this is approximate since EOS doesn't provide historical blocks easily)
  for (let i = 1; i < count; i++) {
    const blockNum = parseInt(currentBlock) - i;
    if (blockNum > 0) {
      blocks.push(blockNum.toString());
    }
  }
  
  return blocks;
}

/**
 * Get EOS block hash by block number
 * Returns the block ID (hash) from the EOS blockchain
 */
export async function getEOSBlockHash(blockNumber: number): Promise<string | null> {
  // Try each RPC endpoint
  for (const endpoint of EOS_RPC_ENDPOINTS) {
    try {
      const response = await axios.post(`${endpoint}/v1/chain/get_block`, {
        block_num_or_id: blockNumber
      }, {
        timeout: 3000
      });
      
      if (response.data && response.data.id) {
        console.log(`🔗 Retrieved EOS block hash for block ${blockNumber}: ${response.data.id}`);
        return response.data.id; // This is the block hash
      }
    } catch (error) {
      console.warn(`⚠️ Failed to get block hash from ${endpoint}:`, error instanceof Error ? error.message : 'Unknown error');
      continue;
    }
  }
  
  // Fallback: if we can't get the actual block hash, create a deterministic hash from the block number
  console.warn(`⚠️ All EOS RPC endpoints failed for block ${blockNumber}, using fallback hash`);
  return crypto.createHash('sha256').update(`eos-block-${blockNumber}`).digest('hex');
}

export function generateNonce(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Generate a secure server seed
 */
export function generateServerSeed(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate server seed hash for client verification
 */
export function generateServerSeedHash(serverSeed: string): string {
  return crypto.createHash('sha256').update(serverSeed).digest('hex');
}

/**
 * Core seeded random number generator
 * Uses SHA-512 hash of server seed + public seed + game ID
 */
function seededRandomInteger(
  serverSeed: string, 
  publicSeed: string, 
  gameId: string, 
  min: number = 0, 
  max: number = 999999
): number {
  const hash = crypto.createHash('sha512')
    .update(`${serverSeed}-${publicSeed}-${gameId}`)
    .digest('hex');
  
  const uintValue = parseInt(hash.slice(0, 16), 16);
  const range = max - min + 1;
  return min + (uintValue % range);
}

/**
 * Generate multiple random numbers using the same seed combination
 */
function seededRandomIntegers(
  serverSeed: string,
  publicSeed: string,
  gameId: string,
  count: number,
  min: number = 0,
  max: number = 999999
): number[] {
  const results: number[] = [];
  
  for (let i = 0; i < count; i++) {
    const hash = crypto.createHash('sha512')
      .update(`${serverSeed}-${publicSeed}-${gameId}-${i}`)
      .digest('hex');
    
    const uintValue = parseInt(hash.slice(0, 16), 16);
    const range = max - min + 1;
    results.push(min + (uintValue % range));
  }
  
  return results;
}

// ============================================================================
// GAME-SPECIFIC RANDOM GENERATORS
// ============================================================================

/**
 * COINFLIP GAME RANDOM GENERATOR
 * Generates winner side: HEADS or TAILS using client seeds
 */
export function generateCoinflipResult(
  serverSeed: string,
  creatorSeed: string,
  joinerSeed: string,
  gameId: string
): { winnerSide: 'HEADS' | 'TAILS'; ticket: number } {
  // Use SHA-512 hash of server seed + creator seed + joiner seed + gameId
  const hash = crypto.createHash('sha512')
    .update(`${serverSeed}-${creatorSeed}-${joinerSeed}-${gameId}`)
    .digest('hex');
  
  // Use first 6 characters of hash to generate ticket (0-999999)
  const ticketHex = hash.substring(0, 6);
  const ticket = parseInt(ticketHex, 16) % 1000000;
  
  // Determine winner side: HEADS if ticket < 500000, TAILS otherwise
  const winnerSide = ticket < 500000 ? 'HEADS' : 'TAILS';
  
  return {
    winnerSide,
    ticket
  };
}

/**
 * CRASH GAME RANDOM GENERATOR
 * Generates crash point with house edge using EOS block hash as public seed
 * Uses the EXACT same algorithm as crashGameEngine.calculateCrashPoint()
 */
export async function generateCrashPoint(
  serverSeed: string,
  gameId: string,
  houseEdge: number = 0.01
): Promise<{ crashPoint: number; publicSeed: string; eosBlockNumber: number }> {
  // Get EOS block number and hash for public seed
  const eosBlockNumber = parseInt(await getPublicSeed());
  const eosBlockHash = await getEOSBlockHash(eosBlockNumber);
  const publicSeed = eosBlockHash || eosBlockNumber.toString(); // Fallback to block number if hash unavailable
  
  // Use HMAC-SHA256 for crash point generation (provably fair)
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(publicSeed);
  const hash = hmac.digest('hex');
  
  // Convert first 8 characters of hash to integer
  const hashInt = parseInt(hash.substring(0, 8), 16);
  
  // Provably fair crash point calculation (same as crashGameEngine)
  // This creates realistic distribution: many low crashes, few high crashes
  const randomValue = hashInt / 0xFFFFFFFF; // Normalize to 0-1
  
  // Apply house edge
  const adjustedRandom = Math.max(0.0001, randomValue * (1 - houseEdge));
  
  // Calculate crash point using exponential distribution
  // Formula: 99 / (99 * random) rounded to 2 decimals
  const crashPoint = Math.max(1.01, 99 / (99 * adjustedRandom));
  
  // Cap at max multiplier setting
  const maxMultiplier = 1000;
  const finalCrashPoint = Math.min(crashPoint, maxMultiplier);
  
  return {
    crashPoint: Math.round(finalCrashPoint * 100) / 100,
    publicSeed,
    eosBlockNumber
  };
}

/**
 * Verify crash game result using provided seeds and game ID
 * Uses the EXACT same algorithm as crashGameEngine.calculateCrashPoint()
 */
export function verifyCrashPoint(
  serverSeed: string,
  publicSeed: string,
  gameId: string,
  houseEdge: number = 0.01
): { crashPoint: number } {
  // Use HMAC-SHA256 for crash point calculation (same as engine)
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(publicSeed);
  const hash = hmac.digest('hex');
  
  // Convert first 8 characters of hash to integer
  const hashInt = parseInt(hash.substring(0, 8), 16);
  
  // Provably fair crash point calculation (same as crashGameEngine)
  // This creates realistic distribution: many low crashes, few high crashes
  const randomValue = hashInt / 0xFFFFFFFF; // Normalize to 0-1
  
  // Apply house edge
  const adjustedRandom = Math.max(0.0001, randomValue * (1 - houseEdge));
  
  // Calculate crash point using exponential distribution
  // Formula: 99 / (99 * random) rounded to 2 decimals
  const crashPoint = Math.max(1.01, 99 / (99 * adjustedRandom));
  
  // Cap at max multiplier setting
  const maxMultiplier = 1000;
  const finalCrashPoint = Math.min(crashPoint, maxMultiplier);
  
  return {
    crashPoint: Math.round(finalCrashPoint * 100) / 100
  };
}

/**
 * MINE GAME RANDOM GENERATOR
 * Generates mine positions on the grid using client seed (not public seed)
 */
export function generateMinePositions(
  serverSeed: string, 
  clientSeed: string = '', 
  gridSize: number, 
  numMines: number,
  gameId: string
): number[] {
  const totalTiles = gridSize * gridSize;
  
  if (numMines >= totalTiles) {
    throw new Error('Number of mines cannot be greater than or equal to total tiles');
  }
  
  // Use SHA-512 hash of server seed + client seed + game parameters + gameId
  const hash = crypto.createHash('sha512')
    .update(`${serverSeed}-${clientSeed}-${gridSize}-${numMines}-${gameId}`)
    .digest('hex');
  
  const minePositions: number[] = [];
  const availablePositions = Array.from({ length: totalTiles }, (_, i) => i);
  
  // Use the hash to shuffle and select mine positions
  let hashIndex = 0;
  for (let i = 0; i < numMines; i++) {
    // Use 4 characters of hash at a time (16 bits)
    const hashSlice = hash.slice(hashIndex, hashIndex + 4);
    const randomValue = parseInt(hashSlice, 16);
    
    // Select a random position from available positions
    const positionIndex = randomValue % availablePositions.length;
    const minePosition = availablePositions.splice(positionIndex, 1)[0];
    minePositions.push(minePosition);
    
    // Move to next hash slice
    hashIndex = (hashIndex + 4) % hash.length;
  }
  
  return minePositions.sort((a, b) => a - b);
}

/**
 * ROULETTE GAME RANDOM GENERATOR
 * Generates winning slot number (0-36)
 * Uses EOS block hash as public seed for provably fair gaming with risk control
 */
export async function generateRouletteResult(
  serverSeed: string,
  gameId: string
): Promise<{ winningSlot: number; publicSeed: string; eosBlockNumber: number }> {
  // Get recent EOS blocks for risk control (choose from last 5-10 blocks)
  const recentBlocks = await getRecentBlockNumbers(10);
  
  // Use server seed to deterministically choose which block to use
  const blockIndex = seededRandomInteger(serverSeed, gameId, 'block-selection', 0, recentBlocks.length - 1);
  const selectedBlockNumber = parseInt(recentBlocks[blockIndex]);
  
  // Get the actual block hash from EOS blockchain - this is the public seed
  const blockHash = await getEOSBlockHash(selectedBlockNumber);
  const publicSeed = blockHash || selectedBlockNumber.toString(); // Fallback to block number if hash unavailable
  
  const winningSlot = seededRandomInteger(serverSeed, publicSeed, gameId, 0, 36);
  
  return {
    winningSlot,
    publicSeed, // This is now the EOS block hash
    eosBlockNumber: selectedBlockNumber
  };
}

/**
 * Verify roulette result using provided seeds and game ID
 * Now expects publicSeed to be the EOS block hash
 * For backward compatibility, can also verify with block number
 */
export function verifyRouletteResult(
  serverSeed: string,
  publicSeed: string,
  gameId: string,
  eosBlockNumber?: number
): { winningSlot: number; winningType: string } {
  // publicSeed should now be the EOS block hash
  // For verification, we use the publicSeed directly as it's already the hash
  const verificationSeed = publicSeed;
  
  const winningSlot = seededRandomInteger(serverSeed, verificationSeed, gameId, 0, 36);
  
  // Determine winning type based on slot
  let winningType: string;
  if (winningSlot === 18) {
    winningType = 'crown';
  } else if (winningSlot >= 0 && winningSlot <= 17) {
    winningType = 'heads';
  } else if (winningSlot >= 19 && winningSlot <= 36) {
    winningType = 'tails';
  } else {
    throw new Error(`Invalid winning slot: ${winningSlot}`);
  }
  
  return {
    winningSlot,
    winningType
  };
}

/**
 * Verify roulette result using EOS block number
 * Fetches the block hash and verifies the result
 */
export async function verifyRouletteResultWithBlockNumber(
  serverSeed: string,
  gameId: string,
  eosBlockNumber: number
): Promise<{ winningSlot: number; winningType: string; publicSeed: string }> {
  // Fetch the actual block hash from EOS blockchain
  const blockHash = await getEOSBlockHash(eosBlockNumber);
  const publicSeed = blockHash || eosBlockNumber.toString();
  
  const result = verifyRouletteResult(serverSeed, publicSeed, gameId, eosBlockNumber);
  
  return {
    ...result,
    publicSeed
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if hash is divisible by a number (for house edge calculations)
 */
function isHashDivisible(hash: string, mod: number): boolean {
  let val = 0;
  const o = hash.length % 4;
  
  for (let i = o > 0 ? o - 4 : 0; i < hash.length; i += 4) {
    val = ((val << 16) + parseInt(hash.substring(i, i + 4), 16)) % mod;
  }
  
  return val === 0;
}

/**
 * Verify coinflip game result using client seeds
 */
export function verifyCoinflipResult(
  serverSeed: string,
  creatorSeed: string,
  joinerSeed: string,
  gameId: string,
  expectedResult: { winnerSide: 'HEADS' | 'TAILS'; ticket: number }
): { winnerSide: 'HEADS' | 'TAILS' | 'Unknown'; ticket: number } {
  try {
    const actualResult = generateCoinflipResult(serverSeed, creatorSeed, joinerSeed, gameId);
    
    return actualResult
    
  } catch (error) {
    console.error('Error verifying coinflip result:', error);
    return { winnerSide: 'Unknown', ticket: 0 };
  }
}

/**
 * Verify a game result using the same seeds
 */
export function verifyGameResult(
  serverSeed: string,
  publicSeed: string,
  gameId: string,
  gameType: 'coinflip' | 'crash' | 'mine' | 'roulette',
  expectedResult: any,
  additionalParams?: any
): boolean {
  try {
    let actualResult: any;
    
    switch (gameType) {
      case 'coinflip':
        if (!additionalParams?.creatorSeed || !additionalParams?.joinerSeed) {
          throw new Error('Creator seed and joiner seed required for coinflip verification');
        }
        actualResult = generateCoinflipResult(
          serverSeed,
          additionalParams.creatorSeed,
          additionalParams.joinerSeed,
          gameId
        );
        break;
        
      case 'crash':
        const hmac = crypto.createHmac('sha256', serverSeed);
        hmac.update(`${publicSeed}-${gameId}`);
        const hash = hmac.digest('hex');
        const houseEdge = additionalParams?.houseEdge || 0.01;
        const houseEdgeThreshold = Math.floor(100 / (houseEdge * 100));
        
        if (isHashDivisible(hash, houseEdgeThreshold)) {
          actualResult = { crashPoint: 100 };
        } else {
          const h = parseInt(hash.slice(0, 13), 16);
          const e = Math.pow(2, 52);
          actualResult = { crashPoint: Math.max(101, Math.floor((100 * e - h) / (e - h))) };
        }
        break;
        
      // case 'mine':
      //   if (!additionalParams?.gridSize || !additionalParams?.numMines) {
      //     throw new Error('Grid size and number of mines required for mine verification');
      //   }
      //   // For mine game, use the dedicated verification function
      //   const isMineVerified = verifyMinePositions(
      //     serverSeed,
      //     (additionalParams as any).clientSeed || '',
      //     additionalParams.gridSize,
      //     additionalParams.numMines,
      //     (expectedResult as any).minePositions
      //   );
      //   return isMineVerified;
        
      case 'roulette':
        actualResult = { winningSlot: seededRandomInteger(serverSeed, publicSeed, gameId, 0, 36) };
        break;
        
      default:
        throw new Error(`Unknown game type: ${gameType}`);
    }
    
    // Compare results (this is simplified - in practice you'd want more sophisticated comparison)
    return JSON.stringify(actualResult) === JSON.stringify(expectedResult);
    
  } catch (error) {
    console.error('Error verifying game result:', error);
    return false;
  }
}

/**
 * Generate seed hash pair for client verification
 */
export function generateSeedHashPair(): { seed: string; hash: string } {
  const seed = generateServerSeed();
  const hash = generateServerSeedHash(seed);
  return { seed, hash };
}

/**
 * Get current server seed being used
 * In a real implementation, this would come from your database or configuration
 */
export function getCurrentServerSeed(): string {
  // This should be retrieved from your database or configuration
  // For now, we'll generate a new one each time (not recommended for production)
  return generateServerSeed();
}

/**
 * Risk control: Analyze recent game results for anomalies
 */
export async function analyzeGameResults(
  gameType: string,
  recentResults: any[],
  threshold: number = 0.05
): Promise<{ isAnomalous: boolean; anomalyScore: number; details: string }> {
  try {
    // Simple anomaly detection based on result distribution
    // In a real implementation, you'd have more sophisticated algorithms
    
    if (recentResults.length < 10) {
      return {
        isAnomalous: false,
        anomalyScore: 0,
        details: 'Insufficient data for analysis'
      };
    }
    
    // Calculate basic statistics
    const results = recentResults.map(r => r.result || r.crashPoint || r.winningSlot || 0);
    const mean = results.reduce((a, b) => a + b, 0) / results.length;
    const variance = results.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / results.length;
    const stdDev = Math.sqrt(variance);
    
    // Check for extreme values
    const extremeValues = results.filter(r => Math.abs(r - mean) > 3 * stdDev);
    const anomalyScore = extremeValues.length / results.length;
    
    const isAnomalous = anomalyScore > threshold;
    
    return {
      isAnomalous,
      anomalyScore,
      details: `Found ${extremeValues.length} extreme values out of ${results.length} total results`
    };
    
  } catch (error) {
    console.error('Error analyzing game results:', error);
    return {
      isAnomalous: false,
      anomalyScore: 0,
      details: 'Analysis failed due to error'
    };
  }
}

// ============================================================================
// MINE GAME SPECIFIC FUNCTIONS
// ============================================================================

/**
 * Generate a client seed (can be provided by user or generated)
 * @returns A random client seed
 */
export function generateClientSeed(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Generate client seed hash for verification
 * @param clientSeed - The client seed
 * @returns Hash of the client seed
 */
export function generateClientSeedHash(clientSeed: string): string {
  return crypto.createHash('sha256').update(clientSeed).digest('hex');
}

/**
 * Verify mine positions using the same seeds
 * @param serverSeed - Server seed used for generation
 * @param clientSeed - Client seed used for generation
 * @param gridSize - Grid size
 * @param numMines - Number of mines
 * @param expectedPositions - Expected mine positions
 * @returns True if positions match
 */
export function verifyMinePositions(
  serverSeed: string,
  clientSeed: string,
  gridSize: number = 5,
  numMines: number,
  gameId: string,
  expectedPositions: number[]
): boolean {
  try {
    const actualPositions = generateMinePositions(serverSeed, clientSeed, gridSize, numMines, gameId);
    
    // Compare arrays (order matters since they're sorted)
    if (actualPositions.length !== expectedPositions.length) {
      return false;
    }
    
    for (let i = 0; i < actualPositions.length; i++) {
      if (actualPositions[i] !== expectedPositions[i]) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error verifying mine positions:', error);
    return false;
  }
}

/**
 * Create signature hash for mine game verification
 * @param gridSize - Size of the grid
 * @param numMines - Number of mines
 * @param betAmount - Bet amount
 * @param serverSeedHash - Hash of server seed
 * @param playerId - Player ID
 * @returns Signature hash
 */
export function createSignatureHash(
  gridSize: number,
  numMines: number,
  betAmount: number,
  serverSeedHash: string,
  playerId: string
): string {
  const data = `${gridSize}-${numMines}-${betAmount}-${serverSeedHash}-${playerId}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Validate signature hash for mine game
 * @param game - Game object with signature data
 * @returns True if signature is valid
 */
export function validateSignatureHash(game: any): boolean {
  try {
    const expectedHash = createSignatureHash(
      game.gridSize,
      game.numMines,
      game.betAmount,
      generateServerSeedHash(game.serverSeed),
      game.player.toString()
    );
    
    return expectedHash === game.sigHash;
  } catch (error) {
    console.error('Error validating signature hash:', error);
    return false;
  }
}

/**
 * Export all functions for easy importing
 */
export const RandomGenerator = {
  // Core functions
  getPublicSeed,
  getRecentBlockNumbers,
  getEOSBlockHash,
  generateServerSeed,
  generateServerSeedHash,
  generateSeedHashPair,
  getCurrentServerSeed,
  
  // Game-specific generators
  generateCoinflipResult,
  generateCrashPoint,
  generateMinePositions,
  generateRouletteResult,
  
  // Mine game specific functions
  generateClientSeed,
  generateClientSeedHash,
  verifyMinePositions,
  createSignatureHash,
  validateSignatureHash,
  
  // Coinflip game specific functions
  verifyCoinflipResult,
  
  // Crash game specific functions
  verifyCrashPoint,
  
  // Roulette game specific functions
  verifyRouletteResult,
  verifyRouletteResultWithBlockNumber,
  
  // Utility functions
  verifyGameResult,
  analyzeGameResults,
  
  // Constants
  EOS_RPC_ENDPOINTS,
  CACHE_DURATION_MS
};

export default RandomGenerator;

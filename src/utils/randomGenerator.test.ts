/**
 * Test file for RandomGenerator utility
 * Demonstrates usage and verifies functionality
 */

import { 
  RandomGenerator,
  getPublicSeed,
  generateCoinflipResult,
  generateCrashPoint,
  generateMinePositions,
  generateRouletteResult,
  verifyGameResult
} from './randomGenerator';

// Test configuration
const TEST_SERVER_SEED = 'test_server_seed_123456789abcdef';
const TEST_GAME_ID = 'test_game_12345';

/**
 * Test EOS blockchain integration
 */
async function testPublicSeedGeneration() {
  console.log('🧪 Testing public seed generation...');
  
  try {
    const publicSeed = await getPublicSeed();
    console.log(`✅ Public seed generated: ${publicSeed}`);
    
    // Test that it's a valid number
    const blockNumber = parseInt(publicSeed);
    if (!isNaN(blockNumber) && blockNumber > 0) {
      console.log(`✅ Valid block number: ${blockNumber}`);
    } else {
      console.log(`❌ Invalid block number: ${publicSeed}`);
    }
    
    return publicSeed;
  } catch (error) {
    console.error('❌ Failed to generate public seed:', error);
    throw error;
  }
}

/**
 * Test Coinflip random generation
 */
async function testCoinflipGeneration() {
  console.log('🧪 Testing Coinflip generation...');
  
  try {
    const result = await generateCoinflipResult(TEST_SERVER_SEED, TEST_GAME_ID);
    
    console.log(`✅ Coinflip result:`);
    console.log(`   - Winner: ${result.winnerSide}`);
    console.log(`   - Ticket: ${result.ticket}`);
    console.log(`   - Public Seed: ${result.publicSeed}`);
    
    // Verify the result
    const isValid = result.ticket >= 0 && result.ticket <= 999999;
    const isWinnerValid = ['HEADS', 'TAILS'].includes(result.winnerSide);
    
    if (isValid && isWinnerValid) {
      console.log('✅ Coinflip result is valid');
    } else {
      console.log('❌ Coinflip result is invalid');
    }
    
    return result;
  } catch (error) {
    console.error('❌ Failed to generate coinflip result:', error);
    throw error;
  }
}

/**
 * Test Crash random generation
 */
async function testCrashGeneration() {
  console.log('🧪 Testing Crash generation...');
  
  try {
    const result = await generateCrashPoint(TEST_SERVER_SEED, TEST_GAME_ID, 0.01);
    
    console.log(`✅ Crash result:`);
    console.log(`   - Crash Point: ${result.crashPoint / 100}x`);
    console.log(`   - Public Seed: ${result.publicSeed}`);
    
    // Verify the result
    const isValid = result.crashPoint >= 100 && result.crashPoint <= 100000; // 1.00x to 1000x
    
    if (isValid) {
      console.log('✅ Crash result is valid');
    } else {
      console.log('❌ Crash result is invalid');
    }
    
    return result;
  } catch (error) {
    console.error('❌ Failed to generate crash result:', error);
    throw error;
  }
}

/**
 * Test Mine random generation
 */
async function testMineGeneration() {
  console.log('🧪 Testing Mine generation...');
  
  try {
    const gridSize = 5;
    const numMines = 3;
    const result = await generateMinePositions(TEST_SERVER_SEED, TEST_GAME_ID, gridSize, numMines);
    
    console.log(`✅ Mine result:`);
    console.log(`   - Grid Size: ${gridSize}x${gridSize}`);
    console.log(`   - Number of Mines: ${numMines}`);
    console.log(`   - Mine Positions: [${result.minePositions.join(', ')}]`);
    console.log(`   - Public Seed: ${result.publicSeed}`);
    
    // Verify the result
    const totalTiles = gridSize * gridSize;
    const hasCorrectCount = result.minePositions.length === numMines;
    const hasValidPositions = result.minePositions.every(pos => pos >= 0 && pos < totalTiles);
    const hasUniquePositions = new Set(result.minePositions).size === result.minePositions.length;
    
    if (hasCorrectCount && hasValidPositions && hasUniquePositions) {
      console.log('✅ Mine result is valid');
    } else {
      console.log('❌ Mine result is invalid');
    }
    
    return result;
  } catch (error) {
    console.error('❌ Failed to generate mine result:', error);
    throw error;
  }
}

/**
 * Test Roulette random generation
 */
async function testRouletteGeneration() {
  console.log('🧪 Testing Roulette generation...');
  
  try {
    const result = await generateRouletteResult(TEST_SERVER_SEED, TEST_GAME_ID);
    
    console.log(`✅ Roulette result:`);
    console.log(`   - Winning Slot: ${result.winningSlot}`);
    console.log(`   - Public Seed: ${result.publicSeed}`);
    
    // Verify the result
    const isValid = result.winningSlot >= 0 && result.winningSlot <= 36;
    
    if (isValid) {
      console.log('✅ Roulette result is valid');
    } else {
      console.log('❌ Roulette result is invalid');
    }
    
    return result;
  } catch (error) {
    console.error('❌ Failed to generate roulette result:', error);
    throw error;
  }
}

/**
 * Test result verification
 */
async function testResultVerification() {
  console.log('🧪 Testing result verification...');
  
  try {
    // Generate a coinflip result
    const coinflipResult = await generateCoinflipResult(TEST_SERVER_SEED, TEST_GAME_ID);
    
    // Verify it
    const isVerified = verifyGameResult(
      TEST_SERVER_SEED,
      coinflipResult.publicSeed,
      TEST_GAME_ID,
      'coinflip',
      { ticket: coinflipResult.ticket, winnerSide: coinflipResult.winnerSide }
    );
    
    if (isVerified) {
      console.log('✅ Result verification successful');
    } else {
      console.log('❌ Result verification failed');
    }
    
    return isVerified;
  } catch (error) {
    console.error('❌ Failed to verify result:', error);
    throw error;
  }
}

/**
 * Test multiple generations to check randomness
 */
async function testRandomnessDistribution() {
  console.log('🧪 Testing randomness distribution...');
  
  try {
    const results = {
      coinflip: { heads: 0, tails: 0 },
      crash: [] as number[],
      roulette: [] as number[]
    };
    
    // Generate 100 results for each game type
    for (let i = 0; i < 100; i++) {
      const gameId = `test_game_${i}`;
      
      // Coinflip
      const coinflip = await generateCoinflipResult(TEST_SERVER_SEED, gameId);
      if (coinflip.winnerSide === 'HEADS') results.coinflip.heads++;
      else results.coinflip.tails++;
      
      // Crash
      const crash = await generateCrashPoint(TEST_SERVER_SEED, gameId);
      results.crash.push(crash.crashPoint);
      
      // Roulette
      const roulette = await generateRouletteResult(TEST_SERVER_SEED, gameId);
      results.roulette.push(roulette.winningSlot);
    }
    
    // Analyze distributions
    console.log('✅ Distribution analysis:');
    console.log(`   - Coinflip: Heads ${results.coinflip.heads}/100, Tails ${results.coinflip.tails}/100`);
    
    const avgCrash = results.crash.reduce((a, b) => a + b, 0) / results.crash.length;
    console.log(`   - Crash: Average ${(avgCrash / 100).toFixed(2)}x`);
    
    const avgRoulette = results.roulette.reduce((a, b) => a + b, 0) / results.roulette.length;
    console.log(`   - Roulette: Average ${avgRoulette.toFixed(2)}`);
    
    // Check if distributions look reasonable
    const coinflipBalanced = Math.abs(results.coinflip.heads - results.coinflip.tails) < 20; // Within 20% of 50/50
    const crashReasonable = avgCrash > 150 && avgCrash < 500; // Reasonable average crash point
    const rouletteReasonable = avgRoulette > 15 && avgRoulette < 21; // Around 18 (middle of 0-36)
    
    if (coinflipBalanced && crashReasonable && rouletteReasonable) {
      console.log('✅ Distributions look reasonable');
    } else {
      console.log('❌ Distributions may be skewed');
    }
    
    return results;
  } catch (error) {
    console.error('❌ Failed to test randomness distribution:', error);
    throw error;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🚀 Starting RandomGenerator tests...\n');
  
  try {
    await testPublicSeedGeneration();
    console.log('');
    
    await testCoinflipGeneration();
    console.log('');
    
    await testCrashGeneration();
    console.log('');
    
    await testMineGeneration();
    console.log('');
    
    await testRouletteGeneration();
    console.log('');
    
    await testResultVerification();
    console.log('');
    
    await testRandomnessDistribution();
    console.log('');
    
    console.log('🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  }
}

/**
 * Example usage for each game type
 */
export function demonstrateUsage() {
  console.log('📚 RandomGenerator Usage Examples:\n');
  
  console.log('1. COINFLIP GAME:');
  console.log(`
    const result = await generateCoinflipResult(serverSeed, gameId);
    // Returns: { winnerSide: 'HEADS' | 'TAILS', ticket: number, publicSeed: string }
  `);
  
  console.log('2. CRASH GAME:');
  console.log(`
    const result = await generateCrashPoint(serverSeed, gameId, houseEdge);
    // Returns: { crashPoint: number, publicSeed: string }
    // crashPoint is in basis points (100 = 1.00x, 200 = 2.00x, etc.)
  `);
  
  console.log('3. MINE GAME:');
  console.log(`
    const result = await generateMinePositions(serverSeed, gameId, gridSize, numMines);
    // Returns: { minePositions: number[], publicSeed: string }
    // minePositions are 0-indexed tile positions
  `);
  
  console.log('4. ROULETTE GAME:');
  console.log(`
    const result = await generateRouletteResult(serverSeed, gameId);
    // Returns: { winningSlot: number, publicSeed: string }
    // winningSlot is 0-36 (European roulette)
  `);
  
  console.log('5. VERIFICATION:');
  console.log(`
    const isValid = verifyGameResult(serverSeed, publicSeed, gameId, gameType, expectedResult);
    // Returns: boolean
  `);
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}

export {
  testPublicSeedGeneration,
  testCoinflipGeneration,
  testCrashGeneration,
  testMineGeneration,
  testRouletteGeneration,
  testResultVerification,
  testRandomnessDistribution,
  runAllTests
};

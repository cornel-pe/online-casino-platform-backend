import mongoose from 'mongoose';

/**
 * Generate the next game ID for coinflip games
 * Starts from 5000 and increments by 1
 */
export async function generateNextCoinflipGameId(): Promise<number> {
  const Coinflip = mongoose.model('Coinflip');
  
  try {
    // Find the highest existing gameId
    const lastGame = await Coinflip.findOne({}, { gameId: 1 })
      .sort({ gameId: -1 })
      .lean() as any;
    
    if (!lastGame || !lastGame.gameId) {
      // No games exist yet, start from 5000
      return 5000;
    }
    
    // Return the next game ID
    return lastGame.gameId + 1;
  } catch (error) {
    console.error('Error generating next coinflip game ID:', error);
    // Fallback: return a timestamp-based ID if database query fails
    return Date.now() % 10000 + 5000;
  }
}

/**
 * Generate the next game ID for mine games
 * Starts from 100000 and increments by 1
 */
export async function generateNextMineGameId(): Promise<number> {
  const Mine = mongoose.model('Mine');
  
  try {
    // Find the highest existing gameId
    const lastGame = await Mine.findOne({}, { gameId: 1 })
      .sort({ gameId: -1 })
      .lean() as any;
    
    if (!lastGame || !lastGame.gameId) {
      // No games exist yet, start from 100000
      return 100000;
    }
    
    // Return the next game ID
    return lastGame.gameId + 1;
  } catch (error) {
    console.error('Error generating next mine game ID:', error);
    // Fallback: return a timestamp-based ID if database query fails
    return Date.now() % 1000000 + 100000;
  }
}

/**
 * Generate game IDs for other games (coinfip, crash, roulette)
 */
export async function generateNextGameId(gameType: 'coinflip' | 'crash' | 'roulette'): Promise<number> {
  const Model = mongoose.model(gameType.charAt(0).toUpperCase() + gameType.slice(1));
  
  try {
    // Find the highest existing gameId
    const lastGame = await Model.findOne({}, { gameId: 1 })
      .sort({ gameId: -1 })
      .lean() as any;
    
    if (!lastGame || !lastGame.gameId) {
      // No games exist yet, start from 100000
      return 100000;
    }
    
    // Return the next game ID
    return lastGame.gameId + 1;
  } catch (error) {
    console.error(`Error generating next ${gameType} game ID:`, error);
    // Fallback: return a timestamp-based ID if database query fails
    return Date.now() % 1000000 + 100000;
  }
}

import { Socket } from 'socket.io';
import { ChatClient } from './types';
import { broadcast } from './index';

// Track active players per game
const activePlayers = new Map<string, Set<string>>();
const playerGames = new Map<string, string>(); // Track which game each player is in

// Initialize game tracking
const GAME_TYPES = ['mine', 'crash', 'roulette', 'coinflip'];
GAME_TYPES.forEach(game => {
  activePlayers.set(game, new Set());
});

export function setupGameStatusEventHandlers(socket: Socket, client: ChatClient) {
  console.log(`🎮 Setting up game status event handlers for ${client.user.username}`);

  // Handle player joining a game
  socket.on('joined_game', async (data: { gameType: string }) => {
    try {
      const { gameType } = data;
      const playerId = client.user.id;
      const username = client.user.username;

      console.log(`🎮 ${username} joined game: ${gameType}`);

      // Remove player from previous game if they were in one
      const previousGame = playerGames.get(playerId);
      if (previousGame && previousGame !== gameType) {
        leaveGame(playerId, previousGame);
      }

      // Add player to new game
      joinGame(playerId, gameType);
      playerGames.set(playerId, gameType);

      // Broadcast updated player counts to all clients
      await broadcastPlayerCounts();

    } catch (error) {
      console.error('Error handling joined_game event:', error);
    }
  });

  // Handle player leaving a game
  socket.on('left_game', async (data: { gameType: string }) => {
    try {
      const { gameType } = data;
      const playerId = client.user.id;
      const username = client.user.username;

      console.log(`🎮 ${username} left game: ${gameType}`);

      // Remove player from game
      leaveGame(playerId, gameType);
      playerGames.delete(playerId);

      // Broadcast updated player counts to all clients
      await broadcastPlayerCounts();

    } catch (error) {
      console.error('Error handling left_game event:', error);
    }
  });

  // Handle client disconnection
  socket.on('disconnect', async () => {
    try {
      const playerId = client.user.id;
      const username = client.user.username;
      const currentGame = playerGames.get(playerId);

      if (currentGame) {
        console.log(`🎮 ${username} disconnected from game: ${currentGame}`);
        leaveGame(playerId, currentGame);
        playerGames.delete(playerId);

        // Broadcast updated player counts to all clients
        await broadcastPlayerCounts();
      }
    } catch (error) {
      console.error('Error handling disconnect for game status:', error);
    }
  });

  // Handle request for current player counts
  socket.on('get_player_counts', async () => {
    try {
      const playerCounts = await getAugmentedPlayerCounts();
      socket.emit('player_counts_update', {
        type: 'player_counts_update',
        data: playerCounts
      });
    } catch (error) {
      console.error('Error getting player counts:', error);
    }
  });
}

// Helper functions
function joinGame(playerId: string, gameType: string) {
  if (!activePlayers.has(gameType)) {
    activePlayers.set(gameType, new Set());
  }
  activePlayers.get(gameType)!.add(playerId);
}

function leaveGame(playerId: string, gameType: string) {
  if (activePlayers.has(gameType)) {
    activePlayers.get(gameType)!.delete(playerId);
  }
}

function getPlayerCounts() {
  const counts: { [key: string]: number } = {};
  let totalPlayers = 0;

  GAME_TYPES.forEach(game => {
    const count = activePlayers.get(game)?.size || 0;
    counts[game] = count;
    totalPlayers += count;
  });

  return {
    gameStatuses: GAME_TYPES.map(gameType => ({
      gameType,
      activePlayers: counts[gameType],
      status: counts[gameType] > 0 ? 'active' : 'inactive',
      lastUpdated: new Date().toISOString()
    })),
    totalActivePlayers: totalPlayers,
    lastUpdated: new Date().toISOString()
  };
}

// Shared build: bot module removed; counts are page visitors only
export async function getAugmentedPlayerCounts() {
  const base = getPlayerCounts();
  base.lastUpdated = new Date().toISOString();
  return base;
}

async function broadcastPlayerCounts() {
  try {
    const playerCounts = await getAugmentedPlayerCounts();
    broadcast({
      type: 'player_counts_update',
      data: playerCounts
    });
  } catch (error) {
    console.error('Error broadcasting player counts:', error);
  }
}

// Export functions for use in other modules
export { getPlayerCounts, broadcastPlayerCounts };

// External helpers for server-side actors (e.g., bots) to affect counts
export async function recordBotJoinedGame(userId: string, gameType: string): Promise<void> {
  try {
    joinGame(userId, gameType);
    playerGames.set(userId, gameType);
    await broadcastPlayerCounts();
  } catch (e) {
    console.error('Error recording bot joined game:', e);
  }
}

export async function recordBotLeftGame(userId: string, gameType: string): Promise<void> {
  try {
    leaveGame(userId, gameType);
    playerGames.delete(userId);
    await broadcastPlayerCounts();
  } catch (e) {
    console.error('Error recording bot left game:', e);
  }
}

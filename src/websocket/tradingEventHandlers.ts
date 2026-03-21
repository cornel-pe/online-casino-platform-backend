import { Socket } from 'socket.io';
import tradingEngine from '../engine/tradingEngine';
import TradingBet from '../models/Trading';

/**
 * Setup trading WebSocket event handlers
 */
export const handleTradingEvents = (socket: Socket): void => {
  console.log('📈 Trading WebSocket events registered for socket:', socket.id);

  // Subscribe to price updates for a specific token
  socket.on('trading_subscribe_price', (data: { token: string }) => {
    try {
      const { token } = data;
      if (!token) {
        socket.emit('error', { message: 'Token is required' });
        return;
      }

      const supportedTokens = ['BTC', 'BNB', 'ETH', 'SOL', 'TRX'];
      if (!supportedTokens.includes(token.toUpperCase())) {
        socket.emit('error', { message: 'Unsupported token' });
        return;
      }

      const roomName = `trading_price_${token.toUpperCase()}`;
      socket.join(roomName);
      console.log(`📈 Socket ${socket.id} subscribed to ${token} price updates`);

      // Send current price immediately
      const price = tradingEngine.getPrice(token.toUpperCase() as any);
      if (price !== null) {
        socket.emit('trading_price_update', {
          token: token.toUpperCase(),
          price,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Error subscribing to price:', error);
      socket.emit('error', { message: 'Failed to subscribe to price' });
    }
  });

  // Unsubscribe from price updates
  socket.on('trading_unsubscribe_price', (data: { token: string }) => {
    try {
      const { token } = data;
      if (!token) {
        socket.emit('error', { message: 'Token is required' });
        return;
      }

      const roomName = `trading_price_${token.toUpperCase()}`;
      socket.leave(roomName);
      console.log(`📈 Socket ${socket.id} unsubscribed from ${token} price updates`);
    } catch (error) {
      console.error('Error unsubscribing from price:', error);
      socket.emit('error', { message: 'Failed to unsubscribe from price' });
    }
  });

  // Get user's active bets (real-time)
  socket.on('trading_get_active_bets', async () => {
    try {
      // Extract user ID from socket auth (if available)
      const userId = (socket as any).userId;
      if (!userId) {
        socket.emit('error', { message: 'Authentication required' });
        return;
      }

      const bets = await TradingBet.find({
        userId,
        status: 'active',
      }).sort({ openedAt: -1 });

      socket.emit('trading_active_bets', {
        bets,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error getting active bets:', error);
      socket.emit('error', { message: 'Failed to get active bets' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`📈 Trading WebSocket disconnected: ${socket.id}`);
  });
};


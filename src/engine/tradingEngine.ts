import WebSocket from 'ws';
import mongoose from 'mongoose';
import TradingBet, { ITradingBet } from '../models/Trading';
import { calculatePnL, isBusted } from '../utils/tradingCalculations';
import { Server as SocketIOServer } from 'socket.io';

const SUPPORTED_TOKENS = ['BTC', 'BNB', 'ETH', 'SOL', 'TRX'] as const;
type SupportedToken = typeof SUPPORTED_TOKENS[number];

interface TokenPrice {
  token: SupportedToken;
  price: number;
  lastUpdate: Date;
}

class TradingEngine {
  private io: SocketIOServer | null = null;
  private wsConnections: Map<SupportedToken, WebSocket> = new Map();
  private tokenPrices: Map<SupportedToken, TokenPrice> = new Map();
  private isRunning: boolean = false;
  private priceUpdateInterval: NodeJS.Timeout | null = null;
  private betProcessingInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the trading engine
   */
  public async start(io: SocketIOServer): Promise<void> {
    if (this.isRunning) {
      console.log('📈 Trading engine is already running');
      return;
    }

    this.io = io;
    this.isRunning = true;

    // Initialize token prices
    for (const token of SUPPORTED_TOKENS) {
      await this.fetchInitialPrice(token);
    }

    // Connect to Binance WebSocket streams
    // this.connectToBinanceStreams();

    // Start price update interval (every 1 second)
    this.priceUpdateInterval = setInterval(() => {
      this.processActiveBets();
    }, 1000);

    // Start bet processing interval (every 500ms)
    this.betProcessingInterval = setInterval(() => {
      this.processActiveBets();
    }, 500);

    console.log('📈 Trading engine started');
  }

  /**
   * Stop the trading engine
   */
  public async stop(): Promise<void> {
    this.isRunning = false;

    // Close all WebSocket connections
    for (const [token, ws] of this.wsConnections.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      this.wsConnections.delete(token);
    }

    // Clear intervals
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
      this.priceUpdateInterval = null;
    }

    if (this.betProcessingInterval) {
      clearInterval(this.betProcessingInterval);
      this.betProcessingInterval = null;
    }

    console.log('📈 Trading engine stopped');
  }

  /**
   * Get current price for a token
   */
  public getPrice(token: SupportedToken): number | null {
    const priceData = this.tokenPrices.get(token);
    return priceData?.price || null;
  }

  /**
   * Get all token prices
   */
  public getAllPrices(): Map<SupportedToken, TokenPrice> {
    return new Map(this.tokenPrices);
  }

  /**
   * Fetch initial price from Binance REST API
   */
  private async fetchInitialPrice(token: SupportedToken): Promise<void> {
    try {
      const symbol = `${token}USDT`;
      const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      const data = await response.json();
      
      const price = parseFloat(data.price);
      if (price > 0) {
        this.tokenPrices.set(token, {
          token,
          price,
          lastUpdate: new Date(),
        });
        console.log(`📈 ${token} initial price: $${price.toFixed(2)}`);
      }
    } catch (error) {
      console.error(`❌ Failed to fetch initial price for ${token}:`, error);
    }
  }

  /**
   * Connect to Binance WebSocket streams for all supported tokens
   */
  private connectToBinanceStreams(): void {
    // Binance WebSocket supports multiple streams in one connection
    const streams = SUPPORTED_TOKENS.map(token => `${token.toLowerCase()}usdt@ticker`).join('/');
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        console.log('📈 Connected to Binance WebSocket streams');
      });

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.stream && message.data) {
            const streamName = message.stream;
            const tokenMatch = streamName.match(/^([a-z]+)usdt@ticker$/);
            
            if (tokenMatch) {
              const token = tokenMatch[1].toUpperCase() as SupportedToken;
              if (SUPPORTED_TOKENS.includes(token)) {
                const price = parseFloat(message.data.c); // Close price (latest)
                
                this.tokenPrices.set(token, {
                  token,
                  price,
                  lastUpdate: new Date(),
                });

                // Emit price update via Socket.IO to subscribed rooms
                if (this.io) {
                  // Emit to global listeners
                  this.io.emit('trading_price_update', {
                    token,
                    price,
                    timestamp: new Date().toISOString(),
                  });
                  
                  // Also emit to token-specific room
                  this.io.to(`trading_price_${token}`).emit('trading_price_update', {
                    token,
                    price,
                    timestamp: new Date().toISOString(),
                  });
                }
              }
            }
          }
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
        }
      });

      ws.on('error', (error) => {
        console.error('❌ Binance WebSocket error:', error);
      });

      ws.on('close', () => {
        console.log('📈 Binance WebSocket connection closed, reconnecting...');
        
        // Reconnect after 5 seconds
        setTimeout(() => {
          if (this.isRunning) {
            this.connectToBinanceStreams();
          }
        }, 5000);
      });

      // Store connection (one connection handles all tokens)
      this.wsConnections.set('BTC', ws); // Store under BTC as primary key
    } catch (error) {
      console.error('❌ Failed to connect to Binance WebSocket:', error);
      
      // Retry after 5 seconds
      setTimeout(() => {
        if (this.isRunning) {
          this.connectToBinanceStreams();
        }
      }, 5000);
    }
  }

  /**
   * Process all active bets - check for bust, auto cashout, and update PnL
   */
  private async processActiveBets(): Promise<void> {
    try {
      const activeBets = await TradingBet.find({ status: 'active' }).exec();

      for (const bet of activeBets) {
        const tokenPrice = this.tokenPrices.get(bet.token);
        
        if (!tokenPrice) {
          continue; // Price not available yet
        }

        const currentPrice = tokenPrice.price;

        // Check for bust
        if (isBusted(currentPrice, bet.bustPrice, bet.direction)) {
          await this.handleBust(bet, currentPrice);
          continue;
        }

        // Calculate current PnL
        const pnl = calculatePnL(
          bet.entryPrice,
          currentPrice,
          bet.wager,
          bet.leverage,
          bet.direction
        );

        // Update bet with current price and PnL
        bet.currentPrice = currentPrice;
        bet.pnl = pnl;
        await bet.save();

        // Check for auto cashout conditions
        if (bet.autoCashoutEnabled) {
          // Check price-based auto cashout
          if (bet.autoCashoutPrice) {
            const shouldCashout = bet.direction === 'up'
              ? currentPrice >= bet.autoCashoutPrice
              : currentPrice <= bet.autoCashoutPrice;

            if (shouldCashout) {
              await this.handleAutoCashout(bet, currentPrice);
              continue;
            }
          }

          // Check profit-based auto cashout
          if (bet.autoCashoutProfit && pnl >= bet.autoCashoutProfit) {
            await this.handleAutoCashout(bet, currentPrice);
            continue;
          }

          // Check loss-based auto cashout (stop loss)
          if (bet.autoCashoutLoss && pnl <= -bet.autoCashoutLoss) {
            await this.handleAutoCashout(bet, currentPrice);
            continue;
          }
        }

        // Emit PnL update to user
        if (this.io) {
          this.io.to(bet.userId.toString()).emit('trading_bet_update', {
            betId: bet._id,
            currentPrice,
            pnl,
            multiplier: bet.multiplier,
          });
        }
      }
    } catch (error) {
      console.error('❌ Error processing active bets:', error);
    }
  }

  /**
   * Handle bet bust
   */
  private async handleBust(bet: ITradingBet, bustPrice: number): Promise<void> {
    bet.status = 'busted';
    bet.exitPrice = bustPrice;
    bet.currentPrice = bustPrice;
    bet.pnl = -bet.wager; // Lose entire wager
    bet.loss = bet.wager;
    bet.payout = 0;
    bet.bustedAt = new Date();
    await bet.save();

    // Emit bust event
    if (this.io) {
      this.io.to(bet.userId.toString()).emit('trading_bet_busted', {
        betId: bet._id,
        bustPrice,
        loss: bet.loss,
      });
    }

    // Update user balance (deduct loss)
    await this.updateUserBalance(bet.userId, -bet.wager);

    console.log(`💥 Bet ${bet._id} busted at price ${bustPrice}`);
  }

  /**
   * Handle auto cashout
   */
  private async handleAutoCashout(bet: ITradingBet, exitPrice: number): Promise<void> {
    const pnl = calculatePnL(
      bet.entryPrice,
      exitPrice,
      bet.wager,
      bet.leverage,
      bet.direction
    );

    bet.status = 'closed';
    bet.exitPrice = exitPrice;
    bet.currentPrice = exitPrice;
    bet.pnl = pnl;
    bet.closedAt = new Date();

    if (pnl > 0) {
      bet.profit = pnl;
      bet.payout = bet.wager + pnl;
    } else {
      bet.loss = Math.abs(pnl);
      bet.payout = bet.wager + pnl; // Can be less than wager if negative
    }

    await bet.save();

    // Emit cashout event
    if (this.io) {
      this.io.to(bet.userId.toString()).emit('trading_bet_cashed_out', {
        betId: bet._id,
        exitPrice,
        pnl,
        payout: bet.payout,
      });
    }

    // Update user balance
    const balanceChange = pnl;
    await this.updateUserBalance(bet.userId, balanceChange);

    console.log(`💰 Bet ${bet._id} auto-cashed out at price ${exitPrice}, PnL: ${pnl.toFixed(2)}`);
  }

  /**
   * Update user balance via ledger (amount: positive = credit, negative = debit)
   */
  private async updateUserBalance(userId: mongoose.Types.ObjectId, amount: number): Promise<void> {
    try {
      const walletService = (await import('../services/walletService')).default;
      const ref = `trading_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      if (amount >= 0) {
        await walletService.credit(userId, amount, ref, { type: 'payout', description: 'Trading payout' });
      } else {
        await walletService.debit(userId, -amount, ref, { type: 'bet', description: 'Trading loss' });
      }
    } catch (error) {
      console.error(`❌ Failed to update balance for user ${userId}:`, error);
    }
  }
}

// Export singleton instance
const tradingEngine = new TradingEngine();
export default tradingEngine;


import Token from '../models/Token';

interface TokenPriceData {
  symbol: string;
  price: number;
}

export class TokenPriceService {
  private static instance: TokenPriceService;
  private updateInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): TokenPriceService {
    if (!TokenPriceService.instance) {
      TokenPriceService.instance = new TokenPriceService();
    }
    return TokenPriceService.instance;
  }

  // Start the price update service
  public start(): void {
    console.log('🔄 Starting token price update service...');
    
    // Update prices immediately on startup
    this.updateTokenPrices();
    
    // Update prices every 5 minutes
    this.updateInterval = setInterval(() => {
      this.updateTokenPrices();
    }, 5 * 60 * 1000); // 5 minutes
  }

  // Stop the price update service
  public stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log('⏹️ Token price update service stopped');
    }
  }

  // Update token prices from external API
  private async updateTokenPrices(): Promise<void> {
    try {
      console.log('📊 Updating token prices...');
      
      // Get all active tokens
      const tokens = await Token.find({ isActive: true });
      
      if (tokens.length === 0) {
        console.log('ℹ️ No active tokens found');
        return;
      }

      // Fetch prices from external API
      const priceData = await this.fetchTokenPrices(tokens.map(t => t.symbol));
      
      // Update each token's price
      for (const token of tokens) {
        const priceInfo = priceData.find(p => p.symbol.toLowerCase() === token.symbol.toLowerCase());
        
        if (priceInfo) {
          await Token.findByIdAndUpdate(token._id, {
            price: priceInfo.price,
            updatedAt: new Date()
          });
          console.log(`✅ Updated ${token.symbol}: $${priceInfo.price}`);
        } else {
          console.log(`⚠️ No price data found for ${token.symbol}`);
        }
      }
      
      console.log('✅ Token prices updated successfully');
    } catch (error) {
      console.error('❌ Error updating token prices:', error);
    }
  }

  // Fetch token prices from external API
  private async fetchTokenPrices(symbols: string[]): Promise<TokenPriceData[]> {
    try {
      // You can use various APIs here:
      // - CoinGecko API
      // - CoinMarketCap API
      // - Binance API
      // - etc.
      
      // For now, using CoinGecko API as an example
      const symbolsString = symbols.join(',');
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${symbolsString}&vs_currencies=usd`,
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Transform the response to our format
      const priceData: TokenPriceData[] = [];
      for (const [symbol, priceInfo] of Object.entries(data)) {
        if (typeof priceInfo === 'object' && priceInfo !== null && 'usd' in priceInfo) {
          priceData.push({
            symbol,
            price: (priceInfo as any).usd
          });
        }
      }

      return priceData;
    } catch (error) {
      console.error('Error fetching token prices:', error);
      
      // Fallback: return mock data for development
      if (process.env.NODE_ENV === 'development') {
        return symbols.map(symbol => ({
          symbol,
          price: Math.random() * 1000 + 1 // Random price between 1-1000
        }));
      }
      
      throw error;
    }
  }

  // Manual price update for a specific token
  public async updateSingleTokenPrice(tokenId: string, price: number): Promise<void> {
    try {
      await Token.findByIdAndUpdate(tokenId, {
        price,
        updatedAt: new Date()
      });
      console.log(`✅ Manually updated token ${tokenId} price to $${price}`);
    } catch (error) {
      console.error('Error updating single token price:', error);
      throw error;
    }
  }

  // Get current prices for all active tokens
  public async getCurrentPrices(): Promise<TokenPriceData[]> {
    try {
      const tokens = await Token.find({ isActive: true }).select('symbol price');
      return tokens.map(token => ({
        symbol: token.symbol,
        price: token.price
      }));
    } catch (error) {
      console.error('Error getting current prices:', error);
      throw error;
    }
  }
}

export default TokenPriceService.getInstance();

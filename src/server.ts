import dotenv from 'dotenv';
import path from "path";

// Load env from project root regardless of whether we run from `src/` or compiled `build/`.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import cors, { CorsOptions } from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { createMorganStream, log } from './utils/logger';

import authRoutes from './routes/auth';
import authCheckRoutes from './routes/authCheck';
import userRoutes from './routes/user';
import chatRoutes from './routes/chat';
import coinflipRoutes from './routes/coinflip';
import tokenRoutes from './routes/token';
import cronRoutes from './routes/cron';
import transactionRoutes from './routes/transaction';
import gameHistoryRoutes from './routes/gameHistory';
import gameStatusRoutes from './routes/gameStatus';
import adminRoutes from './routes/admin';
import houseRoutes from './routes/house';
import settingsRoutes from './routes/settings';
import chartRoutes from './routes/charts';
import xpRoutes from './routes/xpRoutes';
import notificationRoutes from './routes/notification';
import tradingRoutes from './routes/trading';
import { initSocketIO } from './websocket';
import { connectWithRetry } from './config/database';
import mongoose from 'mongoose';
import { ChatService } from './services/chatService';
import cronService from './services/cronService';
import tokenPriceService from './services/tokenPriceService';
import houseService from './services/houseService';
import gameSettingsService from './services/gameSettingsService';

// Shared/public build: payment and bot modules removed. Server runs with HTTP only for easy testing.

const app = express();
app.set('trust proxy', 1);

// Flush buffered file logs on shutdown (best-effort).
process.on('SIGINT', async () => {
  try {
    await log.flush();
  } finally {
    process.exit(0);
  }
});
process.on('SIGTERM', async () => {
  try {
    await log.flush();
  } finally {
    process.exit(0);
  }
});

// CORS configuration - MUST be before helmet to avoid conflicts
const defaultOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  "http://localhost:3000",
  process.env.ADMIN_FRONTEND_URL || "http://localhost:3002",
  "http://localhost:3002",
  "http://localhost", // Allow localhost without port for flexibility
];
const extraOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o: string) => o.trim())
  .filter(Boolean);
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...extraOrigins]));

log.info('@@  Allowed origins:', allowedOrigins);
log.info('   NODE_ENV:', process.env.NODE_ENV);

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server or direct curl/postman (no origin)
    if (!origin) {
      log.info('✅ CORS: No origin header, allowing request');
      return callback(null, true);
    }
    
    // Normalize origin (remove trailing slash, ensure lowercase for comparison)
    const normalizedOrigin = origin.toLowerCase().replace(/\/$/, '');
    const normalizedAllowed = allowedOrigins.map((o: string) => o.toLowerCase().replace(/\/$/, ''));
    
    log.info(`🔍 CORS check - Origin: ${origin}, Normalized: ${normalizedOrigin}`);
    log.info(`🔍 CORS check - Allowed origins:`, normalizedAllowed);
    
    // Check exact match
    if (normalizedAllowed.includes(normalizedOrigin)) {
      log.info(`✅ CORS: Origin ${origin} is allowed (exact match)`);
      return callback(null, true);
    }
    
    // Also allow localhost with any port in development (very permissive for dev)
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';
    if (isDevelopment) {
      if (normalizedOrigin.startsWith('http://localhost:') || normalizedOrigin.startsWith('http://127.0.0.1:')) {
        log.info(`✅ CORS: Origin ${origin} is allowed (development localhost)`);
        return callback(null, true);
      }
    }
    
    log.error(`❌ CORS BLOCKED - Origin: ${origin} (normalized: ${normalizedOrigin})`);
    log.error(`❌ Allowed origins:`, allowedOrigins);
    log.error(`❌ NODE_ENV: ${process.env.NODE_ENV}, isDevelopment: ${isDevelopment}`);
    // Return false instead of Error to properly handle CORS rejection
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Request-Id']
};

// Handle OPTIONS preflight requests FIRST - before CORS middleware
// This ensures OPTIONS requests get proper CORS headers immediately
app.options('*', (req: Request, res: Response) => {
  const origin = req.headers.origin || 'no origin';
  // Always allow OPTIONS in development for localhost
  const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';
  let isAllowed = false;
  
  if (origin && origin !== 'no origin') {
    const normalizedOrigin = origin.toLowerCase().replace(/\/$/, '');
    const normalizedAllowed = allowedOrigins.map((o: string) => o.toLowerCase().replace(/\/$/, ''));
    isAllowed = normalizedAllowed.includes(normalizedOrigin) || 
                (isDevelopment && (normalizedOrigin.startsWith('http://localhost:') || normalizedOrigin.startsWith('http://127.0.0.1:')));
  } else if (isDevelopment) {
    // In development, allow requests with no origin
    isAllowed = true;
  }
  
  if (isAllowed || isDevelopment) {
    // Set CORS headers
    if (origin && origin !== 'no origin') {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (isDevelopment) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    log.info(`✅ OPTIONS: CORS headers set for ${origin}`);
    return res.status(204).end();
  } else {
    log.error(`❌ OPTIONS: Origin ${origin} not allowed`);
    return res.status(403).end();
  }
});

// Apply CORS middleware BEFORE helmet - this is critical!
app.use(cors(corsOptions));

// Security middleware - AFTER CORS so it doesn't interfere
app.use(helmet({
  crossOriginResourcePolicy: false, // Disable to allow CORS
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false // Temporarily disable to debug CORS
}));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10000'), // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(
  morgan(':method :url :status :res[content-length] - :response-time ms', {
    stream: createMorganStream(),
  }),
);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth', authCheckRoutes);
// Switch selected routes to local JWT verification
app.use('/api/user', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/coinflip', coinflipRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/token', tokenRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/game-history', gameHistoryRoutes);
app.use('/api/game-status', gameStatusRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/house', houseRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/charts', chartRoutes);
app.use('/api/xp', xpRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/trading', tradingRoutes);
// Feature trading routes removed

// Setup WebSocket

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  // Don't treat CORS errors as 500 errors
  if (err.message && err.message.includes('CORS')) {
    log.warn(`⚠️ CORS error: ${err.message} from origin: ${req.headers.origin}`);
    return res.status(403).json({
      error: 'CORS error',
      message: err.message
    });
  }
  
  log.error('Error:', err.message);
  if (err.stack) {
    log.error(err.stack);
  }
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';


// Shared build: HTTP only so users can run and test without TLS. For production HTTPS, use a reverse proxy.
const server = createServer(app);

// Initialize Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow server-to-server or direct curl/postman (no origin)
      if (!origin) {
        return callback(null, true);
      }
      
      // Normalize origin (remove trailing slash, ensure lowercase for comparison)
      const normalizedOrigin = origin.toLowerCase().replace(/\/$/, '');
      const normalizedAllowed = allowedOrigins.map(o => o.toLowerCase().replace(/\/$/, ''));
      
      // Check exact match
      if (normalizedAllowed.includes(normalizedOrigin)) {
        return callback(null, true);
      }
      
      // Also allow localhost with any port in development
      const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';
      if (isDevelopment && (normalizedOrigin.startsWith('http://localhost:') || normalizedOrigin.startsWith('http://127.0.0.1:'))) {
        return callback(null, true);
      }
      
      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true
  },
  maxHttpBufferSize: 1024 * 1024, // 1MB max message size
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
});

// Initialize Socket.IO handlers
initSocketIO(io);

// Initialize server after database connection
async function initializeServer() {
  try {
    log.info('🔄 Connecting to MongoDB...');
    await connectWithRetry();
    log.info('✅ Database connection established, starting services...');

    // Now start the server
    server.listen(PORT, () => {
      log.info(`🚀 Server running on port ${PORT}`);
      log.info(`📡 WebSocket server ready`);
      log.info(`🌍 Environment: ${NODE_ENV}`);
      const PROTOCOL = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      log.info(`🔗 API Base URL: ${PROTOCOL}://localhost:${PORT}/api`);
      log.info(`🔗 Health Check: ${PROTOCOL}://localhost:${PORT}/health`);

      // Initialize cron jobs
      cronService.init();

      // Start token price update service
      // tokenPriceService.start();

      // Initialize house
      houseService.getHouse().then(house => {
        log.info(`🏠 House initialized with treasury balance: ${house.treasuryBalance}`);
      }).catch(error => {
        log.error('❌ Failed to initialize house:', error);
      });

      // Initialize game settings (wait for it to complete)
      gameSettingsService.initializeSettings()
        .then(async (settings) => {
          log.info(`⚙️ Game settings initialized (version ${settings.version})`);

          // Shared/public build: game engines are private.
          // We do not start crash/roulette/mine engines here.

          // Start trading engine
          try {
            const tradingEngine = require('./engine/tradingEngine').default;
            await tradingEngine.start(io);
            log.info('📈 Trading engine started');
          } catch (error: any) {
            log.error('❌ Failed to start trading engine:', error);
          }
        })
        .catch(error => {
          log.error('❌ Failed to initialize game settings:', error);
        });

      // Run initial cleanup on startup
      ChatService.cleanupOldMessages().then(deletedCount => {
        if (deletedCount > 0) {
          log.info(`🧹 Initial cleanup: removed ${deletedCount} old chat messages`);
        }
      });
    });
  } catch (error) {
    log.error('❌ Failed to connect to database. Server will not start.', error);
    process.exit(1);
  }
}

// Start initialization
initializeServer();

export { app, server }; 
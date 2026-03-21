import mongoose from 'mongoose';

// Track connection state to prevent multiple simultaneous connections
let isConnecting = false;
let retryTimeout: NodeJS.Timeout | null = null;
let retryCount = 0;
const MAX_RETRIES = 5;

export const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/spinx';

    await mongoose.connect(mongoURI);

    console.log('✅ MongoDB connected successfully');
    console.log(`📊 Database: ${mongoose.connection.name}`);
    console.log(`🔗 URI: ${mongoURI}`);

  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Promise that resolves when connection is ready
let connectionPromise: Promise<void> | null = null;
let connectionResolve: (() => void) | null = null;
let connectionReject: ((error: Error) => void) | null = null;

export const connectWithRetry = async (): Promise<void> => {
  // If already connected, resolve immediately
  if (mongoose.connection.readyState === 1) {
    console.log('✅ Already connected to MongoDB');
    return Promise.resolve();
  }

  // If connection is in progress, return the existing promise
  if (connectionPromise) {
    return connectionPromise;
  }

  // Create new connection promise
  connectionPromise = new Promise((resolve, reject) => {
    connectionResolve = resolve;
    connectionReject = reject;
  });

  // Start connection attempt
  attemptConnection();

  return connectionPromise;
};

const RETRY_DELAY_MS = 10000; // 10 seconds between retries

const attemptConnection = async (): Promise<void> => {
  // Prevent multiple simultaneous connection attempts
  if (isConnecting) {
    console.log('🔄 Connection already in progress, waiting...');
    return;
  }

  // Check retry limit - stop after MAX_RETRIES attempts
  if (retryCount >= MAX_RETRIES) {
    const error = new Error(`Maximum retry attempts (${MAX_RETRIES}) reached. Giving up.`);
    console.error(`❌ ${error.message}`);
    if (connectionReject) {
      connectionReject(error);
      connectionPromise = null;
      connectionResolve = null;
      connectionReject = null;
    }
    process.exit(1);
    return;
  }

  isConnecting = true;
  retryCount++;

  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/spinx';

    // Close any existing connection before attempting to connect
    if (mongoose.connection.readyState !== 0) {
      console.log('🔄 Closing existing connection...');
      await mongoose.disconnect();
    }

    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log('✅ MongoDB connected successfully');
    console.log(`📊 Database: ${mongoose.connection.name}`);
    console.log(`🔄 Connection attempt: ${retryCount}/${MAX_RETRIES}`);

    // Reset retry count on successful connection
    retryCount = 0;
    isConnecting = false;

    // Clear any pending retry timeout
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = null;
    }

    // Resolve the connection promise
    if (connectionResolve) {
      connectionResolve();
      connectionPromise = null;
      connectionResolve = null;
      connectionReject = null;
    }
  } catch (err) {
    console.error(
      `❌ MongoDB connection failed (attempt ${retryCount}/${MAX_RETRIES}). Next retry in ${RETRY_DELAY_MS / 1000}s...`,
      err
    );

    if (retryTimeout) {
      clearTimeout(retryTimeout);
    }

    isConnecting = false;

    if (retryCount < MAX_RETRIES) {
      retryTimeout = setTimeout(() => {
        retryTimeout = null;
        attemptConnection();
      }, RETRY_DELAY_MS);
    } else {
      // Max retries reached, stop
      const error = new Error(`Maximum retry attempts (${MAX_RETRIES}) reached. Giving up.`);
      console.error(`❌ ${error.message}`);
      if (connectionReject) {
        connectionReject(error);
        connectionPromise = null;
        connectionResolve = null;
        connectionReject = null;
      }
      process.exit(1);
    }
  }
}

// Handle unexpected disconnects - log only; do not auto-retry (avoids infinite reconnect loops)
mongoose.connection.on("disconnected", () => {
  console.error("⚠️ MongoDB disconnected.");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB error:", err.message);
  // Reset connection state on error
  isConnecting = false;
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down MongoDB connection...');
  if (retryTimeout) {
    clearTimeout(retryTimeout);
  }
  await mongoose.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down MongoDB connection...');
  if (retryTimeout) {
    clearTimeout(retryTimeout);
  }
  await mongoose.disconnect();
  process.exit(0);
});


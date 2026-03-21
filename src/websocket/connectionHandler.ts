import { Socket } from 'socket.io';
import { ChatClient } from './types';
import { getUserFromPlatformToken } from './authService';
import { setupGameEventHandlers } from './gameEventHandlers';
import { setupAdminEventHandlers } from './adminEventHandlers';
import { setupGameStatusEventHandlers } from './gameStatusEventHandlers';
import { handleTradingEvents } from './tradingEventHandlers';

export const chatClients = new Map<Socket, ChatClient>();
const MAX_CONNECTIONS = 1000;

// Setup read-only event handlers for anonymous users
function setupReadOnlyEventHandlers(socket: Socket, client: ChatClient) {
  console.log(`👁️ Setting up read-only event handlers for ${client.user.username}`);

  // Allow anonymous users to get game lists (read-only)
  socket.on('coinflip_get_games', async (data: any) => {
    try {
      console.log(`👁️ ${client.user.username} requested coinflip games (read-only)`);
      // Implementation would go here - keeping it simple for now
    } catch (error) {
      console.error('Error getting coinflip games:', error);
    }
  });

  // Setup server settings handler for anonymous users
  socket.on('get_server_settings', async () => {
    try {
      console.log(`👁️ ${client.user.username} requested server settings`);
      const gameSettingsService = require('../services/gameSettingsService').default;
      const settings = await gameSettingsService.getPublicSettings();
      socket.emit('server_settings', {
        success: true,
        data: settings,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting server settings for anonymous user:', error);
      socket.emit('server_settings_error', {
        success: false,
        error: 'Failed to get server settings',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Setup game status handlers for anonymous users too
  setupGameStatusEventHandlers(socket, client);

  // Setup chat handlers for anonymous users
  setupChatHandlersForAnonymous(socket, client);

  // Add other read-only handlers as needed
}

// Setup chat handlers for anonymous users
function setupChatHandlersForAnonymous(socket: Socket, client: ChatClient) {
  console.log(`💬 Setting up chat handlers for anonymous user ${client.user.username}`);

  // Handle request for chat history (read-only)
  socket.on('get_chat_history', async (data: any) => {
    try {
      console.log(`📜 ${client.user.username} requested chat history`);
      
      const ChatModel = require('../models/Chat').default;
      const { limit = 50, room = 'default' } = data;
      
      const messages = await ChatModel.find({ 
        isDeleted: false,
        room: room 
      })
        .populate('userId', 'username avatar level')
        .sort({ createdAt: -1 })
        .limit(limit);

      const formattedMessages = messages.reverse().map((msg: any) => {
        // Handle both authenticated and anonymous messages
        if (msg.isAnonymous) {
          return {
            id: msg._id,
            user: {
              id: msg.anonymousId,
              username: msg.anonymousUsername,
              avatar: '/assets/images/avatar/default.png',
              level: 0,
              isAnonymous: true
            },
            message: msg.message,
            timestamp: msg.createdAt,
            isHistory: true
          };
        } else {
          return {
            id: msg._id,
            user: {
              id: msg.userId._id,
              username: msg.userId.username,
              avatar: msg.userId.avatar,
              level: msg.userId.level,
              isAnonymous: false
            },
            message: msg.message,
            timestamp: msg.createdAt,
            isHistory: true
          };
        }
      });

      socket.emit('chat_history', {
        messages: formattedMessages,
        timestamp: new Date().toISOString()
      });

      console.log(`📜 Sent ${formattedMessages.length} chat history messages to ${client.user.username}`);

    } catch (error) {
      console.error('Error getting chat history for anonymous user:', error);
      socket.emit('chat_error', {
        message: 'Failed to get chat history',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle chat messages from anonymous users (with restrictions)
  socket.on('chat', async (data: any) => {
    try {
      const { message } = data;

      if (!message || message.trim().length === 0) {
        socket.emit('chat_error', {
          message: 'Message cannot be empty',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (message.length > 500) {
        socket.emit('chat_error', {
          message: 'Message too long (max 500 characters)',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Create anonymous chat message
      const ChatModel = require('../models/Chat').default;
      const chatMessage = new ChatModel({
        userId: null, // Anonymous users don't have a userId
        message: message.trim(),
        room: 'default',
        isAnonymous: true,
        anonymousUsername: client.user.username,
        anonymousId: client.user.id
      });

      await chatMessage.save();

      // Broadcast to all connected clients
      const { getIO } = require('./index');
      const io = getIO();
      
      const broadcastData = {
        id: chatMessage._id,
        user: {
          id: client.user.id,
          username: client.user.username,
          avatar: client.user.avatar,
          level: client.user.level,
          isAnonymous: true
        },
        message: chatMessage.message,
        timestamp: chatMessage.createdAt
      };

      io.emit('chat', broadcastData);

      console.log(`💬 Anonymous user ${client.user.username} sent chat message: ${message}`);

    } catch (error) {
      console.error('Error handling anonymous chat message:', error);
      socket.emit('chat_error', {
        message: 'Failed to send message',
        timestamp: new Date().toISOString()
      });
    }
  });
}

// Setup basic handlers for all connections
function setupBasicHandlers(socket: Socket, client: ChatClient) {
  console.log(`🔧 Setting up basic handlers for ${client.user.username}`);

  // Ping handler
  socket.on('ping', () => {
    client.lastPing = Date.now();
    client.isAlive = true;
    socket.emit('pong');
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    console.log(`🔌 ${client.user.username} disconnected`);
    chatClients.delete(socket);
  });
}

export function handleConnection(socket: Socket) {
  console.log(`🔌 New WebSocket connection from ${socket.handshake.address} (ID: ${socket.id})`);
  
  // Check connection limit
  if (chatClients.size >= MAX_CONNECTIONS) {
    console.error('Maximum connections reached, rejecting new connection');
    socket.disconnect(true);
    return;
  }

  // Extract platform token only (no Supabase)
  const platformToken = extractPlatformToken(socket);
  const client = createClient(socket, platformToken);
  chatClients.set(socket, client);

  console.log(`📊 Client created and stored. Total clients: ${chatClients.size}`);

  if (platformToken) {
    handleAuthenticatedConnection(socket, client, platformToken);
  } else {
    handleAnonymousConnection(socket, client);
  }
}

// Extract platform JWT from cookie, auth, or Authorization header only
function extractPlatformToken(socket: Socket): string | undefined {
  const cookieHeader = socket.handshake.headers.cookie || '';
  const cookies = cookieHeader.split(';').map((p) => p.trim().split('='));
  const tokenCookie = cookies.find(([name]) => name === 'platform-token');
  const fromCookie = tokenCookie && tokenCookie[1] ? decodeURIComponent(tokenCookie[1]) : undefined;
  const fromAuth = socket.handshake.auth?.platformToken as string;
  const authHeader = socket.handshake.headers?.authorization?.toString();
  const fromHeader = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
  return fromCookie || fromAuth || fromHeader;
}

// Create client with basic properties
function createClient(socket: Socket, token?: string): ChatClient {
  return {
    socket,
    room: 'global',
    tokenValidation: null,
    lastPing: Date.now(),
    isAlive: true,
    isAuthenticated: false,
    isAnonymous: !token,
    user: {
      id: '',
      username: '',
      avatar: '',
      level: 0
    },
    rooms: new Set(['global'])
  };
}

// Handle anonymous connections (read-only)
async function handleAnonymousConnection(socket: Socket, client: ChatClient) {
  console.log('🔓 Setting up anonymous connection (read-only)');

  const anonymousUser = {
    id: 'anonymous_' + Date.now(),
    username: 'Anonymous',
    avatar: '/assets/images/avatar/default.png',
    level: 0
  };

  // Update client
  client.user = anonymousUser;
  client.isAuthenticated = false;
  client.isAnonymous = true;

  // Setup handlers (read-only)
  setupBasicHandlers(socket, client);
  setupReadOnlyEventHandlers(socket, client);
  handleTradingEvents(socket); // Trading events available to all

  // Send success response
  emitConnectionSuccess(socket, anonymousUser, false, true);
}

// Handle authenticated connections (platform JWT only)
async function handleAuthenticatedConnection(
  socket: Socket,
  client: ChatClient,
  platformToken: string
) {
  console.log('🔐 Setting up authenticated connection');

  const { user, error } = await getUserFromPlatformToken(platformToken);
  if (!user) {
    console.log('❌ Authentication failed:', error, '- falling back to anonymous');
    await handleAnonymousConnection(socket, client);
    return;
  }

  // Update client with authenticated user
  client.user = {
    id: user._id.toString(),
    username: user.username,
    avatar: user.avatar,
    level: user.level,
    role: user.role
  };
  client.isAuthenticated = true;
  client.isAnonymous = false;
  client.isAdmin = user.isAdmin;
  
  // Set token validation for chat service compatibility
  client.tokenValidation = {
    userId: user._id.toString(),
    valid: true
  };

  // Join user to their personal room for targeted notifications
  socket.join(user._id.toString());
  console.log(`✅ User ${user.username} joined personal room: ${user._id.toString()}`);

  // Setup handlers based on user type
  setupBasicHandlers(socket, client);
  setupGameEventHandlers(socket, client);
  setupGameStatusEventHandlers(socket, client);
  handleTradingEvents(socket); // Trading events

  // Add admin handlers if needed
  if (user.isAdmin) {
    console.log('🔧 Setting up admin handlers');
    setupAdminEventHandlers(socket, client);
  }

  // Send success response
  emitConnectionSuccess(socket, user, true, false);
  socket.emit('auth_success', { user, timestamp: new Date().toISOString() });
}

// Emit connection success event
function emitConnectionSuccess(
  socket: Socket, 
  user: any, 
  isAuthenticated: boolean, 
  isAnonymous: boolean
) {
  socket.emit('connection_success', {
    user,
    isAuthenticated,
    isAnonymous,
    timestamp: new Date().toISOString()
  });
}
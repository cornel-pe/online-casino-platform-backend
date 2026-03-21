import { Server as SocketIOServer, Socket } from 'socket.io';
import { handleConnection } from './connectionHandler';
import { ChatClient } from './types';

let io: SocketIOServer;

export function initSocketIO(socketIO: SocketIOServer) {
  io = socketIO;

  // Set up connection handler
  io.on('connection', handleConnection);
  console.log('Socket.IO server started with simplified global event system');

  // Add connection debugging
  io.on('connect', (socket) => {
    console.log(`🔌 New client connected: ${socket.id}`);
    console.log(`📊 Total connections: ${io.sockets.sockets.size}`);
  });

  io.on('disconnect', (socket) => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    console.log(`📊 Total connections: ${io.sockets.sockets.size}`);
  });
}

export function broadcast(data: any, filter?: (client: ChatClient) => boolean) {
  if (!io) {
    console.error('Socket.IO server not initialized');
    return;
  }

  io.emit(data.type, data.data);
  // io.to("/default").emit("chat", data);
  // io.emit("test", data);
}

export function broadcastToRoom(room: string, event: string, data: unknown) {
  if (!io) {
    console.error('Socket.IO server not initialized');
    return;
  }

  // Get the room and check how many clients are in it
  const roomSockets = io.sockets.adapter.rooms.get(room);
  const clientCount = roomSockets ? roomSockets.size : 0;


  if (clientCount > 0) {
    io.to(room).emit(event, data);
    console.log(`✅ Broadcasted ${event} to room ${room} with data:`, data);
  } else {
    console.log(`⚠️ Room ${room} has no clients, skipping broadcast`);
  }
}

// Get connection statistics
export function getConnectionStats() {
  return {
    totalConnections: io ? io.sockets.sockets.size : 0,
    rooms: io ? Array.from(io.sockets.adapter.rooms.entries()).map(([room, sockets]) => ({
      room,
      clientCount: sockets.size
    })) : []
  };
}

// Get room information
export function getRoomInfo(room: string) {
  if (!io) {
    return { room, clientCount: 0, exists: false };
  }

  const roomSockets = io.sockets.adapter.rooms.get(room);
  return {
    room,
    clientCount: roomSockets ? roomSockets.size : 0,
    exists: !!roomSockets
  };
}

// Graceful shutdown
export function closeSocketIO() {
  return new Promise<void>((resolve) => {
    if (io) {
      io.close(() => {
        console.log('Socket.IO server gracefully shut down');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

// Export io instance for use in other modules
export function getIO(): SocketIOServer {
  return io;
}

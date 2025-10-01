const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json());

// Socket.IO setup
const io = socketIO(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Store chat messages in memory (use Redis in production)
const chatMessages = new Map();

// Store active episode rooms and their comments
const episodeRooms = new Map();

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // When someone joins an episode room for comments
  socket.on('join_episode', async ({ animeId, episodeId }) => {
    const room = `episode:${animeId}:${episodeId}`;
    
    try {
      socket.join(room);
      console.log(`📨 User ${socket.id} joined ${room}`);

      // Initialize room if it doesn't exist
      if (!episodeRooms.has(room)) {
        episodeRooms.set(room, {
          animeId,
          episodeId,
          comments: [],
          users: new Set()
        });
      }

      const roomData = episodeRooms.get(room);
      roomData.users.add(socket.id);

      // Send current comments to the user
      socket.emit('comments_updated', roomData.comments);
      console.log(`📤 Sent ${roomData.comments.length} comments to user ${socket.id}`);

    } catch (error) {
      console.error('❌ Error joining episode room:', error);
      socket.emit('error', { message: 'Failed to join episode room' });
    }
  });

  // When someone adds a comment
  socket.on('new_comment', (comment) => {
    try {
      const room = `episode:${comment.animeId}:${comment.episodeId}`;
      console.log(`💬 New comment in ${room}:`, comment);

      // Add comment to room data
      if (episodeRooms.has(room)) {
        const roomData = episodeRooms.get(room);
        
        // Add unique ID if not present
        if (!comment.id) {
          comment.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        }
        
        // Add timestamp if not present
        if (!comment.createdAt) {
          comment.createdAt = new Date().toISOString();
        }

        roomData.comments.push(comment);
        
        // Keep only last 100 comments to prevent memory issues
        if (roomData.comments.length > 100) {
          roomData.comments = roomData.comments.slice(-100);
        }

        // Broadcast to everyone in the room including the sender
        io.to(room).emit('new_comment', comment);
        console.log(`📤 Broadcasted comment to ${roomData.users.size} users in ${room}`);
      } else {
        console.warn(`⚠️ Room ${room} not found for new comment`);
      }

    } catch (error) {
      console.error('❌ Error handling new comment:', error);
      socket.emit('error', { message: 'Failed to add comment' });
    }
  });

  // When someone deletes a comment
  socket.on('comment_deleted', ({ commentId, animeId, episodeId }) => {
    try {
      const room = `episode:${animeId}:${episodeId}`;
      console.log(`🗑️ Deleting comment ${commentId} from ${room}`);

      if (episodeRooms.has(room)) {
        const roomData = episodeRooms.get(room);
        roomData.comments = roomData.comments.filter(comment => comment.id !== commentId);

        // Broadcast to everyone in the room
        io.to(room).emit('comment_deleted', commentId);
        console.log(`📤 Broadcasted comment deletion to ${roomData.users.size} users in ${room}`);
      }

    } catch (error) {
      console.error('❌ Error deleting comment:', error);
      socket.emit('error', { message: 'Failed to delete comment' });
    }
  });

  // When someone joins a chat room
  socket.on('join_chat', ({ animeId, episodeId }) => {
    const room = `chat:${animeId}:${episodeId}`;
    
    try {
      socket.join(room);
      console.log(`💬 User ${socket.id} joined chat ${room}`);

      // Initialize chat room if it doesn't exist
      if (!chatMessages.has(room)) {
        chatMessages.set(room, []);
      }

    } catch (error) {
      console.error('❌ Error joining chat room:', error);
      socket.emit('error', { message: 'Failed to join chat room' });
    }
  });

  // When someone sends a chat message
  socket.on('send_message', (messageData) => {
    try {
      const room = `chat:${messageData.animeId}:${messageData.episodeId}`;
      console.log(`💌 New chat message in ${room}:`, messageData);

      // Add message to chat history
      if (!chatMessages.has(room)) {
        chatMessages.set(room, []);
      }

      const messages = chatMessages.get(room);
      
      // Add unique ID and timestamp
      const messageWithId = {
        ...messageData,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        timestamp: messageData.timestamp || new Date().toISOString()
      };

      messages.push(messageWithId);
      
      // Keep only last 100 messages to prevent memory issues
      if (messages.length > 100) {
        chatMessages.set(room, messages.slice(-100));
      }

      // Broadcast to everyone in the room including the sender
      io.to(room).emit('new_message', messageWithId);
      console.log(`📤 Broadcasted chat message to room ${room}`);

    } catch (error) {
      console.error('❌ Error handling chat message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Get chat history
  socket.on('get_chat_history', ({ animeId, episodeId }, callback) => {
    try {
      const room = `chat:${animeId}:${episodeId}`;
      const messages = chatMessages.get(room) || [];
      
      console.log(`📚 Sending ${messages.length} chat messages to user ${socket.id}`);
      
      if (typeof callback === 'function') {
        callback(messages);
      }

    } catch (error) {
      console.error('❌ Error getting chat history:', error);
      if (typeof callback === 'function') {
        callback([]);
      }
    }
  });

  // Leave episode room
  socket.on('leave_episode', ({ animeId, episodeId }) => {
    const room = `episode:${animeId}:${episodeId}`;
    
    try {
      socket.leave(room);
      
      if (episodeRooms.has(room)) {
        const roomData = episodeRooms.get(room);
        roomData.users.delete(socket.id);
        
        // Clean up empty rooms
        if (roomData.users.size === 0) {
          episodeRooms.delete(room);
          console.log(`🧹 Cleaned up empty room ${room}`);
        }
      }
      
      console.log(`👋 User ${socket.id} left ${room}`);

    } catch (error) {
      console.error('❌ Error leaving episode room:', error);
    }
  });

  // Leave chat room
  socket.on('leave_chat', ({ animeId, episodeId }) => {
    const room = `chat:${animeId}:${episodeId}`;
    
    try {
      socket.leave(room);
      console.log(`👋 User ${socket.id} left chat ${room}`);

    } catch (error) {
      console.error('❌ Error leaving chat room:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`❌ User disconnected: ${socket.id} (${reason})`);
    
    // Clean up user from all rooms
    for (const [room, roomData] of episodeRooms.entries()) {
      if (roomData.users.has(socket.id)) {
        roomData.users.delete(socket.id);
        
        // Clean up empty rooms
        if (roomData.users.size === 0) {
          episodeRooms.delete(room);
          console.log(`🧹 Cleaned up empty room ${room} after user disconnect`);
        }
      }
    }
  });

  // Error handling
  socket.on('error', (error) => {
    console.error('🔴 Socket error:', error);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  const healthData = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    connectedClients: io.engine.clientsCount,
    activeEpisodeRooms: episodeRooms.size,
    activeChatRooms: chatMessages.size,
    memoryUsage: process.memoryUsage()
  };
  
  console.log('🏥 Health check:', healthData);
  res.json(healthData);
});

// Get server statistics
app.get('/stats', (req, res) => {
  const stats = {
    episodeRooms: Array.from(episodeRooms.entries()).map(([room, data]) => ({
      room,
      userCount: data.users.size,
      commentCount: data.comments.length
    })),
    chatRooms: Array.from(chatMessages.entries()).map(([room, messages]) => ({
      room,
      messageCount: messages.length
    }))
  };
  
  res.json(stats);
});

// Handle 404
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('🔴 Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
  console.log(`🌐 CORS enabled for: ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
  console.log(`🏥 Health check available at: http://localhost:${PORT}/health`);
  console.log(`📊 Stats available at: http://localhost:${PORT}/stats`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

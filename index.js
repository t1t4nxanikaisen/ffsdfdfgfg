const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Get allowed origins from environment or use defaults
const allowedOrigins = process.env.CLIENT_URL 
  ? process.env.CLIENT_URL.split(',') 
  : ["http://localhost:3000", "https://your-anime-site.vercel.app"];

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json());

// Socket.IO setup
const io = socketIO(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'] // Important for Vercel
});

// Store chat messages in memory (use Redis in production)
const chatMessages = new Map();

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // When someone adds a comment (broadcast to other users)
  socket.on('new_comment', (comment) => {
    try {
      console.log('💬 Broadcasting new comment to other users:', comment);
      
      // Broadcast to everyone EXCEPT the sender
      socket.broadcast.emit('new_comment', comment);
      console.log(`📤 Broadcasted comment to other users`);

    } catch (error) {
      console.error('❌ Error broadcasting new comment:', error);
      socket.emit('error', { message: 'Failed to broadcast comment' });
    }
  });

  // When someone deletes a comment (broadcast to other users)
  socket.on('comment_deleted', (data) => {
    try {
      console.log(`🗑️ Broadcasting deleted comment to other users:`, data);
      
      // Broadcast to everyone EXCEPT the sender
      socket.broadcast.emit('comment_deleted', data);
      console.log(`📤 Broadcasted comment deletion to other users`);

    } catch (error) {
      console.error('❌ Error broadcasting deleted comment:', error);
      socket.emit('error', { message: 'Failed to broadcast comment deletion' });
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
    activeChatRooms: chatMessages.size,
    uptime: process.uptime()
  };
  
  console.log('🏥 Health check:', healthData);
  res.json(healthData);
});

// Get server statistics
app.get('/stats', (req, res) => {
  const stats = {
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
  console.log(`🌐 Allowed origins:`, allowedOrigins);
  console.log(`🏥 Health check available at: http://localhost:${PORT}/health`);
});

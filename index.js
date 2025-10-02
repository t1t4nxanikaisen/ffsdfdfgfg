const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Middleware - Allow all origins for now
app.use(cors({
  origin: "*",
  credentials: true
}));
app.use(express.json());

// Socket.IO setup
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Store chat messages in memory
const chatMessages = new Map();

// ========== API ROUTES ==========

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Socket.IO Server is running!',
    status: 'OK',
    timestamp: new Date().toISOString(),
    endpoints: [
      '/health',
      '/stats', 
      '/api/test',
      '/api/comments/test'
    ]
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    server: 'Socket.IO API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    clients: io.engine?.clientsCount || 0
  });
});

// Stats endpoint
app.get('/stats', (req, res) => {
  res.json({
    status: 'Running',
    chatRooms: chatMessages.size,
    totalMessages: Array.from(chatMessages.values()).reduce((acc, msgs) => acc + msgs.length, 0),
    timestamp: new Date().toISOString()
  });
});

// Test API endpoint
app.get('/api/test', (req, res) => {
  res.json({
    message: 'API is working!',
    endpoint: '/api/test',
    method: 'GET',
    timestamp: new Date().toISOString()
  });
});

// Test comments API
app.get('/api/comments/test', (req, res) => {
  res.json({
    message: 'Comments API is working!',
    testComment: {
      id: 'test-' + Date.now(),
      comment: 'This is a test comment from the API',
      user: {
        username: 'TestUser',
        avatar: null,
        isAdmin: false
      },
      animeId: 'test-anime',
      episodeId: 'test-episode',
      createdAt: new Date().toISOString()
    }
  });
});

// POST endpoint for comments
app.post('/api/comments', (req, res) => {
  const { animeId, episodeId, comment, userId } = req.body;
  
  res.json({
    success: true,
    message: 'Comment received (mock)',
    data: {
      id: 'comment-' + Date.now(),
      comment: comment,
      animeId: animeId,
      episodeId: episodeId,
      userId: userId,
      createdAt: new Date().toISOString()
    }
  });
});

// ========== SOCKET.IO HANDLING ==========

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // When someone adds a comment
  socket.on('new_comment', (comment) => {
    try {
      console.log('💬 New comment:', comment);
      // Broadcast to everyone EXCEPT the sender
      socket.broadcast.emit('new_comment', comment);
    } catch (error) {
      console.error('❌ Error broadcasting comment:', error);
    }
  });

  // When someone deletes a comment
  socket.on('comment_deleted', (data) => {
    try {
      console.log('🗑️ Comment deleted:', data);
      socket.broadcast.emit('comment_deleted', data);
    } catch (error) {
      console.error('❌ Error broadcasting deletion:', error);
    }
  });

  // Chat room functionality
  socket.on('join_chat', ({ animeId, episodeId }) => {
    const room = `chat:${animeId}:${episodeId}`;
    socket.join(room);
    console.log(`💬 User ${socket.id} joined ${room}`);
    
    if (!chatMessages.has(room)) {
      chatMessages.set(room, []);
    }
  });

  socket.on('send_message', (messageData) => {
    try {
      const room = `chat:${messageData.animeId}:${messageData.episodeId}`;
      
      if (!chatMessages.has(room)) {
        chatMessages.set(room, []);
      }

      const messages = chatMessages.get(room);
      const messageWithId = {
        ...messageData,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString()
      };

      messages.push(messageWithId);
      
      // Keep only last 100 messages
      if (messages.length > 100) {
        chatMessages.set(room, messages.slice(-100));
      }

      // Broadcast to room
      io.to(room).emit('new_message', messageWithId);
      console.log(`📤 Message sent to ${room}`);

    } catch (error) {
      console.error('❌ Error sending message:', error);
    }
  });

  socket.on('get_chat_history', ({ animeId, episodeId }, callback) => {
    const room = `chat:${animeId}:${episodeId}`;
    const messages = chatMessages.get(room) || [];
    
    if (typeof callback === 'function') {
      callback(messages);
    }
  });

  socket.on('leave_chat', ({ animeId, episodeId }) => {
    const room = `chat:${animeId}:${episodeId}`;
    socket.leave(room);
    console.log(`👋 User ${socket.id} left ${room}`);
  });

  socket.on('disconnect', (reason) => {
    console.log(`❌ User disconnected: ${socket.id} (${reason})`);
  });
});

// Handle 404
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    availableRoutes: [
      'GET /',
      'GET /health', 
      'GET /stats',
      'GET /api/test',
      'GET /api/comments/test',
      'POST /api/comments'
    ]
  });
});

// Error handling
app.use((error, req, res, next) => {
  console.error('🔴 Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 API Endpoints:`);
  console.log(`   http://localhost:${PORT}/`);
  console.log(`   http://localhost:${PORT}/health`);
  console.log(`   http://localhost:${PORT}/stats`);
  console.log(`   http://localhost:${PORT}/api/test`);
  console.log(`   http://localhost:${PORT}/api/comments/test`);
  console.log(`🔌 Socket.IO: ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

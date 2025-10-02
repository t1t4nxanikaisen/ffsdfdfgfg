const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// =======================
// Middleware
// =======================
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json()); // This allows the server to parse JSON in request bodies

// =======================
// Essential API Routes
// =======================

// 1. Root endpoint - Confirms the API is live :cite[10]
app.get('/', (req, res) => {
  res.json({
    message: 'Anime API Server is running!',
    status: 'OK',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET    /',
      'GET    /health',
      'GET    /api/comments/test',
      'POST   /api/comments',
      'DELETE /api/comments/:id',
      'GET    /api/stats'
    ]
  });
});

// 2. Health check endpoint for monitoring :cite[1]:cite[4]
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    server: 'Anime-API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 3. Test endpoint for comments functionality
app.get('/api/comments/test', (req, res) => {
  res.json({
    success: true,
    message: 'Comments API is working correctly.',
    testComment: {
      id: 'test-' + Date.now(),
      comment: 'This is a test comment from the live API',
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

// 4. POST endpoint to create a new comment :cite[1]:cite[9]
app.post('/api/comments', (req, res) => {
  const { animeId, episodeId, comment, userId } = req.body;

  // Basic validation
  if (!animeId || !episodeId || !comment) {
    return res.status(400).json({ // Using correct 400 status for client errors :cite[4]
      success: false,
      error: 'MISSING_FIELDS',
      message: 'animeId, episodeId, and comment are required fields.'
    });
  }

  // Simulate successful comment creation
  res.status(201).json({ // Using 201 for successful resource creation :cite[1]
    success: true,
    message: 'Comment created successfully.',
    data: {
      id: 'comment-' + Date.now(),
      comment: comment,
      animeId: animeId,
      episodeId: episodeId,
      userId: userId || 'anonymous',
      createdAt: new Date().toISOString()
    }
  });
});

// 5. DELETE endpoint to remove a comment
app.delete('/api/comments/:id', (req, res) => {
  const commentId = req.params.id;

  res.json({
    success: true,
    message: `Comment ${commentId} deleted successfully.`,
    deletedId: commentId
  });
});

// 6. Statistics endpoint
app.get('/api/stats', (req, res) => {
  res.json({
    status: 'Operational',
    serverTime: new Date().toISOString(),
    features: ['REST API', 'Real-time Comments', 'WebSocket Support']
  });
});

// =======================
// Socket.IO for Real-time Features
// =======================
const io = socketIO(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Store chat messages in memory (in production, use Redis)
const chatMessages = new Map();

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // Handle new comments via WebSockets
  socket.on('new_comment', (comment) => {
    try {
      console.log('💬 Broadcasting new comment');
      // Broadcast to everyone EXCEPT the sender
      socket.broadcast.emit('new_comment', comment);
    } catch (error) {
      console.error('Error broadcasting comment:', error);
    }
  });

  socket.on('comment_deleted', (data) => {
    try {
      console.log('🗑️ Broadcasting deleted comment');
      socket.broadcast.emit('comment_deleted', data);
    } catch (error) {
      console.error('Error broadcasting deletion:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);
  });
});

// =======================
// Error Handling & 404
// =======================

// Handle 404 for all other routes - THIS MUST BE LAST :cite[3]
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'ENDPOINT_NOT_FOUND',
    message: `Route ${req.originalUrl} not found on this server.`,
    availableEndpoints: [
      '/',
      '/health',
      '/api/comments/test',
      '/api/comments',
      '/api/stats'
    ]
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('🔴 Server error:', error);
  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: 'Something went wrong on the server.'
  });
});

// =======================
// Start Server
// =======================
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 API Server running on port ${PORT}`);
  console.log(`📍 Base URL: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`📝 Test comments: http://localhost:${PORT}/api/comments/test`);
});

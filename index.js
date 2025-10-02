const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Middleware
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

// In-memory storage (use database in production)
const comments = new Map(); // Format: { "animeId-episodeId": [comment1, comment2, ...] }
const chatMessages = new Map(); // Format: { "chat:animeId:episodeId": [message1, message2, ...] }

// =======================
// REST API ENDPOINTS
// =======================

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: '🎬 Socket.IO Comments API Server is running!',
        status: 'OK',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: '/health',
            stats: '/stats',
            comments: {
                get_comments: 'GET /api/comments/:animeId/:episodeId',
                add_comment: 'POST /api/comments/:animeId/:episodeId',
                delete_comment: 'DELETE /api/comments/:animeId/:episodeId/:commentId'
            },
            chat: {
                history: 'GET /api/chat/:animeId/:episodeId'
            },
            socket_events: [
                'join_comments',
                'new_comment', 
                'delete_comment',
                'join_chat',
                'send_message'
            ]
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        server: 'Socket.IO Comments API',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        connected_clients: io.engine?.clientsCount || 0,
        active_comment_rooms: comments.size,
        active_chat_rooms: chatMessages.size
    });
});

// Statistics endpoint
app.get('/stats', (req, res) => {
    const totalComments = Array.from(comments.values()).reduce((acc, roomComments) => acc + roomComments.length, 0);
    const totalChatMessages = Array.from(chatMessages.values()).reduce((acc, roomMessages) => acc + roomMessages.length, 0);
    
    res.json({
        status: 'Running',
        total_comment_rooms: comments.size,
        total_chat_rooms: chatMessages.size,
        total_comments: totalComments,
        total_chat_messages: totalChatMessages,
        timestamp: new Date().toISOString()
    });
});

// Get comments for specific anime episode
app.get('/api/comments/:animeId/:episodeId', (req, res) => {
    const { animeId, episodeId } = req.params;
    const roomKey = `${animeId}-${episodeId}`;
    
    try {
        const roomComments = comments.get(roomKey) || [];
        
        res.json({
            success: true,
            anime_id: animeId,
            episode_id: episodeId,
            comments: roomComments,
            count: roomComments.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error getting comments:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get comments',
            message: error.message
        });
    }
});

// Add a new comment (REST API endpoint)
app.post('/api/comments/:animeId/:episodeId', (req, res) => {
    const { animeId, episodeId } = req.params;
    const { comment, user_id, username, avatar, is_admin } = req.body;
    
    // Validation
    if (!comment || !user_id || !username) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields',
            required: ['comment', 'user_id', 'username']
        });
    }
    
    if (!comment.trim()) {
        return res.status(400).json({
            success: false,
            error: 'Comment cannot be empty'
        });
    }
    
    try {
        const roomKey = `${animeId}-${episodeId}`;
        
        // Initialize room if it doesn't exist
        if (!comments.has(roomKey)) {
            comments.set(roomKey, []);
        }
        
        // Create new comment with proper ID
        const newComment = {
            id: generateCommentId(), // Fixed ID generation
            comment: comment.trim(),
            user_id: user_id,
            username: username,
            avatar: avatar || null,
            is_admin: is_admin || false,
            created_at: new Date().toISOString(),
            anime_id: animeId,
            episode_id: episodeId
        };
        
        const roomComments = comments.get(roomKey);
        roomComments.push(newComment);
        
        // Keep only last 200 comments per room to prevent memory issues
        if (roomComments.length > 200) {
            comments.set(roomKey, roomComments.slice(-200));
        }
        
        // Broadcast to all connected clients in this room
        io.to(roomKey).emit('new_comment', newComment);
        
        console.log(`💬 New comment in ${roomKey} from ${username}`);
        
        res.status(201).json({
            success: true,
            comment: newComment,
            message: 'Comment added successfully'
        });
        
    } catch (error) {
        console.error('❌ Error adding comment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add comment',
            message: error.message
        });
    }
});

// Delete a comment
app.delete('/api/comments/:animeId/:episodeId/:commentId', (req, res) => {
    const { animeId, episodeId, commentId } = req.params;
    const { user_id, is_admin } = req.body;
    
    if (!user_id) {
        return res.status(400).json({
            success: false,
            error: 'user_id is required'
        });
    }
    
    try {
        const roomKey = `${animeId}-${episodeId}`;
        const roomComments = comments.get(roomKey);
        
        if (!roomComments) {
            return res.status(404).json({
                success: false,
                error: 'No comments found for this episode'
            });
        }
        
        const commentIndex = roomComments.findIndex(comment => 
            comment.id === commentId
        );
        
        if (commentIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Comment not found'
            });
        }
        
        const comment = roomComments[commentIndex];
        
        // Check if user has permission to delete (either admin or comment owner)
        if (!is_admin && comment.user_id !== user_id) {
            return res.status(403).json({
                success: false,
                error: 'Permission denied: You can only delete your own comments'
            });
        }
        
        // Remove the comment
        const deletedComment = roomComments.splice(commentIndex, 1)[0];
        
        // Broadcast deletion to all connected clients
        io.to(roomKey).emit('comment_deleted', {
            comment_id: commentId,
            anime_id: animeId,
            episode_id: episodeId,
            deleted_by: user_id
        });
        
        console.log(`🗑️ Comment deleted from ${roomKey}: ${commentId}`);
        
        res.json({
            success: true,
            message: 'Comment deleted successfully',
            deleted_comment_id: commentId,
            comment: deletedComment
        });
        
    } catch (error) {
        console.error('❌ Error deleting comment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete comment',
            message: error.message
        });
    }
});

// Get chat history for specific anime episode
app.get('/api/chat/:animeId/:episodeId', (req, res) => {
    const { animeId, episodeId } = req.params;
    const roomKey = `chat:${animeId}:${episodeId}`;
    
    try {
        const roomMessages = chatMessages.get(roomKey) || [];
        
        res.json({
            success: true,
            anime_id: animeId,
            episode_id: episodeId,
            messages: roomMessages,
            count: roomMessages.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error getting chat history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get chat history',
            message: error.message
        });
    }
});

// =======================
// SOCKET.IO HANDLING
// =======================

io.on('connection', (socket) => {
    console.log('✅ User connected:', socket.id);

    // Join comment room for specific anime episode
    socket.on('join_comments', ({ animeId, episodeId }) => {
        const roomKey = `${animeId}-${episodeId}`;
        socket.join(roomKey);
        console.log(`💬 User ${socket.id} joined comments room: ${roomKey}`);
        
        // Initialize room if it doesn't exist
        if (!comments.has(roomKey)) {
            comments.set(roomKey, []);
        }
        
        // Send current comments to the joining user
        const roomComments = comments.get(roomKey);
        socket.emit('comments_history', {
            anime_id: animeId,
            episode_id: episodeId,
            comments: roomComments
        });
    });

    // Add new comment via socket
    socket.on('new_comment', (commentData) => {
        try {
            const { animeId, episodeId, comment, user_id, username, avatar, is_admin } = commentData;
            
            // Validation
            if (!animeId || !episodeId || !comment || !user_id || !username) {
                socket.emit('error', { 
                    message: 'Missing required fields',
                    required: ['animeId', 'episodeId', 'comment', 'user_id', 'username']
                });
                return;
            }
            
            if (!comment.trim()) {
                socket.emit('error', { message: 'Comment cannot be empty' });
                return;
            }
            
            const roomKey = `${animeId}-${episodeId}`;
            
            // Initialize room if it doesn't exist
            if (!comments.has(roomKey)) {
                comments.set(roomKey, []);
            }
            
            // Create new comment with proper ID
            const newComment = {
                id: generateCommentId(),
                comment: comment.trim(),
                user_id: user_id,
                username: username,
                avatar: avatar || null,
                is_admin: is_admin || false,
                created_at: new Date().toISOString(),
                anime_id: animeId,
                episode_id: episodeId
            };
            
            const roomComments = comments.get(roomKey);
            roomComments.push(newComment);
            
            // Keep only last 200 comments per room
            if (roomComments.length > 200) {
                comments.set(roomKey, roomComments.slice(-200));
            }
            
            console.log(`💬 New comment in ${roomKey} from ${username}`);
            
            // Broadcast to everyone in the room including the sender
            io.to(roomKey).emit('new_comment', newComment);
            
        } catch (error) {
            console.error('❌ Error handling new comment:', error);
            socket.emit('error', { 
                message: 'Failed to add comment',
                error: error.message 
            });
        }
    });

    // Delete comment via socket
    socket.on('delete_comment', (data) => {
        try {
            const { comment_id, anime_id, episode_id, user_id, is_admin } = data;
            
            if (!user_id) {
                socket.emit('error', { message: 'user_id is required' });
                return;
            }
            
            const roomKey = `${anime_id}-${episode_id}`;
            const roomComments = comments.get(roomKey);
            
            if (!roomComments) {
                socket.emit('error', { message: 'No comments found' });
                return;
            }
            
            const commentIndex = roomComments.findIndex(comment => 
                comment.id === comment_id
            );
            
            if (commentIndex === -1) {
                socket.emit('error', { message: 'Comment not found' });
                return;
            }
            
            const comment = roomComments[commentIndex];
            
            // Check permissions
            if (!is_admin && comment.user_id !== user_id) {
                socket.emit('error', { message: 'Permission denied' });
                return;
            }
            
            // Remove the comment
            roomComments.splice(commentIndex, 1);
            
            console.log(`🗑️ Comment deleted from ${roomKey}: ${comment_id}`);
            
            // Broadcast deletion to everyone in the room
            io.to(roomKey).emit('comment_deleted', {
                comment_id: comment_id,
                anime_id: anime_id,
                episode_id: episode_id,
                deleted_by: user_id
            });
            
        } catch (error) {
            console.error('❌ Error deleting comment:', error);
            socket.emit('error', { 
                message: 'Failed to delete comment',
                error: error.message 
            });
        }
    });

    // Chat room functionality
    socket.on('join_chat', ({ animeId, episodeId }) => {
        const roomKey = `chat:${animeId}:${episodeId}`;
        socket.join(roomKey);
        console.log(`💌 User ${socket.id} joined chat room: ${roomKey}`);
        
        if (!chatMessages.has(roomKey)) {
            chatMessages.set(roomKey, []);
        }
    });

    socket.on('send_message', (messageData) => {
        try {
            const { animeId, episodeId, text, user_id, username, avatar } = messageData;
            const roomKey = `chat:${animeId}:${episodeId}`;
            
            if (!chatMessages.has(roomKey)) {
                chatMessages.set(roomKey, []);
            }

            const messages = chatMessages.get(roomKey);
            const messageWithId = {
                ...messageData,
                id: generateCommentId(), // Reuse the same ID generator
                timestamp: new Date().toISOString()
            };

            messages.push(messageWithId);
            
            // Keep only last 100 messages
            if (messages.length > 100) {
                chatMessages.set(roomKey, messages.slice(-100));
            }

            // Broadcast to everyone in the room including the sender
            io.to(roomKey).emit('new_message', messageWithId);
            console.log(`📤 Chat message sent to ${roomKey} from ${username}`);

        } catch (error) {
            console.error('❌ Error handling chat message:', error);
            socket.emit('error', { 
                message: 'Failed to send message',
                error: error.message 
            });
        }
    });

    // Get chat history via socket
    socket.on('get_chat_history', ({ animeId, episodeId }, callback) => {
        try {
            const roomKey = `chat:${animeId}:${episodeId}`;
            const messages = chatMessages.get(roomKey) || [];
            
            if (typeof callback === 'function') {
                callback({
                    success: true,
                    messages: messages,
                    count: messages.length
                });
            }
        } catch (error) {
            console.error('❌ Error getting chat history:', error);
            if (typeof callback === 'function') {
                callback({
                    success: false,
                    error: 'Failed to get chat history',
                    messages: []
                });
            }
        }
    });

    // Get comments history via socket
    socket.on('get_comments_history', ({ animeId, episodeId }, callback) => {
        try {
            const roomKey = `${animeId}-${episodeId}`;
            const roomComments = comments.get(roomKey) || [];
            
            if (typeof callback === 'function') {
                callback({
                    success: true,
                    comments: roomComments,
                    count: roomComments.length
                });
            }
        } catch (error) {
            console.error('❌ Error getting comments history:', error);
            if (typeof callback === 'function') {
                callback({
                    success: false,
                    error: 'Failed to get comments history',
                    comments: []
                });
            }
        }
    });

    // Leave rooms
    socket.on('leave_comments', ({ animeId, episodeId }) => {
        const roomKey = `${animeId}-${episodeId}`;
        socket.leave(roomKey);
        console.log(`👋 User ${socket.id} left comments room: ${roomKey}`);
    });

    socket.on('leave_chat', ({ animeId, episodeId }) => {
        const roomKey = `chat:${animeId}:${episodeId}`;
        socket.leave(roomKey);
        console.log(`👋 User ${socket.id} left chat room: ${roomKey}`);
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

// =======================
// UTILITY FUNCTIONS
// =======================

// Fixed ID generation function
function generateCommentId() {
    return `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// =======================
// ERROR HANDLING
// =======================

// Handle 404
app.use('*', (req, res) => {
    res.status(404).json({ 
        success: false,
        error: 'Endpoint not found',
        available_endpoints: {
            root: 'GET /',
            health: 'GET /health',
            stats: 'GET /stats',
            comments: {
                get: 'GET /api/comments/:animeId/:episodeId',
                post: 'POST /api/comments/:animeId/:episodeId',
                delete: 'DELETE /api/comments/:animeId/:episodeId/:commentId'
            },
            chat: 'GET /api/chat/:animeId/:episodeId'
        }
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('🔴 Server error:', error);
    res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        message: error.message
    });
});

// =======================
// START SERVER
// =======================

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`
🚀 Socket.IO Comments API Server Running!
───────────────────────────────────────────
📍 Port: ${PORT}
🔗 Base URL: http://localhost:${PORT}
🏥 Health: http://localhost:${PORT}/health
📊 Stats: http://localhost:${PORT}/stats
💬 Comments API: /api/comments/:animeId/:episodeId
🔌 Socket.IO: Ready for real-time connections
───────────────────────────────────────────
    `);
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

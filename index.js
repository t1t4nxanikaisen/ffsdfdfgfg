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

// Store comments and chat messages in memory (use database in production)
const comments = new Map(); // Format: { [animeId-episodeId]: [comment1, comment2, ...] }
const chatMessages = new Map(); // Format: { [animeId-episodeId]: [message1, message2, ...] }

// =======================
// REST API ENDPOINTS
// =======================

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Socket.IO Comments API Server is running!',
        status: 'OK',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: '/health',
            stats: '/stats',
            comments: {
                get: '/api/comments/:animeId/:episodeId',
                post: '/api/comments/:animeId/:episodeId'
            },
            chat: {
                history: '/api/chat/:animeId/:episodeId'
            },
            socket: 'Connect via Socket.IO client for real-time features'
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
        connectedClients: io.engine?.clientsCount || 0,
        activeCommentRooms: comments.size,
        activeChatRooms: chatMessages.size
    });
});

// Statistics endpoint
app.get('/stats', (req, res) => {
    const stats = {
        status: 'Running',
        totalCommentRooms: comments.size,
        totalChatRooms: chatMessages.size,
        totalComments: Array.from(comments.values()).reduce((acc, roomComments) => acc + roomComments.length, 0),
        totalChatMessages: Array.from(chatMessages.values()).reduce((acc, roomMessages) => acc + roomMessages.length, 0),
        timestamp: new Date().toISOString()
    };
    
    res.json(stats);
});

// Get comments for specific anime episode
app.get('/api/comments/:animeId/:episodeId', (req, res) => {
    const { animeId, episodeId } = req.params;
    const roomKey = `${animeId}-${episodeId}`;
    
    try {
        const roomComments = comments.get(roomKey) || [];
        res.json({
            success: true,
            animeId,
            episodeId,
            comments: roomComments,
            count: roomComments.length
        });
    } catch (error) {
        console.error('Error getting comments:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get comments'
        });
    }
});

// Add a new comment (REST API endpoint)
app.post('/api/comments/:animeId/:episodeId', (req, res) => {
    const { animeId, episodeId } = req.params;
    const { comment, userId, username, avatar, isAdmin } = req.body;
    
    if (!comment || !userId || !username) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: comment, userId, username'
        });
    }
    
    try {
        const roomKey = `${animeId}-${episodeId}`;
        if (!comments.has(roomKey)) {
            comments.set(roomKey, []);
        }
        
        const newComment = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            comment: comment.trim(),
            userId,
            username,
            avatar: avatar || null,
            isAdmin: isAdmin || false,
            createdAt: new Date().toISOString(),
            animeId,
            episodeId
        };
        
        const roomComments = comments.get(roomKey);
        roomComments.push(newComment);
        
        // Keep only last 200 comments per room to prevent memory issues
        if (roomComments.length > 200) {
            comments.set(roomKey, roomComments.slice(-200));
        }
        
        // Broadcast to all connected clients in this room
        io.to(roomKey).emit('new_comment', newComment);
        
        res.status(201).json({
            success: true,
            comment: newComment,
            message: 'Comment added successfully'
        });
        
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add comment'
        });
    }
});

// Delete a comment
app.delete('/api/comments/:animeId/:episodeId/:commentId', (req, res) => {
    const { animeId, episodeId, commentId } = req.params;
    const { userId, isAdmin } = req.body; // Expect userId and isAdmin in request body
    
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
        if (!isAdmin && comment.userId !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Permission denied: You can only delete your own comments'
            });
        }
        
        // Remove the comment
        roomComments.splice(commentIndex, 1);
        
        // Broadcast deletion to all connected clients
        io.to(roomKey).emit('comment_deleted', {
            commentId,
            animeId,
            episodeId,
            deletedBy: userId
        });
        
        res.json({
            success: true,
            message: 'Comment deleted successfully',
            deletedCommentId: commentId
        });
        
    } catch (error) {
        console.error('Error deleting comment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete comment'
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
            animeId,
            episodeId,
            messages: roomMessages,
            count: roomMessages.length
        });
    } catch (error) {
        console.error('Error getting chat history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get chat history'
        });
    }
});

// Handle 404
app.use('*', (req, res) => {
    res.status(404).json({ 
        error: 'Route not found',
        availableEndpoints: {
            root: '/',
            health: '/health',
            stats: '/stats',
            comments: {
                get: '/api/comments/:animeId/:episodeId',
                post: '/api/comments/:animeId/:episodeId',
                delete: '/api/comments/:animeId/:episodeId/:commentId'
            },
            chat: '/api/chat/:animeId/:episodeId'
        }
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('🔴 Server error:', error);
    res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
    });
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
        socket.emit('comments_history', roomComments);
    });

    // Add new comment via socket
    socket.on('new_comment', (commentData) => {
        try {
            const { animeId, episodeId, comment, userId, username, avatar, isAdmin } = commentData;
            
            if (!animeId || !episodeId || !comment || !userId || !username) {
                socket.emit('error', { message: 'Missing required fields' });
                return;
            }
            
            const roomKey = `${animeId}-${episodeId}`;
            
            if (!comments.has(roomKey)) {
                comments.set(roomKey, []);
            }
            
            const newComment = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                comment: comment.trim(),
                userId,
                username,
                avatar: avatar || null,
                isAdmin: isAdmin || false,
                createdAt: new Date().toISOString(),
                animeId,
                episodeId
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
            socket.emit('error', { message: 'Failed to add comment' });
        }
    });

    // Delete comment via socket
    socket.on('delete_comment', (data) => {
        try {
            const { commentId, animeId, episodeId, userId, isAdmin } = data;
            
            const roomKey = `${animeId}-${episodeId}`;
            const roomComments = comments.get(roomKey);
            
            if (!roomComments) {
                socket.emit('error', { message: 'No comments found' });
                return;
            }
            
            const commentIndex = roomComments.findIndex(comment => 
                comment.id === commentId
            );
            
            if (commentIndex === -1) {
                socket.emit('error', { message: 'Comment not found' });
                return;
            }
            
            const comment = roomComments[commentIndex];
            
            // Check permissions
            if (!isAdmin && comment.userId !== userId) {
                socket.emit('error', { message: 'Permission denied' });
                return;
            }
            
            // Remove the comment
            roomComments.splice(commentIndex, 1);
            
            console.log(`🗑️ Comment deleted from ${roomKey}: ${commentId}`);
            
            // Broadcast deletion to everyone in the room
            io.to(roomKey).emit('comment_deleted', {
                commentId,
                animeId,
                episodeId,
                deletedBy: userId
            });
            
        } catch (error) {
            console.error('❌ Error deleting comment:', error);
            socket.emit('error', { message: 'Failed to delete comment' });
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
            const { animeId, episodeId, text, userId, username, avatar } = messageData;
            const roomKey = `chat:${animeId}:${episodeId}`;
            
            if (!chatMessages.has(roomKey)) {
                chatMessages.set(roomKey, []);
            }

            const messages = chatMessages.get(roomKey);
            const messageWithId = {
                ...messageData,
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
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
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    // Get chat history via socket
    socket.on('get_chat_history', ({ animeId, episodeId }, callback) => {
        try {
            const roomKey = `chat:${animeId}:${episodeId}`;
            const messages = chatMessages.get(roomKey) || [];
            
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

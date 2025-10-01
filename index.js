// src/utils/comments.js
let socket;

const getSocket = async () => {
  if (!socket && typeof window !== 'undefined') {
    const { default: io } = await import('socket.io-client');
    socket = io(import.meta.env.VITE_SOCKET_URL);
  }
  return socket;
};

export const commentsUtils = {
  addComment: async (animeId, episodeId, comment) => {
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ animeId, episodeId, comment })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Emit socket event for real-time update
        const socket = await getSocket();
        if (socket) {
          socket.emit('new_comment', result.comment);
        }
      }
      
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  deleteComment: async (commentId, animeId, episodeId) => {
    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Emit socket event for real-time update
        const socket = await getSocket();
        if (socket) {
          socket.emit('comment_deleted', { commentId, animeId, episodeId });
        }
      }
      
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

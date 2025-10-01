/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { useLocation, useParams, Link, useNavigate } from "react-router-dom";
import { useLanguage } from "@/src/context/LanguageContext";
import { useHomeInfo } from "@/src/context/HomeInfoContext";
import { useAuth } from "@/src/context/AuthContext";
import { useWatch } from "@/src/hooks/useWatch";
import BouncingLoader from "@/src/components/ui/bouncingloader/Bouncingloader";
import IframePlayer from "@/src/components/player/IframePlayer";
import Episodelist from "@/src/components/episodelist/Episodelist";
import website_name from "@/src/config/website";
import Sidecard from "@/src/components/sidecard/Sidecard";
import {
  faClosedCaptioning,
  faMicrophone,
  faChevronDown,
  faChevronUp,
  faShield,
  faTimes,
  faPaperPlane,
  faImage,
  faXmark,
  faMessage,
  faComments,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Servers from "@/src/components/servers/Servers";
import { Skeleton } from "@/src/components/ui/Skeleton/Skeleton";
import SidecardLoader from "@/src/components/Loader/Sidecard.loader";
import Watchcontrols from "@/src/components/watchcontrols/Watchcontrols";
import useWatchControl from "@/src/hooks/useWatchControl";
import Player from "@/src/components/player/Player";
import { commentsUtils } from "@/src/utils/comments";

// Socket.IO client - dynamic import for browser only
let socket;

const initializeSocket = async () => {
  if (typeof window !== 'undefined' && !socket) {
    try {
      const { default: io } = await import('socket.io-client');
      socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001', {
        transports: ['websocket', 'polling'],
        timeout: 10000
      });
      
      socket.on('connect', () => {
        console.log('Connected to socket server');
      });
      
      socket.on('disconnect', () => {
        console.log('Disconnected from socket server');
      });
      
      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
      });
    } catch (error) {
      console.error('Failed to initialize socket:', error);
    }
  }
  return socket;
};

// Comments Section Component with Socket.IO
function CommentsSection({ animeId, episodeId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const { user, isAuthenticated, isAdmin } = useAuth();
  const commentsEndRef = useRef(null);

  const scrollToBottom = () => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [comments]);

  // Socket.IO for real-time comments
  useEffect(() => {
    let isMounted = true;
    
    const setupSocket = async () => {
      const socketInstance = await initializeSocket();
      if (!socketInstance || !isMounted) return;

      // Join episode room
      socketInstance.emit('join_episode', { animeId, episodeId });

      // Listen for new comments
      socketInstance.on('new_comment', (comment) => {
        if (isMounted) {
          setComments(prev => [...prev, comment]);
        }
      });

      // Listen for deleted comments
      socketInstance.on('comment_deleted', (commentId) => {
        if (isMounted) {
          setComments(prev => prev.filter(comment => comment.id !== commentId));
        }
      });
    };

    setupSocket();

    return () => {
      isMounted = false;
      if (socket) {
        socket.off('new_comment');
        socket.off('comment_deleted');
        socket.emit('leave_episode', { animeId, episodeId });
      }
    };
  }, [animeId, episodeId]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const result = await commentsUtils.getComments(animeId, episodeId);
      if (result.success) {
        setComments(result.comments);
      } else {
        console.error('Error loading comments:', result.error);
      }
    } catch (error) {
      console.error('Error loading comments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, [animeId, episodeId]);

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !isAuthenticated) return;

    setSubmitLoading(true);
    try {
      const result = await commentsUtils.addComment(animeId, episodeId, newComment);
      if (result.success) {
        setNewComment("");
        // Comment will be added via socket event
      } else {
        alert(result.error || 'Failed to add comment');
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      alert('Failed to add comment');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return;

    try {
      const result = await commentsUtils.deleteComment(commentId, animeId, episodeId);
      if (result.success) {
        // Comment will be removed via socket event
      } else {
        alert(result.error || 'Failed to delete comment');
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
      alert('Failed to delete comment');
    }
  };

  const displayedComments = expanded ? comments : comments.slice(0, 6);

  const getAvatarInitials = (username) => {
    return username ? username.charAt(0).toUpperCase() : 'U';
  };

  const getAvatarBackgroundColor = (username) => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#F9A826', '#6C5CE7', '#A29BFE', '#FD79A8', '#00B894'];
    const index = username ? username.charCodeAt(0) % colors.length : 0;
    return colors[index];
  };

  const formatTimestamp = (timestamp) => {
    const now = new Date();
    const commentDate = new Date(timestamp);
    const diffInHours = Math.floor((now - commentDate) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`;
    return commentDate.toLocaleDateString();
  };

  return (
    <div className="bg-[#141414] rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Comments ({comments.length})</h3>
        {comments.length > 6 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
          >
            {expanded ? (
              <>
                <span>Show Less</span>
                <FontAwesomeIcon icon={faChevronUp} className="text-xs" />
              </>
            ) : (
              <>
                <span>Show More</span>
                <FontAwesomeIcon icon={faChevronDown} className="text-xs" />
              </>
            )}
          </button>
        )}
      </div>

      {/* Add Comment Form */}
      {isAuthenticated ? (
        <form onSubmit={handleAddComment} className="mb-4">
          <div className="flex gap-3">
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold border-2 border-gray-600 flex-shrink-0"
              style={{
                background: user.avatar 
                  ? `url(${user.avatar}) center/cover`
                  : getAvatarBackgroundColor(user.username),
              }}
            >
              {!user.avatar && getAvatarInitials(user.username)}
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
                disabled={submitLoading}
              />
              <div className="flex justify-between items-center mt-2">
                <span className="text-gray-400 text-xs">
                  Commenting as <span className="text-blue-400">{user.username}</span>
                  {isAdmin && <span className="text-red-400 ml-1">(Admin)</span>}
                </span>
                <button
                  type="submit"
                  disabled={!newComment.trim() || submitLoading}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitLoading ? 'Posting...' : 'Comment'}
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : (
        <div className="mb-4 p-3 bg-[#1a1a1a] rounded-lg text-center">
          <p className="text-gray-400 text-sm">
            Please <Link to="/login" className="text-blue-400 hover:text-blue-300">login</Link> to comment
          </p>
        </div>
      )}

      {/* Comments List */}
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex gap-3 animate-pulse">
              <div className="w-8 h-8 bg-gray-700 rounded-full flex-shrink-0"></div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-20 h-4 bg-gray-700 rounded"></div>
                  <div className="w-3 h-3 bg-gray-700 rounded-full"></div>
                  <div className="w-16 h-3 bg-gray-700 rounded"></div>
                </div>
                <div className="w-full h-10 bg-gray-700 rounded"></div>
              </div>
            </div>
          ))
        ) : displayedComments.length > 0 ? (
          displayedComments.map((comment) => (
            <div key={comment.id} className="flex gap-3 group">
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold border-2 border-gray-600 flex-shrink-0"
                style={{
                  background: comment.user?.avatar 
                    ? `url(${comment.user.avatar}) center/cover`
                    : getAvatarBackgroundColor(comment.user?.username),
                }}
              >
                {!comment.user?.avatar && getAvatarInitials(comment.user?.username)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white text-sm font-medium">
                    {comment.user?.username || 'Unknown User'}
                  </span>
                  {comment.user?.isAdmin && (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-red-600 text-white text-xs rounded-full">
                      <FontAwesomeIcon icon={faShield} className="text-[10px]" />
                      Admin
                    </span>
                  )}
                  <span className="text-gray-400 text-xs">•</span>
                  <span className="text-gray-400 text-xs">
                    {formatTimestamp(comment.createdAt)}
                  </span>
                  
                  {(isAdmin || user?.id === comment.userId) && (
                    <button
                      onClick={() => handleDeleteComment(comment.id)}
                      className="ml-auto opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-all text-xs"
                      title="Delete comment"
                    >
                      <FontAwesomeIcon icon={faTimes} />
                    </button>
                  )}
                </div>
                <p className="text-gray-300 text-sm leading-relaxed">{comment.comment}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm">No comments yet. Be the first to comment!</p>
          </div>
        )}
        <div ref={commentsEndRef} />
      </div>
    </div>
  );
}

// Discord-like Chat Component with Socket.IO
function ChatSection({ animeId, episodeId }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const { user, isAuthenticated } = useAuth();
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Socket.IO for real-time chat
  useEffect(() => {
    let isMounted = true;

    const setupSocket = async () => {
      const socketInstance = await initializeSocket();
      if (!socketInstance || !isMounted) return;

      socketInstance.on('connect', () => {
        if (isMounted) {
          setSocketConnected(true);
        }
      });

      socketInstance.on('disconnect', () => {
        if (isMounted) {
          setSocketConnected(false);
        }
      });

      if (isOpen) {
        // Join chat room
        socketInstance.emit('join_chat', { animeId, episodeId });

        // Listen for new messages
        socketInstance.on('new_message', (message) => {
          if (isMounted) {
            setMessages(prev => [...prev, message]);
          }
        });

        // Load chat history
        socketInstance.emit('get_chat_history', { animeId, episodeId }, (history) => {
          if (isMounted && history) {
            setMessages(history);
          }
        });
      }
    };

    setupSocket();

    return () => {
      isMounted = false;
      if (socket && isOpen) {
        socket.off('new_message');
        socket.emit('leave_chat', { animeId, episodeId });
      }
    };
  }, [animeId, episodeId, isOpen]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((!newMessage.trim() && !imagePreview) || !isAuthenticated || !socket) return;

    setSending(true);
    try {
      const messageData = {
        animeId,
        episodeId,
        text: newMessage,
        image: imagePreview,
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
        timestamp: new Date().toISOString()
      };

      socket.emit('send_message', messageData);
      setNewMessage("");
      setImagePreview(null);
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size should be less than 5MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImagePreview = () => {
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getAvatarInitials = (username) => {
    return username ? username.charAt(0).toUpperCase() : 'U';
  };

  const getAvatarBackgroundColor = (username) => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#F9A826', '#6C5CE7', '#A29BFE', '#FD79A8', '#00B894'];
    const index = username ? username.charCodeAt(0) % colors.length : 0;
    return colors[index];
  };

  return (
    <>
      {/* Chat Toggle Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg z-50 transition-all duration-300 hover:scale-110"
        title="Open Chat"
      >
        <FontAwesomeIcon icon={faMessage} className="text-xl" />
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {messages.length > 99 ? '99+' : messages.length}
          </span>
        )}
      </button>

      {/* Chat Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4 bg-black bg-opacity-50">
          <div className="bg-[#1a1a1a] rounded-lg shadow-xl w-96 h-[600px] flex flex-col">
            {/* Chat Header */}
            <div className="bg-[#2d2d2d] px-4 py-3 rounded-t-lg flex justify-between items-center">
              <div className="flex items-center gap-3">
                <FontAwesomeIcon icon={faComments} className="text-blue-400" />
                <h3 className="text-white font-semibold">Episode Chat</h3>
                <div className="flex items-center gap-2">
                  <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
                    {messages.length}
                  </span>
                  <div className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-500' : 'bg-red-500'}`} title={socketConnected ? 'Connected' : 'Disconnected'} />
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#141414]">
              {!isAuthenticated ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 text-sm mb-4">
                    Please login to join the chat
                  </p>
                  <div className="space-y-2">
                    <Link
                      to="/login"
                      className="block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
                    >
                      Login
                    </Link>
                    <Link
                      to="/register"
                      className="block bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
                    >
                      Register
                    </Link>
                  </div>
                </div>
              ) : !socketConnected ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 text-sm">Connecting to chat...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 text-sm">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div key={index} className="flex gap-3 group hover:bg-[#1a1a1a] p-2 rounded-lg">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold border-2 border-gray-600 flex-shrink-0"
                      style={{
                        background: message.avatar 
                          ? `url(${message.avatar}) center/cover`
                          : getAvatarBackgroundColor(message.username),
                      }}
                    >
                      {!message.avatar && getAvatarInitials(message.username)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white text-sm font-medium">
                          {message.username}
                        </span>
                        <span className="text-gray-400 text-xs">
                          {formatTime(message.timestamp)}
                        </span>
                      </div>
                      {message.text && (
                        <p className="text-gray-300 text-sm break-words">
                          {message.text}
                        </p>
                      )}
                      {message.image && (
                        <div className="mt-2">
                          <img 
                            src={message.image} 
                            alt="Shared content" 
                            className="max-w-full max-h-48 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => window.open(message.image, '_blank')}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            {isAuthenticated && (
              <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-700">
                {imagePreview && (
                  <div className="mb-3 relative">
                    <img 
                      src={imagePreview} 
                      alt="Preview" 
                      className="max-w-32 max-h-32 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={removeImagePreview}
                      className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-700"
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-shrink-0 bg-[#2d2d2d] hover:bg-[#3d3d3d] text-gray-300 p-2 rounded-lg transition-colors"
                    title="Upload image"
                    disabled={!socketConnected}
                  >
                    <FontAwesomeIcon icon={faImage} />
                  </button>
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={socketConnected ? "Type a message..." : "Connecting..."}
                    className="flex-1 bg-[#2d2d2d] border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 text-sm disabled:opacity-50"
                    disabled={sending || !socketConnected}
                  />
                  <button
                    type="submit"
                    disabled={sending || (!newMessage.trim() && !imagePreview) || !socketConnected}
                    className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FontAwesomeIcon icon={faPaperPlane} />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Main Watch Component
export default function Watch() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id: animeId } = useParams();
  const queryParams = new URLSearchParams(location.search);
  let initialEpisodeId = queryParams.get("ep");
  const [tags, setTags] = useState([]);
  const { language } = useLanguage();
  const { homeInfo } = useHomeInfo();
  const isFirstSet = useRef(true);
  const [showNextEpisodeSchedule, setShowNextEpisodeSchedule] = useState(true);
  
  const {
    buffering,
    streamInfo,
    streamUrl,
    animeInfo,
    episodes,
    nextEpisodeSchedule,
    animeInfoLoading,
    totalEpisodes,
    isFullOverview,
    intro,
    outro,
    subtitles,
    thumbnail,
    setIsFullOverview,
    activeEpisodeNum,
    seasons,
    episodeId,
    setEpisodeId,
    activeServerId,
    setActiveServerId,
    servers,
    serverLoading,
    activeServerType,
    setActiveServerType,
    activeServerName,
    setActiveServerName
  } = useWatch(animeId, initialEpisodeId);

  const {
    autoPlay,
    setAutoPlay,
    autoSkipIntro,
    setAutoSkipIntro,
    autoNext,
    setAutoNext,
  } = useWatchControl();

  const playerRef = useRef(null);
  const videoContainerRef = useRef(null);
  const controlsRef = useRef(null);
  const episodesRef = useRef(null);

  useEffect(() => {
    if (!episodes || episodes.length === 0) return;
    
    const isValidEpisode = episodes.some(ep => {
      const epNumber = ep.id.split('ep=')[1];
      return epNumber === episodeId; 
    });
    
    if (!episodeId || !isValidEpisode) {
      const fallbackId = episodes[0].id.match(/ep=(\d+)/)?.[1];
      if (fallbackId && fallbackId !== episodeId) {
        setEpisodeId(fallbackId);
      }
      return;
    }
  
    const newUrl = `/watch/${animeId}?ep=${episodeId}`;
    if (isFirstSet.current) {
      navigate(newUrl, { replace: true });
      isFirstSet.current = false;
    } else {
      navigate(newUrl);
    }
  }, [episodeId, animeId, navigate, episodes]);

  useEffect(() => {
    if (animeInfo) {
      document.title = `Watch ${animeInfo.title} English Sub/Dub online Free on ${website_name}`;
    }
    return () => {
      document.title = `${website_name} | Free anime streaming platform`;
    };
  }, [animeInfo]);

  useEffect(() => {
    if (totalEpisodes !== null && totalEpisodes === 0) {
      navigate(`/${animeId}`);
    }
  }, [streamInfo, episodeId, animeId, totalEpisodes, navigate]);

  useEffect(() => {
    const adjustHeight = () => {
      if (window.innerWidth > 1200) {
        if (videoContainerRef.current && controlsRef.current && episodesRef.current) {
          const videoHeight = videoContainerRef.current.offsetHeight;
          const controlsHeight = controlsRef.current.offsetHeight;
          const totalHeight = videoHeight + controlsHeight;
          episodesRef.current.style.height = `${totalHeight}px`;
        }
      } else {
        if (episodesRef.current) {
          episodesRef.current.style.height = 'auto';
        }
      }
    };

    const initialTimer = setTimeout(() => {
      adjustHeight();
    }, 500);
    
    window.addEventListener('resize', adjustHeight);
    
    const observer = new MutationObserver(() => {
      setTimeout(adjustHeight, 100);
    });
    
    if (videoContainerRef.current) {
      observer.observe(videoContainerRef.current, {
        attributes: true,
        childList: true,
        subtree: true
      });
    }
    
    if (controlsRef.current) {
      observer.observe(controlsRef.current, {
        attributes: true,
        childList: true,
        subtree: true
      });
    }
    
    const intervalId = setInterval(adjustHeight, 1000);
    
    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalId);
      observer.disconnect();
      window.removeEventListener('resize', adjustHeight);
    };
  }, [buffering, activeServerType, activeServerName, episodeId, streamUrl, episodes]);

  function Tag({ bgColor, index, icon, text }) {
    return (
      <div
        className={`flex space-x-1 justify-center items-center px-[4px] py-[1px] text-black font-semibold text-[13px] ${
          index === 0 ? "rounded-l-[4px]" : "rounded-none"
        }`}
        style={{ backgroundColor: bgColor }}
      >
        {icon && <FontAwesomeIcon icon={icon} className="text-[12px]" />}
        <p className="text-[12px]">{text}</p>
      </div>
    );
  }

  useEffect(() => {
    setTags([
      {
        condition: animeInfo?.animeInfo?.tvInfo?.rating,
        bgColor: "#ffffff",
        text: animeInfo?.animeInfo?.tvInfo?.rating,
      },
      {
        condition: animeInfo?.animeInfo?.tvInfo?.quality,
        bgColor: "#FFBADE",
        text: animeInfo?.animeInfo?.tvInfo?.quality,
      },
      {
        condition: animeInfo?.animeInfo?.tvInfo?.sub,
        icon: faClosedCaptioning,
        bgColor: "#B0E3AF",
        text: animeInfo?.animeInfo?.tvInfo?.sub,
      },
      {
        condition: animeInfo?.animeInfo?.tvInfo?.dub,
        icon: faMicrophone,
        bgColor: "#B9E7FF",
        text: animeInfo?.animeInfo?.tvInfo?.dub,
      },
    ]);
  }, [animeId, animeInfo]);

  // Check if server requires iframe player
  const isIframeServer = activeServerName && 
    ["hd-1", "hd-4", "nest", "anikaisen"].includes(activeServerName?.toLowerCase());

  return (
    <div className="w-full min-h-screen bg-[#0a0a0a]">
      <div className="w-full max-w-[1920px] mx-auto pt-16 pb-6 w-full max-[1200px]:pt-12">
        <div className="grid grid-cols-[minmax(0,70%),minmax(0,30%)] gap-6 w-full h-full max-[1200px]:flex max-[1200px]:flex-col">
          {/* Left Column - Player, Controls, Servers */}
          <div className="flex flex-col w-full gap-6">
            <div ref={playerRef} className="player w-full h-fit bg-black flex flex-col rounded-xl overflow-hidden">
              {/* Video Container */}
              <div ref={videoContainerRef} className="w-full relative aspect-video bg-black">
                {!buffering ? (
                  isIframeServer ? (
                    <IframePlayer
                      episodeId={episodeId}
                      servertype={activeServerType}
                      serverName={activeServerName}
                      animeInfo={animeInfo}
                      episodeNum={activeEpisodeNum}
                      episodes={episodes}
                      playNext={(id) => setEpisodeId(id)}
                      autoNext={autoNext}
                      aniid={animeInfo?.anilistId}
                    />
                  ) : (
                    <Player
                      streamUrl={streamUrl}
                      subtitles={subtitles}
                      intro={intro}
                      outro={outro}
                      serverName={activeServerName?.toLowerCase()}
                      thumbnail={thumbnail}
                      autoSkipIntro={autoSkipIntro}
                      autoPlay={autoPlay}
                      autoNext={autoNext}
                      episodeId={episodeId}
                      episodes={episodes}
                      playNext={(id) => setEpisodeId(id)}
                      animeInfo={animeInfo}
                      episodeNum={activeEpisodeNum}
                      streamInfo={streamInfo}
                    />
                  )
                ) : (
                  <div className="absolute inset-0 flex justify-center items-center bg-black">
                    <BouncingLoader />
                  </div>
                )}
                <p className="text-center underline font-medium text-[15px] absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none text-gray-300">
                  {!buffering && !activeServerType ? (
                    servers ? (
                      <>
                        Probably this server is down, try other servers
                        <br />
                        Either reload or try again after sometime
                      </>
                    ) : (
                      <>
                        Probably streaming server is down
                        <br />
                        Either reload or try again after sometime
                      </>
                    )
                  ) : null}
                </p>
              </div>

              {/* Controls Section */}
              <div className="bg-[#121212]">
                {!buffering && (
                  <div ref={controlsRef}>
                    <Watchcontrols
                      autoPlay={autoPlay}
                      setAutoPlay={setAutoPlay}
                      autoSkipIntro={autoSkipIntro}
                      setAutoSkipIntro={setAutoSkipIntro}
                      autoNext={autoNext}
                      setAutoNext={setAutoNext}
                      episodes={episodes}
                      totalEpisodes={totalEpisodes}
                      episodeId={episodeId}
                      onButtonClick={(id) => setEpisodeId(id)}
                    />
                  </div>
                )}

                {/* Title and Server Selection */}
                <div className="px-3 py-2">
                  <div>
                    <Servers
                      servers={servers}
                      activeEpisodeNum={activeEpisodeNum}
                      activeServerId={activeServerId}
                      setActiveServerId={setActiveServerId}
                      serverLoading={serverLoading}
                      setActiveServerType={setActiveServerType}
                      activeServerType={activeServerType}
                      setActiveServerName={setActiveServerName}
                    />
                  </div>
                </div>

                {/* Comments Section */}
                <div className="px-3 pb-3">
                  <CommentsSection 
                    animeId={animeId} 
                    episodeId={episodeId} 
                  />
                </div>

                {/* Next Episode Schedule */}
                {nextEpisodeSchedule?.nextEpisodeSchedule && showNextEpisodeSchedule && (
                  <div className="px-3 pb-3">
                    <div className="w-full p-3 rounded-lg bg-[#272727] flex items-center justify-between">
                      <div className="flex items-center gap-x-3">
                        <span className="text-[18px]">🚀</span>
                        <div>
                          <span className="text-gray-400 text-sm">Next episode estimated at</span>
                          <span className="ml-2 text-white text-sm font-medium">
                            {new Date(
                              new Date(nextEpisodeSchedule.nextEpisodeSchedule).getTime() -
                              new Date().getTimezoneOffset() * 60000
                            ).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                              hour12: true,
                            })}
                          </span>
                        </div>
                      </div>
                      <button
                        className="text-2xl text-gray-500 hover:text-white transition-colors"
                        onClick={() => setShowNextEpisodeSchedule(false)}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile-only Seasons Section */}
            {seasons?.length > 0 && (
              <div className="hidden max-[1200px]:block bg-[#141414] rounded-lg p-4">
                <h2 className="text-xl font-semibold mb-4 text-white">More Seasons</h2>
                <div className="grid grid-cols-2 gap-2">
                  {seasons.map((season, index) => (
                    <Link
                      to={`/${season.id}`}
                      key={index}
                      className={`relative w-full aspect-[3/1] rounded-lg overflow-hidden cursor-pointer group ${
                        animeId === String(season.id)
                          ? "ring-2 ring-white/40 shadow-lg shadow-white/10"
                          : ""
                      }`}
                    >
                      <img
                        src={season.season_poster}
                        alt={season.season}
                        className={`w-full h-full object-cover scale-150 ${
                          animeId === String(season.id)
                            ? "opacity-50"
                            : "opacity-40 group-hover:opacity-50 transition-opacity"
                        }`}
                      />
                      {/* Dots Pattern Overlay */}
                      <div 
                        className="absolute inset-0 z-10" 
                        style={{ 
                          backgroundImage: `url('data:image/svg+xml,<svg width="3" height="3" viewBox="0 0 3 3" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="1.5" cy="1.5" r="0.5" fill="white" fill-opacity="0.25"/></svg>')`,
                          backgroundSize: '3px 3px'
                        }}
                      />
                      {/* Dark Gradient Overlay */}
                      <div className={`absolute inset-0 z-20 bg-gradient-to-r ${
                        animeId === String(season.id)
                          ? "from-black/50 to-transparent"
                          : "from-black/40 to-transparent"
                      }`} />
                      {/* Title Container */}
                      <div className="absolute inset-0 z-30 flex items-center justify-center">
                        <p className={`text-[14px] font-bold text-center px-2 transition-colors duration-300 ${
                          animeId === String(season.id)
                            ? "text-white"
                            : "text-white/90 group-hover:text-white"
                        }`}>
                          {season.season}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Mobile-only Episodes Section */}
            <div className="hidden max-[1200px]:block">
              <div ref={episodesRef} className="episodes flex-shrink-0 bg-[#141414] rounded-lg overflow-hidden">
                {!episodes ? (
                  <div className="h-full flex items-center justify-center">
                    <BouncingLoader />
                  </div>
                ) : (
                  <Episodelist
                    episodes={episodes}
                    currentEpisode={episodeId}
                    onEpisodeClick={(id) => setEpisodeId(id)}
                    totalEpisodes={totalEpisodes}
                  />
                )}
              </div>
            </div>

            {/* Anime Info Section */}
            <div className="bg-[#141414] rounded-lg p-4">
              <div className="flex gap-x-6 max-[600px]:flex-row max-[600px]:gap-4">
                {animeInfo && animeInfo?.poster ? (
                  <img
                    src={`${animeInfo?.poster}`}
                    alt=""
                    className="w-[120px] h-[180px] object-cover rounded-md max-[600px]:w-[100px] max-[600px]:h-[150px]"
                  />
                ) : (
                  <Skeleton className="w-[120px] h-[180px] rounded-md max-[600px]:w-[100px] max-[600px]:h-[150px]" />
                )}
                <div className="flex flex-col gap-y-4 flex-1 max-[600px]:gap-y-2">
                  {animeInfo && animeInfo?.title ? (
                    <Link 
                      to={`/${animeId}`}
                      className="group"
                    >
                      <h1 className="text-[28px] font-medium text-white leading-tight group-hover:text-gray-300 transition-colors max-[600px]:text-[20px]">
                        {language ? animeInfo?.title : animeInfo?.japanese_title}
                      </h1>
                      <div className="flex items-center gap-1.5 mt-1 text-gray-400 text-sm group-hover:text-white transition-colors max-[600px]:text-[12px] max-[600px]:mt-0.5">
                        <span>View Details</span>
                        <svg className="w-4 h-4 transform group-hover:translate-x-0.5 transition-transform max-[600px]:w-3 max-[600px]:h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  ) : (
                    <Skeleton className="w-[170px] h-[20px] rounded-xl" />
                  )}
                  <div className="flex flex-wrap gap-2 max-[600px]:gap-1.5">
                    {animeInfo ? (
                      tags.map(
                        ({ condition, icon, text }, index) =>
                          condition && (
                            <span key={index} className="px-3 py-1 bg-[#1a1a1a] rounded-full text-sm flex items-center gap-x-1 text-gray-300 max-[600px]:px-2 max-[600px]:py-0.5 max-[600px]:text-[11px]">
                              {icon && <FontAwesomeIcon icon={icon} className="text-[12px] max-[600px]:text-[10px]" />}
                              {text}
                            </span>
                          )
                      )
                    ) : (
                      <Skeleton className="w-[70px] h-[20px] rounded-xl" />
                    )}
                  </div>
                  {animeInfo?.animeInfo?.Overview && (
                    <p className="text-[15px] text-gray-400 leading-relaxed max-[600px]:text-[13px] max-[600px]:leading-normal">
                      {animeInfo?.animeInfo?.Overview.length > 270 ? (
                        <>
                          {isFullOverview
                            ? animeInfo?.animeInfo?.Overview
                            : `${animeInfo?.animeInfo?.Overview.slice(0, 270)}...`}
                          <button
                            className="ml-2 text-gray-300 hover:text-white transition-colors max-[600px]:text-[12px] max-[600px]:ml-1"
                            onClick={() => setIsFullOverview(!isFullOverview)}
                          >
                            {isFullOverview ? "Show Less" : "Read More"}
                          </button>
                        </>
                      ) : (
                        animeInfo?.animeInfo?.Overview
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Desktop-only Seasons Section */}
            {seasons?.length > 0 && (
              <div className="bg-[#141414] rounded-lg p-4 max-[1200px]:hidden">
                <h2 className="text-xl font-semibold mb-4 text-white">More Seasons</h2>
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
                  {seasons.map((season, index) => (
                    <Link
                      to={`/${season.id}`}
                      key={index}
                      className={`relative w-full aspect-[3/1] rounded-lg overflow-hidden cursor-pointer group ${
                        animeId === String(season.id)
                          ? "ring-2 ring-white/40 shadow-lg shadow-white/10"
                          : ""
                      }`}
                    >
                      <img
                        src={season.season_poster}
                        alt={season.season}
                        className={`w-full h-full object-cover scale-150 ${
                          animeId === String(season.id)
                            ? "opacity-50"
                            : "opacity-40 group-hover:opacity-50 transition-opacity"
                        }`}
                      />
                      {/* Dots Pattern Overlay */}
                      <div 
                        className="absolute inset-0 z-10" 
                        style={{ 
                          backgroundImage: `url('data:image/svg+xml,<svg width="3" height="3" viewBox="0 0 3 3" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="1.5" cy="1.5" r="0.5" fill="white" fill-opacity="0.25"/></svg>')`,
                          backgroundSize: '3px 3px'
                        }}
                      />
                      {/* Dark Gradient Overlay */}
                      <div className={`absolute inset-0 z-20 bg-gradient-to-r ${
                        animeId === String(season.id)
                          ? "from-black/50 to-transparent"
                          : "from-black/40 to-transparent"
                      }`} />
                      {/* Title Container */}
                      <div className="absolute inset-0 z-30 flex items-center justify-center">
                        <p className={`text-[14px] sm:text-[16px] font-bold text-center px-2 sm:px-4 transition-colors duration-300 ${
                          animeId === String(season.id)
                            ? "text-white"
                            : "text-white/90 group-hover:text-white"
                        }`}>
                          {season.season}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Episodes and Related (Desktop Only) */}
          <div className="flex flex-col gap-6 h-full max-[1200px]:hidden">
            {/* Episodes Section */}
            <div ref={episodesRef} className="episodes flex-shrink-0 bg-[#141414] rounded-lg overflow-hidden">
              {!episodes ? (
                <div className="h-full flex items-center justify-center">
                  <BouncingLoader />
                </div>
              ) : (
                <Episodelist
                  episodes={episodes}
                  currentEpisode={episodeId}
                  onEpisodeClick={(id) => setEpisodeId(id)}
                  totalEpisodes={totalEpisodes}
                />
              )}
            </div>

            {/* Related Anime Section */}
            {animeInfo && animeInfo.related_data ? (
              <div className="bg-[#141414] rounded-lg p-4">
                <h2 className="text-xl font-semibold mb-4 text-white">Related Anime</h2>
                <Sidecard
                  data={animeInfo.related_data}
                  className="!mt-0"
                />
              </div>
            ) : (
              <div className="mt-6">
                <SidecardLoader />
              </div>
            )}
          </div>

          {/* Mobile-only Related Section */}
          {animeInfo && animeInfo.related_data && (
            <div className="hidden max-[1200px]:block bg-[#141414] rounded-lg p-4">
              <h2 className="text-xl font-semibold mb-4 text-white">Related Anime</h2>
              <Sidecard
                data={animeInfo.related_data}
                className="!mt-0"
              />
            </div>
          )}
        </div>
      </div>

      {/* Global Chat Component */}
      <ChatSection animeId={animeId} episodeId={episodeId} />
    </div>
  );
}

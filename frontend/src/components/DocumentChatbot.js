import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Bot, 
  User, 
  Loader, 
  Lightbulb, 
  MessageSquare,
  RefreshCw,
  Trash2,
  Copy,
  Check
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import MarkdownRenderer from './MarkdownRenderer';

const DocumentChatbot = ({ documentId }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [copied, setCopied] = useState(null);
  const messagesEndRef = useRef(null);
  const { makeAuthenticatedRequest } = useAuth();

  useEffect(() => {
    loadChatHistory();
    loadSuggestions();
  }, [documentId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadChatHistory = async () => {
    try {
      const response = await makeAuthenticatedRequest(`/chatbot/${documentId}/history`);
      if (response.ok) {
        const data = await response.json();
        // Fix: Ensure history is an array
        const history = Array.isArray(data.history) ? data.history : [];
        const formattedHistory = history.map(chat => ({
          id: chat._id,
          type: 'user',
          content: chat.message,
          timestamp: new Date(chat.timestamp)
        })).concat(history.map(chat => ({
          id: chat._id + '_response',
          type: 'bot',
          content: chat.response,
          timestamp: new Date(chat.timestamp)
        }))).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        setMessages(formattedHistory);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
  };

  const loadSuggestions = async () => {
    try {
      const response = await makeAuthenticatedRequest(`/chatbot/${documentId}/suggestions`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    }
  };

  const sendMessage = async (question = inputValue) => {
    if (!question.trim()) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: question,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await makeAuthenticatedRequest(`/chatbot/${documentId}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: question }) // Fix: Use 'message' key
      });

      if (response.ok) {
        const data = await response.json();
        const botMessage = {
          id: Date.now() + 1,
          type: 'bot',
          content: data.response,
          timestamp: new Date(),
          suggestions: data.suggestions
        };
        setMessages(prev => [...prev, botMessage]);
        
        // Update suggestions if provided
        if (data.suggestions) {
          setSuggestions(data.suggestions);
        }
      } else {
        const errorData = await response.json();
        const errorMessage = {
          id: Date.now() + 1,
          type: 'bot',
          content: `Error: ${errorData.error || 'Failed to get response'}`,
          timestamp: new Date(),
          isError: true
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage = {
        id: Date.now() + 1,
        type: 'bot',
        content: 'Sorry, I encountered an error while processing your question. Please try again.',
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyMessage = async (content, messageId) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(messageId);
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  const clearChat = async () => {
    try {
      // Clear local state immediately for better UX
      setMessages([]);
      
      // Also clear from database
      const response = await makeAuthenticatedRequest(`/chatbot/${documentId}/history`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        console.error('Failed to clear chat history from database');
        // Optionally show a toast/notification to user
      }
    } catch (error) {
      console.error('Failed to clear chat history:', error);
      // Optionally show error to user and reload history
      loadChatHistory();
    }
  };

  const formatTime = (timestamp) => {
    try {
      let date;

      // Handle MongoDB extended JSON format
      if (timestamp && typeof timestamp === 'object' && timestamp.$date) {
        date = new Date(timestamp.$date);
      } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else if (typeof timestamp === 'number') {
        date = new Date(timestamp);
      } else {
        date = new Date(timestamp);
      }

      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid timestamp:', timestamp);
        return 'Now';
      }

      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error formatting time:', error, 'Input:', timestamp);
      return 'Now';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                AI Assistant
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Ask questions about this document
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={loadSuggestions}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Refresh suggestions"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={clearChat}
              className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              title="Clear chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Suggestions */}
      {messages.length === 0 && suggestions.length > 0 && (
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2 mb-3">
            <Lightbulb className="w-4 h-4 text-yellow-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Suggested Questions
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {suggestions.slice(0, 4).map((suggestion, index) => (
              <button
                key={index}
                onClick={() => sendMessage(suggestion)}
                className="text-left p-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Start a Conversation
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Ask me anything about this document. I can help you find specific information, summarize key points, or clarify details.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start space-x-3 ${
                message.type === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {message.type === 'bot' && (
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}
              
              <div
                className={`max-w-md rounded-2xl group relative ${
                  message.type === 'user'
                    ? 'bg-blue-500 text-white p-4'
                    : message.isError
                    ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4'
                    : 'bg-gray-100 dark:bg-gray-700 p-4'
                }`}
              >
                {message.type === 'user' ? (
                  <p className="whitespace-pre-wrap leading-relaxed text-white">
                    {message.content}
                  </p>
                ) : message.isError ? (
                  <p className="whitespace-pre-wrap leading-relaxed text-red-700 dark:text-red-300">
                    {message.content}
                  </p>
                ) : (
                  <div className="prose dark:prose-invert prose-sm max-w-none">
                    <MarkdownRenderer 
                      content={message.content} 
                      className="text-gray-900 dark:text-white"
                    />
                  </div>
                )}
                
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-xs ${
                    message.type === 'user' 
                      ? 'text-blue-100' 
                      : message.isError
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {formatTime(message.timestamp)}
                  </span>
                  
                  {message.type === 'bot' && (
                    <button
                      onClick={() => copyMessage(message.content, message.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                    >
                      {copied === message.id ? (
                        <Check className="w-3 h-3 text-green-500" />
                      ) : (
                        <Copy className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                      )}
                    </button>
                  )}
                </div>
              </div>
              
              {message.type === 'user' && (
                <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                </div>
              )}
            </div>
          ))
        )}
        
        {isLoading && (
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-4">
              <div className="flex items-center space-x-2">
                <Loader className="w-4 h-4 animate-spin text-gray-500 dark:text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-end space-x-3">
          <div className="flex-1">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask a question about this document..."
              disabled={isLoading}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows="1"
              style={{
                minHeight: '48px',
                maxHeight: '120px',
                resize: 'none'
              }}
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={!inputValue.trim() || isLoading}
            className="p-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-xl transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DocumentChatbot;
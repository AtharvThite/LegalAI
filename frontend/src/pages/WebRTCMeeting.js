import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Video, VideoOff, Mic, MicOff, Phone, PhoneOff, Users, 
  Share, Monitor, Settings, Copy, Check, MessageSquare,
  Volume2, VolumeX, MoreVertical, UserMinus, Crown,
  Maximize, Minimize, Camera, CameraOff
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const WebRTCMeeting = ({ roomId, onLeave, isHost = false, meetingData = null }) => {
  // Media states
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  // Meeting states
  const [participants, setParticipants] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [meetingInfo, setMeetingInfo] = useState(meetingData);
  
  // UI states
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Transcription states
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [recognition, setRecognition] = useState(null);
  
  // Chat states
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  
  // Refs
  const localVideoRef = useRef(null);
  const peerConnections = useRef(new Map());
  const socketRef = useRef(null);
  const transcriptRef = useRef(null);
  
  const { makeAuthenticatedRequest, user } = useAuth();

  // WebRTC configuration
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  // Initialize media stream
  const initializeMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      setConnectionError('Unable to access camera or microphone');
      return null;
    }
  }, []);

  // Initialize speech recognition for transcription
  const initializeTranscription = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.warn('Speech recognition not supported');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = meetingInfo?.language || 'en-US';
    
    recognition.onresult = (event) => {
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        }
      }
      
      if (finalTranscript) {
        const transcriptEntry = {
          id: Date.now(),
          speaker_name: user?.name || 'You',
          text: finalTranscript.trim(),
          timestamp: new Date().toISOString(),
          user_id: user?.id
        };
        
        setTranscript(prev => [...prev, transcriptEntry]);
        
        // Save to backend
        saveTranscriptSegment(transcriptEntry);
      }
    };
    
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
    };
    
    setRecognition(recognition);
  }, [user, meetingInfo]);

  // Save transcript segment to backend
  const saveTranscriptSegment = async (transcriptEntry) => {
    try {
      await makeAuthenticatedRequest(`/webrtc/room/${roomId}/transcript`, {
        method: 'POST',
        body: JSON.stringify({
          speaker_name: transcriptEntry.speaker_name,
          text: transcriptEntry.text,
          confidence: 1.0
        })
      });
    } catch (error) {
      console.error('Error saving transcript:', error);
    }
  };

  // Toggle video
  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  // Toggle audio
  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  // Start screen sharing
  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      
      // Replace video track in all peer connections
      const videoTrack = screenStream.getVideoTracks()[0];
      
      peerConnections.current.forEach(async (pc) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(videoTrack);
        }
      });
      
      // Update local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream;
      }
      
      setIsScreenSharing(true);
      
      // Handle screen share end
      videoTrack.onended = () => {
        stopScreenShare();
      };
      
    } catch (error) {
      console.error('Error starting screen share:', error);
    }
  };

  // Stop screen sharing
  const stopScreenShare = async () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      
      peerConnections.current.forEach(async (pc) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(videoTrack);
        }
      });
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }
      
      setIsScreenSharing(false);
    }
  };

  // Toggle transcription
  const toggleTranscription = () => {
    if (recognition) {
      if (isTranscribing) {
        recognition.stop();
        setIsTranscribing(false);
      } else {
        recognition.start();
        setIsTranscribing(true);
      }
    }
  };

  // Copy room ID
  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy room ID:', error);
    }
  };

  // Leave meeting
  const leaveMeeting = async () => {
    try {
      // Stop all media tracks
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      
      // Close peer connections
      peerConnections.current.forEach(pc => pc.close());
      peerConnections.current.clear();
      
      // Stop transcription
      if (recognition && isTranscribing) {
        recognition.stop();
      }
      
      // Leave room on backend
      await makeAuthenticatedRequest(`/webrtc/room/${roomId}/leave`, {
        method: 'POST'
      });
      
      onLeave();
    } catch (error) {
      console.error('Error leaving meeting:', error);
      onLeave(); // Leave anyway
    }
  };

  // End meeting (host only)
  const endMeeting = async () => {
    if (!isHost) return;
    
    try {
      await makeAuthenticatedRequest(`/webrtc/room/${roomId}/end`, {
        method: 'POST'
      });
      
      leaveMeeting();
    } catch (error) {
      console.error('Error ending meeting:', error);
    }
  };

  // Fetch participants
  const fetchParticipants = async () => {
    try {
      const response = await makeAuthenticatedRequest(`/webrtc/room/${roomId}/participants`);
      const data = await response.json();
      setParticipants(data.participants || []);
    } catch (error) {
      console.error('Error fetching participants:', error);
    }
  };

  // Initialize on mount
  useEffect(() => {
    const initialize = async () => {
      const stream = await initializeMedia();
      if (stream) {
        setIsConnected(true);
        initializeTranscription();
        fetchParticipants();
        
        // Start transcription automatically if enabled
        if (meetingInfo?.settings?.auto_transcription) {
          setTimeout(() => {
            toggleTranscription();
          }, 2000);
        }
      }
    };
    
    initialize();
    
    // Cleanup on unmount
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      peerConnections.current.forEach(pc => pc.close());
      if (recognition && isTranscribing) {
        recognition.stop();
      }
    };
  }, [initializeMedia, initializeTranscription, meetingInfo]);

  // Scroll transcript to bottom
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  if (!isConnected && !connectionError) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Connecting to meeting...</p>
        </div>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white max-w-md">
          <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Phone className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Connection Error</h2>
          <p className="text-gray-300 mb-4">{connectionError}</p>
          <button
            onClick={onLeave}
            className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <div>
            <h1 className="text-white font-semibold">
              {meetingInfo?.title || `Room ${roomId}`}
            </h1>
            <p className="text-gray-300 text-sm">
              Room ID: {roomId} • {participants.length} participants
            </p>
          </div>
          <button
            onClick={copyRoomId}
            className="flex items-center space-x-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span className="text-sm">{copied ? 'Copied!' : 'Copy ID'}</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowParticipants(!showParticipants)}
            className="flex items-center space-x-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            <Users className="w-4 h-4" />
            <span>{participants.length}</span>
          </button>

          <button
            onClick={toggleTranscription}
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
              isTranscribing
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>{isTranscribing ? 'Recording' : 'Transcribe'}</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Video area */}
        <div className="flex-1 relative">
          {/* Main video */}
          <div className="h-full bg-black relative">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            
            {/* Video controls overlay */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-4 bg-black bg-opacity-50 px-6 py-3 rounded-full">
              <button
                onClick={toggleAudio}
                className={`p-3 rounded-full transition-colors ${
                  isAudioEnabled
                    ? 'bg-gray-600 hover:bg-gray-500 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>

              <button
                onClick={toggleVideo}
                className={`p-3 rounded-full transition-colors ${
                  isVideoEnabled
                    ? 'bg-gray-600 hover:bg-gray-500 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>

              <button
                onClick={isScreenSharing ? stopScreenShare : startScreenShare}
                className={`p-3 rounded-full transition-colors ${
                  isScreenSharing
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-600 hover:bg-gray-500 text-white'
                }`}
              >
                <Monitor className="w-5 h-5" />
              </button>

              <button
                onClick={leaveMeeting}
                className="p-3 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors"
              >
                <PhoneOff className="w-5 h-5" />
              </button>

              {isHost && (
                <button
                  onClick={endMeeting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors text-sm"
                >
                  End Meeting
                </button>
              )}
            </div>

            {/* User info overlay */}
            <div className="absolute top-4 left-4 bg-black bg-opacity-50 px-3 py-1 rounded-lg">
              <div className="flex items-center space-x-2 text-white">
                {isHost && <Crown className="w-4 h-4 text-yellow-400" />}
                <span className="text-sm">{user?.name || 'You'}</span>
                {!isAudioEnabled && <MicOff className="w-4 h-4 text-red-400" />}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
          {/* Participants panel */}
          {showParticipants && (
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-white font-semibold mb-3">Participants ({participants.length})</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {participants.map((participant) => (
                  <div key={participant.user_id} className="flex items-center justify-between p-2 bg-gray-700 rounded-lg">
                    <div className="flex items-center space-x-2">
                      {participant.role === 'host' && <Crown className="w-4 h-4 text-yellow-400" />}
                      <span className="text-white text-sm">{participant.name}</span>
                      <div className={`w-2 h-2 rounded-full ${participant.is_online ? 'bg-green-400' : 'bg-gray-400'}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live transcript */}
          <div className="flex-1 flex flex-col">
            <div className="p-3 border-b border-gray-700">
              <h3 className="text-white font-semibold">Live Transcript</h3>
              {isTranscribing && (
                <p className="text-green-400 text-xs mt-1">● Recording</p>
              )}
            </div>
            <div
              ref={transcriptRef}
              className="flex-1 p-3 overflow-y-auto space-y-2"
            >
              {transcript.length === 0 ? (
                <div className="text-gray-400 text-sm text-center py-8">
                  {isTranscribing ? 'Listening for speech...' : 'Start transcription to see live text'}
                </div>
              ) : (
                transcript.map((entry) => (
                  <div key={entry.id} className="bg-gray-700 rounded-lg p-3">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span>{entry.speaker_name}</span>
                      <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-white text-sm">{entry.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebRTCMeeting;
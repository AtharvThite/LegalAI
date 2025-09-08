import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mic, MicOff, Video, VideoOff, Phone, PhoneOff, 
  Monitor, Users, MessageSquare, Copy, Check,
  Crown, Pin, PinOff
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import io from 'socket.io-client';

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
  const [copied, setCopied] = useState(false);
  const [pinnedParticipant, setPinnedParticipant] = useState(null);
  
  // Transcription states
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [recognition, setRecognition] = useState(null);
  
  // Refs
  const localVideoRef = useRef(null);
  const remoteVideosRef = useRef(new Map());
  const peerConnections = useRef(new Map());
  const socketRef = useRef(null);
  const transcriptRef = useRef(null);
  const initializingRef = useRef(false);
  
  const { makeAuthenticatedRequest, user } = useAuth();

  // WebRTC configuration
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  // Initialize media stream
  const initializeMedia = useCallback(async () => {
    console.log('🎥 Initializing media...');
    
    if (initializingRef.current) {
      console.log('⚠️ Already initializing media');
      return null;
    }
    
    initializingRef.current = true;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      console.log('✅ Got local media stream with tracks:', stream.getTracks().map(t => t.kind));
      
      setLocalStream(stream);
      
      // Set local video immediately
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.log('✅ Set local video source');
      }
      
      return stream;
    } catch (error) {
      console.error('❌ Error accessing media:', error);
      setConnectionError(`Camera/microphone access denied: ${error.message}`);
      return null;
    } finally {
      initializingRef.current = false;
    }
  }, []);

  // Initialize Socket.IO connection
  const initializeSocket = useCallback((stream) => {
    if (socketRef.current) {
      console.log('⚠️ Socket already exists');
      return socketRef.current;
    }
    
    console.log('🔌 Connecting to Socket.IO server...');
    
    const socket = io('http://localhost:5000', {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: false
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Socket.IO connected');
      
      // Join the room
      console.log(`📡 Joining room: ${roomId}`);
      socket.emit('join-room', {
        room_id: roomId,
        user_id: user.id,
        user_name: user.name
      });
    });

    socket.on('existing-users', async (users) => {
      console.log('👥 Existing users in room:', users);
      setIsConnected(true);
      
      // Create peer connections with existing users (we initiate)
      for (const userInfo of users) {
        await createPeerConnection(userInfo.socket_id, userInfo.user_name, true, stream);
      }
    });

    socket.on('user-joined', async (userInfo) => {
      console.log('👋 New user joined:', userInfo);
      setParticipants(prev => [...prev.filter(p => p.socket_id !== userInfo.socket_id), userInfo]);
      
      // Create peer connection for new user (they will initiate)
      await createPeerConnection(userInfo.socket_id, userInfo.user_name, false, stream);
    });

    socket.on('offer', async (data) => {
      console.log('📞 Received offer from:', data.caller);
      await handleOffer(data.offer, data.caller);
    });

    socket.on('answer', async (data) => {
      console.log('📞 Received answer from:', data.caller);
      await handleAnswer(data.answer, data.caller);
    });

    socket.on('ice-candidate', async (data) => {
      console.log('🧊 Received ICE candidate from:', data.caller);
      await handleIceCandidate(data.candidate, data.caller);
    });

    socket.on('user-left', (data) => {
      console.log('👋 User left:', data.socket_id);
      handleUserLeft(data.socket_id);
      setParticipants(prev => prev.filter(p => p.socket_id !== data.socket_id));
    });

    socket.on('transcript-update', (transcriptData) => {
      console.log('📝 Received transcript update');
      setTranscript(prev => [...prev, transcriptData]);
    });

    socket.on('disconnect', () => {
      console.log('❌ Socket.IO disconnected');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Socket.IO connection error:', error);
      setConnectionError(`Connection failed: ${error.message}`);
    });

    socket.on('error', (data) => {
      console.error('❌ Socket.IO error:', data);
      setConnectionError(data.message || 'Socket error');
    });

    return socket;
  }, [roomId, user]);

  // Create peer connection
  const createPeerConnection = useCallback(async (socketId, userName, isInitiator, stream) => {
    console.log(`🔗 Creating peer connection with ${userName} (${socketId}), initiator: ${isInitiator}`);
    
    if (peerConnections.current.has(socketId)) {
      console.log('⚠️ Peer connection already exists for', socketId);
      return;
    }

    try {
      const peerConnection = new RTCPeerConnection(rtcConfig);
      peerConnections.current.set(socketId, peerConnection);

      // Add local stream tracks
      if (stream) {
        console.log('📤 Adding local tracks to peer connection');
        stream.getTracks().forEach(track => {
          console.log(`Adding ${track.kind} track`);
          peerConnection.addTrack(track, stream);
        });
      }

      // Handle remote stream
      peerConnection.ontrack = (event) => {
        console.log(`📥 Received ${event.track.kind} track from ${socketId}`);
        const [remoteStream] = event.streams;
        
        setRemoteStreams(prev => {
          const newMap = new Map(prev);
          newMap.set(socketId, {
            stream: remoteStream,
            userName: userName,
            socketId: socketId
          });
          console.log(`✅ Added remote stream for ${userName}, total streams:`, newMap.size);
          return newMap;
        });
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('ice-candidate', {
            target: socketId,
            candidate: event.candidate
          });
        }
      };

      // Connection state monitoring
      peerConnection.onconnectionstatechange = () => {
        console.log(`Connection state with ${socketId}: ${peerConnection.connectionState}`);
      };

      peerConnection.oniceconnectionstatechange = () => {
        console.log(`ICE connection state with ${socketId}: ${peerConnection.iceConnectionState}`);
      };

      // Create offer if initiator
      if (isInitiator) {
        console.log(`📞 Creating offer for ${socketId}`);
        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(offer);
        
        console.log(`📤 Sending offer to ${socketId}`);
        socketRef.current.emit('offer', {
          target: socketId,
          offer: offer
        });
      }

    } catch (error) {
      console.error(`❌ Error creating peer connection with ${socketId}:`, error);
    }
  }, [rtcConfig]);

  // Handle received offer
  const handleOffer = async (offer, callerId) => {
    console.log(`📞 Handling offer from ${callerId}`);
    
    try {
      const peerConnection = peerConnections.current.get(callerId);
      if (!peerConnection) {
        console.error(`❌ No peer connection found for ${callerId}`);
        return;
      }

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      console.log(`📤 Sending answer to ${callerId}`);
      socketRef.current.emit('answer', {
        target: callerId,
        answer: answer
      });
    } catch (error) {
      console.error(`❌ Error handling offer from ${callerId}:`, error);
    }
  };

  // Handle received answer
  const handleAnswer = async (answer, callerId) => {
    console.log(`📞 Handling answer from ${callerId}`);
    
    try {
      const peerConnection = peerConnections.current.get(callerId);
      if (!peerConnection) {
        console.error(`❌ No peer connection found for ${callerId}`);
        return;
      }

      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      console.log(`✅ Set remote description for ${callerId}`);
    } catch (error) {
      console.error(`❌ Error handling answer from ${callerId}:`, error);
    }
  };

  // Handle ICE candidate
  const handleIceCandidate = async (candidate, callerId) => {
    try {
      const peerConnection = peerConnections.current.get(callerId);
      if (!peerConnection) {
        console.error(`❌ No peer connection found for ${callerId}`);
        return;
      }

      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error(`❌ Error handling ICE candidate from ${callerId}:`, error);
    }
  };

  // Handle user left
  const handleUserLeft = (socketId) => {
    console.log(`👋 Handling user left: ${socketId}`);
    
    const peerConnection = peerConnections.current.get(socketId);
    if (peerConnection) {
      peerConnection.close();
      peerConnections.current.delete(socketId);
    }
    
    remoteVideosRef.current.delete(socketId);
    
    setRemoteStreams(prev => {
      const newMap = new Map(prev);
      newMap.delete(socketId);
      console.log(`✅ Removed user ${socketId}, remaining:`, newMap.size);
      return newMap;
    });

    if (pinnedParticipant === socketId) {
      setPinnedParticipant(null);
    }
  };

  // Initialize speech recognition
  const initializeTranscription = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.warn('Speech recognition not supported');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = meetingInfo?.language || 'en-US';
    
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const transcriptText = event.results[i][0].transcript;
          const transcriptEntry = {
            id: Date.now() + Math.random(),
            speaker_name: user?.name || 'You',
            text: transcriptText.trim(),
            timestamp: new Date(),
            user_id: user?.id
          };
          
          setTranscript(prev => [...prev, transcriptEntry]);
          
          // Broadcast to other participants
          if (socketRef.current) {
            socketRef.current.emit('transcript-update', {
              room_id: roomId,
              transcript: transcriptEntry
            });
          }
          
          // Save to backend
          saveTranscriptSegment(transcriptEntry);
        }
      }
    };
    
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
    };
    
    recognition.onend = () => {
      if (isTranscribing) {
        setTimeout(() => {
          if (recognition && isTranscribing) {
            recognition.start();
          }
        }, 100);
      }
    };
    
    setRecognition(recognition);
  }, [user, meetingInfo, isTranscribing, roomId]);

  // Save transcript segment
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

  // Media controls
  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
      }
    }
  };

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

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy room ID:', error);
    }
  };

  const togglePin = (socketId) => {
    if (pinnedParticipant === socketId) {
      setPinnedParticipant(null);
    } else {
      setPinnedParticipant(socketId);
    }
  };

  // Leave meeting
  const leaveMeeting = async () => {
    try {
      console.log('🚪 Leaving meeting...');
      
      if (recognition) {
        recognition.stop();
      }
      
      // Save final transcript
      if (transcript.length > 0) {
        const fullTranscript = transcript
          .map(entry => `${entry.speaker_name}: ${entry.text}`)
          .join('\n\n');
        
        try {
          await makeAuthenticatedRequest(`/webrtc/room/${roomId}/finalize`, {
            method: 'POST',
            body: JSON.stringify({
              transcript: fullTranscript,
              speakers: [...new Set(transcript.map(t => t.speaker_name))]
            })
          });
        } catch (error) {
          console.error('Error saving final transcript:', error);
        }
      }
      
      // Close peer connections
      peerConnections.current.forEach(pc => pc.close());
      peerConnections.current.clear();
      
      // Stop local stream
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      
      // Leave room via socket
      if (socketRef.current) {
        socketRef.current.emit('leave-room', { room_id: roomId });
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      
      // Leave via API
      await makeAuthenticatedRequest(`/webrtc/room/${roomId}/leave`, {
        method: 'POST'
      });
      
      onLeave();
    } catch (error) {
      console.error('Error leaving meeting:', error);
      onLeave();
    }
  };

  // Initialize everything
  useEffect(() => {
    const initialize = async () => {
      console.log('🚀 Initializing WebRTC meeting...');
      
      // Step 1: Get media first
      const stream = await initializeMedia();
      if (!stream) {
        console.error('❌ Failed to initialize media');
        return;
      }
      
      // Step 2: Initialize speech recognition
      initializeTranscription();
      
      // Step 3: Connect to socket with stream ready
      setTimeout(() => {
        initializeSocket(stream);
      }, 500);
    };
    
    initialize();
    
    // Cleanup
    return () => {
      console.log('🧹 Cleaning up WebRTC meeting...');
      
      if (recognition) {
        recognition.stop();
      }
      
      peerConnections.current.forEach(pc => pc.close());
      peerConnections.current.clear();
      
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // Scroll transcript to bottom
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  // Calculate grid layout
  const getGridLayout = () => {
    const totalParticipants = remoteStreams.size + 1;
    
    if (pinnedParticipant) {
      return { main: { cols: 1, rows: 1 }, sidebar: { cols: 1, rows: Math.min(4, totalParticipants - 1) } };
    }
    
    if (totalParticipants <= 2) return { main: { cols: 2, rows: 1 } };
    if (totalParticipants <= 4) return { main: { cols: 2, rows: 2 } };
    if (totalParticipants <= 6) return { main: { cols: 3, rows: 2 } };
    return { main: { cols: 3, rows: 3 } };
  };

  if (!isConnected && !connectionError) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Connecting to meeting...</p>
          <p className="text-sm text-gray-400 mt-2">Room: {roomId}</p>
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

  const layout = getGridLayout();

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
              Room ID: {roomId} • {remoteStreams.size + 1} participants
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
            <span>{remoteStreams.size + 1}</span>
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
          {/* Video grid */}
          <div 
            className="h-full grid gap-2 p-2" 
            style={{
              gridTemplateColumns: `repeat(${layout.main.cols}, 1fr)`,
              gridTemplateRows: `repeat(${layout.main.rows}, 1fr)`
            }}
          >
            {/* Local video */}
            <div className="relative bg-black rounded-lg overflow-hidden group">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-white text-sm flex items-center space-x-1">
                {isHost && <Crown className="w-3 h-3 text-yellow-400" />}
                <span>{user?.name || 'You'}</span>
                {!isAudioEnabled && <MicOff className="w-3 h-3 text-red-400" />}
                {!isVideoEnabled && <VideoOff className="w-3 h-3 text-red-400" />}
              </div>
              <button
                onClick={() => togglePin('local')}
                className="absolute top-2 right-2 p-1 bg-black bg-opacity-50 hover:bg-opacity-70 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Pin className="w-3 h-3 text-white" />
              </button>
            </div>

            {/* Remote videos */}
            {Array.from(remoteStreams.entries()).map(([socketId, { stream, userName }]) => (
              <div key={socketId} className="relative bg-black rounded-lg overflow-hidden group">
                <video
                  ref={el => {
                    if (el && stream) {
                      el.srcObject = stream;
                      remoteVideosRef.current.set(socketId, el);
                      console.log(`✅ Set video element for ${userName}`);
                    }
                  }}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-white text-sm">
                  {userName}
                </div>
                <button
                  onClick={() => togglePin(socketId)}
                  className="absolute top-2 right-2 p-1 bg-black bg-opacity-50 hover:bg-opacity-70 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Pin className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
          </div>
            
          {/* Video controls */}
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
              onClick={leaveMeeting}
              className="p-3 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sidebar */}
        {showParticipants && (
          <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
            <div className="p-3 border-b border-gray-700">
              <h3 className="text-white font-semibold mb-2">
                Participants ({remoteStreams.size + 1})
              </h3>
            </div>

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
        )}
      </div>
    </div>
  );
};

export default WebRTCMeeting;
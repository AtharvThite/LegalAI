import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Video, VideoOff, Mic, MicOff, PhoneOff, Users, MessageSquare, 
  Copy, Check, Pin, Crown, Settings, PinOff 
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
  const [transcriptionEnabled, setTranscriptionEnabled] = useState(
    meetingData?.settings?.auto_transcription ?? true
  );
  
  // Meeting end states
  const [showMeetingEndedModal, setShowMeetingEndedModal] = useState(false);
  const [meetingEndedBy, setMeetingEndedBy] = useState('');
  const [finalMeetingData, setFinalMeetingData] = useState(null);
  
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
      console.log('Media initialization already in progress');
      return;
    }
    
    initializingRef.current = true;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isVideoEnabled,
        audio: isAudioEnabled
      });

      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      console.log('✅ Media initialized successfully');
      
      // Initialize socket after media is ready
      initializeSocket(stream);
      
    } catch (error) {
      console.error('❌ Error initializing media:', error);
      setConnectionError('Failed to access camera/microphone');
    } finally {
      initializingRef.current = false;
    }
  }, [isVideoEnabled, isAudioEnabled]);

  // Initialize Socket.IO connection
  const initializeSocket = useCallback((stream) => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    
    console.log('🔌 Connecting to Socket.IO server...');
    
    const socket = io('http://localhost:5000', {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: false
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Connected to signaling server');
      setIsConnected(true);
      
      // Join the room
      socket.emit('join-room', {
        room_id: roomId,
        user_id: user?.id,
        user_name: user?.name || 'Anonymous'
      });
    });

    socket.on('existing-users', async (users) => {
      console.log('👥 Existing users in room:', users);
      
      for (const userInfo of users) {
        await createPeerConnection(
          userInfo.socket_id, 
          userInfo.user_name, 
          true, // I am the initiator
          stream
        );
      }
    });

    socket.on('user-joined', async (userInfo) => {
      console.log('👋 User joined:', userInfo.user_name);
      
      await createPeerConnection(
        userInfo.socket_id, 
        userInfo.user_name, 
        false, // They are the initiator
        stream
      );
    });

    socket.on('user-left', (data) => {
      console.log('👋 User left:', data.socket_id);
      handleUserLeft(data.socket_id);
    });

    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('transcript-update', (data) => {
      setTranscript(prev => [...prev, data]);
    });

    // Meeting end events
    socket.on('meeting-ended', (data) => {
      console.log('📢 Meeting ended by host:', data);
      setMeetingEndedBy(data.host_name);
      setFinalMeetingData(data.meeting_data);
      setShowMeetingEndedModal(true);
      
      // Stop all media streams
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      
      // Stop transcription
      if (recognition && isTranscribing) {
        recognition.stop();
        setIsTranscribing(false);
      }
    });

    socket.on('transcription-status-changed', (data) => {
      console.log('📝 Transcription status changed:', data);
      setTranscriptionEnabled(data.enabled);
      
      // Auto-start/stop transcription based on host control
      if (data.enabled && !isTranscribing && recognition) {
        recognition.start();
        setIsTranscribing(true);
      } else if (!data.enabled && isTranscribing && recognition) {
        recognition.stop();
        setIsTranscribing(false);
      }
    });

    socket.on('disconnect', () => {
      console.log('❌ Disconnected from signaling server');
      setIsConnected(false);
    });

    socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
      setConnectionError('Connection error');
    });

    // Initialize transcription after socket setup
    if (transcriptionEnabled) {
      initializeTranscription();
    }

    return socket;
  }, [roomId, user, transcriptionEnabled]);

  // Create peer connection
  const createPeerConnection = useCallback(async (socketId, userName, isInitiator, stream) => {
    console.log(`🔗 Creating peer connection with ${userName} (${socketId})`);
    
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections.current.set(socketId, pc);

    // Add local stream tracks
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    // Handle incoming stream
    pc.ontrack = (event) => {
      console.log('📺 Received remote stream from', userName);
      const [remoteStream] = event.streams;
      
      setRemoteStreams(prev => {
        const newMap = new Map(prev);
        newMap.set(socketId, { stream: remoteStream, userName });
        return newMap;
      });

      // Set video element
      const videoElement = remoteVideosRef.current.get(socketId);
      if (videoElement && remoteStream) {
        videoElement.srcObject = remoteStream;
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', {
          target: socketId,
          candidate: event.candidate
        });
      }
    };

    // Handle connection state
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${userName}: ${pc.connectionState}`);
    };

    // If we're the initiator, create offer
    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        socketRef.current.emit('offer', {
          target: socketId,
          offer: offer
        });
      } catch (error) {
        console.error('Error creating offer:', error);
      }
    }

    return pc;
  }, [rtcConfig]);

  // Handle received offer
  const handleOffer = async (data) => {
    const { offer, caller } = data;
    console.log('📨 Received offer from', caller);

    const pc = peerConnections.current.get(caller);
    if (!pc) {
      console.error('No peer connection found for caller:', caller);
      return;
    }

    try {
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketRef.current.emit('answer', {
        target: caller,
        answer: answer
      });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };

  // Handle received answer
  const handleAnswer = async (data) => {
    const { answer, caller } = data;
    console.log('📨 Received answer from', caller);

    const pc = peerConnections.current.get(caller);
    if (!pc) {
      console.error('No peer connection found for caller:', caller);
      return;
    }

    try {
      await pc.setRemoteDescription(answer);
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  };

  // Handle ICE candidate
  const handleIceCandidate = async (data) => {
    const { candidate, caller } = data;
    
    const pc = peerConnections.current.get(caller);
    if (!pc) {
      console.error('No peer connection found for caller:', caller);
      return;
    }

    try {
      await pc.addIceCandidate(candidate);
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  };

  // Handle user left
  const handleUserLeft = (socketId) => {
    console.log('🚪 Cleaning up connection for', socketId);
    
    // Close peer connection
    const pc = peerConnections.current.get(socketId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(socketId);
    }

    // Remove remote stream
    setRemoteStreams(prev => {
      const newMap = new Map(prev);
      newMap.delete(socketId);
      return newMap;
    });

    // Clean up video reference
    remoteVideosRef.current.delete(socketId);
  };

  // Initialize speech recognition
  const initializeTranscription = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.warn('Speech recognition not supported');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognitionInstance = new SpeechRecognition();

    recognitionInstance.continuous = true;
    recognitionInstance.interimResults = true;
    recognitionInstance.lang = meetingInfo?.language || 'en-US';

    recognitionInstance.onresult = async (event) => {
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        const transcriptEntry = {
          id: Date.now(),
          speaker_name: user?.name || 'You',
          text: finalTranscript.trim(),
          timestamp: new Date().toISOString(),
          confidence: event.results[event.results.length - 1][0].confidence || 0.9
        };

        setTranscript(prev => [...prev, transcriptEntry]);
        
        // Save to database and broadcast
        await saveTranscriptSegment(transcriptEntry);
      }
    };

    recognitionInstance.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsTranscribing(false);
    };

    recognitionInstance.onend = () => {
      if (transcriptionEnabled && isTranscribing) {
        // Restart if still enabled
        setTimeout(() => {
          try {
            recognitionInstance.start();
          } catch (error) {
            console.error('Error restarting speech recognition:', error);
            setIsTranscribing(false);
          }
        }, 1000);
      }
    };

    setRecognition(recognitionInstance);

    if (transcriptionEnabled) {
      try {
        recognitionInstance.start();
        setIsTranscribing(true);
      } catch (error) {
        console.error('Error starting speech recognition:', error);
      }
    }
  }, [user, meetingInfo, transcriptionEnabled]);

  // Save transcript segment
  const saveTranscriptSegment = async (transcriptEntry) => {
    try {
      await makeAuthenticatedRequest(`/webrtc/room/${roomId}/transcript`, {
        method: 'POST',
        body: JSON.stringify(transcriptEntry)
      });

      // Broadcast to other participants
      if (socketRef.current) {
        socketRef.current.emit('transcript-update', {
          room_id: roomId,
          transcript: transcriptEntry
        });
      }
    } catch (error) {
      console.error('Error saving transcript:', error);
    }
  };

  // Media controls
  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  // Host-only transcription toggle
  const toggleTranscriptionForAll = async () => {
    if (!isHost) return;
    
    const newEnabled = !transcriptionEnabled;
    
    try {
      const response = await makeAuthenticatedRequest(`/webrtc/room/${roomId}/transcription`, {
        method: 'POST',
        body: JSON.stringify({ enabled: newEnabled })
      });
      
      if (response.ok) {
        setTranscriptionEnabled(newEnabled);
        
        // Notify all participants via socket
        if (socketRef.current) {
          socketRef.current.emit('transcription-toggled', {
            room_id: roomId,
            enabled: newEnabled,
            host_name: user?.name || 'Host'
          });
        }
        
        // Update local transcription
        if (newEnabled && !isTranscribing && recognition) {
          recognition.start();
          setIsTranscribing(true);
        } else if (!newEnabled && isTranscribing && recognition) {
          recognition.stop();
          setIsTranscribing(false);
        }
      }
    } catch (error) {
      console.error('Error toggling transcription:', error);
    }
  };

  // Updated transcription toggle (only for display, actual control is host-only)
  const toggleTranscription = () => {
    if (isHost) {
      toggleTranscriptionForAll();
    } else {
      // Show info that only host can control
      alert('Only the host can control transcription for all participants');
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
    setPinnedParticipant(pinnedParticipant === socketId ? null : socketId);
  };

  // Leave meeting function
  const leaveMeeting = async () => {
    try {
      // Save transcript if host is ending the meeting
      if (isHost && transcript.length > 0) {
        const fullTranscript = transcript
          .map(entry => `${entry.speaker_name} (${new Date(entry.timestamp).toLocaleTimeString()}): ${entry.text}`)
          .join('\n\n');
        
        await makeAuthenticatedRequest(`/webrtc/room/${roomId}/finalize`, {
          method: 'POST',
          body: JSON.stringify({
            transcript: fullTranscript,
            speakers: [...new Set(transcript.map(t => t.speaker_name))]
          })
        });
      }
      
      // If host, end meeting for everyone
      if (isHost) {
        const endResponse = await makeAuthenticatedRequest(`/webrtc/room/${roomId}/end`, {
          method: 'POST'
        });
        
        if (endResponse.ok) {
          const endData = await endResponse.json();
          
          // Notify all participants via socket
          if (socketRef.current) {
            socketRef.current.emit('meeting-ended', {
              room_id: roomId,
              host_name: user?.name || 'Host',
              meeting_data: endData
            });
          }
        }
      } else {
        // Participant leaving
        await makeAuthenticatedRequest(`/webrtc/room/${roomId}/leave`, {
          method: 'POST'
        });
      }
      
      // Cleanup
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      
      // Disconnect from signaling
      if (socketRef.current) {
        socketRef.current.emit('leave-room', { room_id: roomId });
        socketRef.current.disconnect();
      }
      
      // Stop transcription
      if (recognition && isTranscribing) {
        recognition.stop();
      }
      
      onLeave();
    } catch (error) {
      console.error('Error leaving meeting:', error);
      onLeave();
    }
  };

  // Initialize everything
  useEffect(() => {
    initializeMedia();
    
    return () => {
      // Cleanup on unmount
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      
      peerConnections.current.forEach(pc => pc.close());
      
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      
      if (recognition) {
        recognition.stop();
      }
    };
  }, [initializeMedia]);

  // Scroll transcript to bottom
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  // Calculate grid layout
  const getGridLayout = () => {
    const totalParticipants = remoteStreams.size + 1; // +1 for local user
    
    if (pinnedParticipant) {
      return {
        main: { cols: 1, rows: 1 },
        sidebar: { cols: 1, rows: Math.min(totalParticipants - 1, 3) }
      };
    }
    
    if (totalParticipants <= 4) {
      return { main: { cols: 2, rows: 2 } };
    } else if (totalParticipants <= 9) {
      return { main: { cols: 3, rows: 3 } };
    } else {
      return { main: { cols: 4, rows: 3 } };
    }
  };

  if (!isConnected && !connectionError) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Connecting to meeting...</p>
        </div>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white max-w-md">
          <h2 className="text-xl font-semibold mb-4">Connection Error</h2>
          <p className="mb-6">{connectionError}</p>
          <button
            onClick={onLeave}
            className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
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
      {/* Meeting ended modal */}
      {showMeetingEndedModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md mx-4 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <PhoneOff className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Meeting Ended
            </h3>
            
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              The meeting has been ended by {meetingEndedBy}.
              {finalMeetingData?.participant_meetings_created > 0 && (
                <span className="block mt-2 text-sm">
                  The meeting has been saved to your recent meetings.
                </span>
              )}
            </p>
            
            <button
              onClick={() => {
                setShowMeetingEndedModal(false);
                onLeave();
              }}
              className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <div>
            <h1 className="text-white font-semibold flex items-center space-x-2">
              <span>{meetingInfo?.title || `Room ${roomId}`}</span>
              {isHost && <Crown className="w-4 h-4 text-yellow-400" />}
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
              transcriptionEnabled
                ? isTranscribing
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-white cursor-not-allowed'
            }`}
            title={
              isHost 
                ? (transcriptionEnabled ? 'Disable transcription for all' : 'Enable transcription for all')
                : 'Only host can control transcription'
            }
          >
            <MessageSquare className="w-4 h-4" />
            <span>
              {!transcriptionEnabled ? 'Disabled' : isTranscribing ? 'Recording' : 'Enabled'}
            </span>
            {isHost && <Crown className="w-3 h-3 text-yellow-400" />}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Video grid */}
        <div className="flex-1 relative">
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
                    if (el) {
                      remoteVideosRef.current.set(socketId, el);
                      el.srcObject = stream;
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
            
          {/* Controls */}
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

        {/* Participants sidebar */}
        {showParticipants && (
          <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
            <div className="p-3 border-b border-gray-700">
              <h3 className="text-white font-semibold mb-2">
                Participants ({remoteStreams.size + 1})
              </h3>
            </div>

            {/* Transcript section */}
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
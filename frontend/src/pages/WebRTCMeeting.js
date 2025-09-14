import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Video, VideoOff, Mic, MicOff, Phone, Settings, 
  Users, Copy, Pin, PinOff, Monitor, MonitorOff,
  Volume2, VolumeX, MessageSquare, FileText,
  Check, Loader, ArrowLeft, Share2, MoreVertical
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
  const [participantMuteStatus, setParticipantMuteStatus] = useState(new Map());
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
  
  const { makeAuthenticatedRequest, user, API_BASE } = useAuth();

  // WebRTC configuration
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  // Update peer connections with new stream
  const updatePeerConnectionsWithNewStream = useCallback((stream) => {
    console.log('🔄 Updating peer connections with new stream');
    peerConnections.current.forEach((pc, socketId) => {
      // Remove old tracks
      pc.getSenders().forEach(sender => {
        if (sender.track) {
          pc.removeTrack(sender);
        }
      });
      
      // Add new tracks
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
    });
  }, []);

  // Initialize media stream with proper constraints
  const initializeMedia = useCallback(async (videoEnabled = true, audioEnabled = true) => {
    console.log('🎥 Initializing media...', { videoEnabled, audioEnabled });
    
    try {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }

      const constraints = {
        video: videoEnabled ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        } : false,
        audio: audioEnabled ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } : false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('✅ Media initialized successfully', stream);
      
      setLocalStream(stream);
      
      // Set video element
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Update existing peer connections with new stream
      updatePeerConnectionsWithNewStream(stream);
      
      return stream;
    } catch (error) {
      console.error('❌ Failed to initialize media:', error);
      setConnectionError('Failed to access camera/microphone');
      throw error;
    }
  }, [localStream, updatePeerConnectionsWithNewStream]);

  // Handle user left
  const handleUserLeft = useCallback((socketId) => {
    console.log('🚪 Cleaning up connection for', socketId);
    
    // Close peer connection
    const pc = peerConnections.current.get(socketId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(socketId);
    }

    // Remove from participants
    setParticipants(prev => prev.filter(p => p.socket_id !== socketId));

    // Remove remote stream
    setRemoteStreams(prev => {
      const newMap = new Map(prev);
      newMap.delete(socketId);
      return newMap;
    });

    // Remove mute status
    setParticipantMuteStatus(prev => {
      const newMap = new Map(prev);
      newMap.delete(socketId);
      return newMap;
    });

    // Clean up video reference
    remoteVideosRef.current.delete(socketId);
  }, []);

  // Handle ICE candidate
  const handleIceCandidate = useCallback(async (data) => {
    const { candidate, caller } = data;
    
    const pc = peerConnections.current.get(caller);
    if (!pc) {
      console.warn('No peer connection found for ICE candidate from:', caller);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`✅ Added ICE candidate from ${caller}`);
    } catch (error) {
      console.error('❌ Error adding ICE candidate:', error);
    }
  }, []);

  // Handle received answer with proper state checking
  const handleAnswer = useCallback(async (data) => {
    const { answer, caller } = data;
    console.log(`📨 Received answer from ${caller}`);

    try {
      const pc = peerConnections.current.get(caller);
      
      if (pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log(`✅ Successfully set remote description for ${caller}`);
      } else {
        console.warn(`⚠️ Cannot set remote description, peer connection state: ${pc?.signalingState || 'undefined'}`);
      }
    } catch (error) {
      console.error('❌ Error handling answer:', error);
    }
  }, []);

  // Handle received offer with proper state checking
  const handleOffer = useCallback(async (data) => {
    const { offer, caller } = data;
    console.log(`📨 Received offer from ${caller}`);

    try {
      let pc = peerConnections.current.get(caller);
      
      if (!pc) {
        // Create new peer connection if it doesn't exist
        const callerInfo = participants.find(p => p.socket_id === caller);
        pc = await createPeerConnection(caller, callerInfo?.user_name || 'Unknown', false, localStream);
      }

      // Only set remote description if we're in the correct state
      if (pc.signalingState === 'stable' || pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        
        // Create and send answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        if (socketRef.current) {
          socketRef.current.emit('answer', {
            target: caller,
            answer: answer
          });
        }
        
        console.log(`📤 Sent answer to ${caller}`);
      } else {
        console.warn(`⚠️ Cannot set remote description, peer connection state: ${pc.signalingState}`);
      }
    } catch (error) {
      console.error('❌ Error handling offer:', error);
    }
  }, [participants, localStream]); // Add dependencies here

  // Create peer connection with proper state management
  const createPeerConnection = useCallback(async (socketId, userName, isInitiator, stream) => {
    console.log(`🔗 Creating peer connection with ${userName} (${socketId})`);
    console.log(`📍 Role: ${isInitiator ? 'Initiator' : 'Receiver'}`);

    try {
      const pc = new RTCPeerConnection(rtcConfig);
      peerConnections.current.set(socketId, pc);

      // Add local stream tracks to peer connection
      if (stream) {
        stream.getTracks().forEach(track => {
          console.log(`➕ Adding ${track.kind} track to peer connection`);
          pc.addTrack(track, stream);
        });
      }

      // Handle remote stream
      pc.ontrack = (event) => {
        console.log(`📺 Received remote stream from ${userName}`, event.streams[0]);
        setRemoteStreams(prev => {
          const newMap = new Map(prev);
          newMap.set(socketId, {
            stream: event.streams[0],
            userName: userName
          });
          return newMap;
        });

        // Set video element for remote stream
        const videoElement = remoteVideosRef.current.get(socketId);
        if (videoElement && event.streams[0]) {
          videoElement.srcObject = event.streams[0];
        }
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log(`Connection state with ${userName}:`, pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          console.log(`❌ Connection failed with ${userName}, attempting to restart`);
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

      // Create offer if initiator
      if (isInitiator) {
        console.log(`📤 Creating offer for ${userName}`);
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        
        await pc.setLocalDescription(offer);
        
        if (socketRef.current) {
          socketRef.current.emit('offer', {
            target: socketId,
            offer: offer
          });
        }
      }

      return pc;
    } catch (error) {
      console.error(`❌ Failed to create peer connection with ${userName}:`, error);
      peerConnections.current.delete(socketId);
      throw error;
    }
  }, [rtcConfig]);

  // Initialize Socket.IO connection with improved error handling
  const initializeSocket = useCallback((stream) => {
    console.log('[SOCKET] Initializing socket connection...');
    
    const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || API_BASE.replace('/api', '');
    console.log('[SOCKET] Connecting to:', SOCKET_URL);
    
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      timeout: 10000,
      forceNew: true
    });
    
    socketRef.current = socket;
    
    socket.on('connect', () => {
      console.log('[SOCKET] Connected with ID:', socket.id);
      setIsConnected(true);
      setConnectionError('');
      
      const joinData = {
        room_id: roomId.toUpperCase(),
        user_id: user.id,
        user_name: user.name
      };
      
      console.log('[SOCKET] Joining room with data:', joinData);
      socket.emit('join-room', joinData);
    });
    
    socket.on('connect_error', (error) => {
      console.error('[SOCKET] Connection error:', error);
      setConnectionError('Failed to connect to meeting server');
      setIsConnected(false);
    });
    
    socket.on('disconnect', (reason) => {
      console.log('[SOCKET] Disconnected:', reason);
      setIsConnected(false);
      
      peerConnections.current.forEach(pc => pc.close());
      peerConnections.current.clear();
      setRemoteStreams(new Map());
      setParticipants([]);
    
      if (reason === 'io server disconnect') {
        setTimeout(() => socket.connect(), 2000);
      }
    });
    
    socket.on('existing-users', async (users) => {
      console.log('[SOCKET] Received existing users:', users);
      setParticipants(users);
      
      for (const userInfo of users) {
        console.log('[SOCKET] Creating peer connection for existing user:', userInfo.user_name);
        try {
          await createPeerConnection(userInfo.socket_id, userInfo.user_name, true, stream);
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error('[SOCKET] Failed to create peer connection:', error);
        }
      }
    });
    
    socket.on('user-joined', async (data) => {
      console.log('[SOCKET] New user joined:', data);
      setParticipants(prev => [...prev, data]);
      
      try {
        await createPeerConnection(data.socket_id, data.user_name, false, stream);
      } catch (error) {
        console.error('[SOCKET] Failed to create peer connection for new user:', error);
      }
    });
    
    socket.on('user-left', (data) => {
      console.log('[SOCKET] User left:', data);
      handleUserLeft(data.socket_id);
    });
    
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    
    socket.on('transcript-update', (data) => {
      if (transcriptionEnabled && !data.is_muted) {
        const transcriptEntry = {
          id: Date.now(),
          speaker: data.speaker_name,
          text: data.text,
          timestamp: new Date().toLocaleTimeString(),
          confidence: data.confidence || 1.0
        };
        setTranscript(prev => [...prev, transcriptEntry]);
      }
    });
    
    socket.on('participant-mute-status', (data) => {
      console.log('[SOCKET] Participant mute status changed:', data);
      setParticipantMuteStatus(prev => {
        const newMap = new Map(prev);
        newMap.set(data.socket_id, data.is_muted);
        return newMap;
      });
    });
    
    socket.on('transcription-status-changed', (data) => {
      console.log('[SOCKET] Transcription status changed:', data);
      setTranscriptionEnabled(data.enabled);
    });
    
    socket.on('meeting-ended', (data) => {
      console.log('[SOCKET] Meeting ended by host:', data);
      setShowMeetingEndedModal(true);
      setMeetingEndedBy(data.host_name);
      setFinalMeetingData(data.meeting_data);
    });
    
    socket.on('error', (error) => {
      console.error('[SOCKET] Socket error:', error);
      setConnectionError(error.message || 'Socket connection error');
    });
    
  }, [roomId, user, transcriptionEnabled, createPeerConnection, handleOffer, handleAnswer, handleIceCandidate, handleUserLeft, API_BASE]);

  // Initialize speech recognition with proper error handling
  const initializeTranscription = useCallback(() => {
    if (!transcriptionEnabled || !isAudioEnabled) {
      console.log('🎤 Transcription disabled or audio muted');
      return;
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.warn('🎤 Speech recognition not supported');
      return;
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = meetingInfo?.language || 'en-US';

      recognition.onstart = () => {
        console.log('🎤 Transcription started');
        setIsTranscribing(true);
      };

      recognition.onresult = (event) => {
        if (!isAudioEnabled) return;
        
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
            speaker: user.name || 'You',
            text: finalTranscript.trim(),
            timestamp: new Date().toLocaleTimeString(),
            confidence: event.results[event.results.length - 1][0].confidence || 1.0,
            is_muted: !isAudioEnabled
          };

          setTranscript(prev => [...prev, transcriptEntry]);
          
          if (isAudioEnabled) {
            saveTranscriptSegment(transcriptEntry);
            
            if (socketRef.current) {
              socketRef.current.emit('transcript-update', {
                room_id: roomId.toUpperCase(),
                transcript: transcriptEntry
              });
            }
          }
        }
      };

      recognition.onerror = (event) => {
        console.error('🎤 Transcription error:', event.error);
        if (event.error === 'not-allowed') {
          setConnectionError('Microphone permission denied');
        }
      };

      recognition.onend = () => {
        console.log('🎤 Transcription ended');
        setIsTranscribing(false);
        
        if (transcriptionEnabled && isAudioEnabled) {
          setTimeout(() => {
            try {
              recognition.start();
            } catch (e) {
              console.warn('🎤 Could not restart transcription:', e);
            }
          }, 1000);
        }
      };

      setRecognition(recognition);
      recognition.start();
    } catch (error) {
      console.error('🎤 Failed to initialize transcription:', error);
    }
  }, [user, meetingInfo, transcriptionEnabled, isAudioEnabled, roomId]);

  // Save transcript segment
  const saveTranscriptSegment = useCallback(async (transcriptEntry) => {
    try {
      await makeAuthenticatedRequest(`/webrtc/room/${roomId}/transcript`, {
        method: 'POST',
        body: JSON.stringify({
          speaker_name: transcriptEntry.speaker,
          text: transcriptEntry.text,
          confidence: transcriptEntry.confidence
        })
      });
    } catch (error) {
      console.error('Failed to save transcript segment:', error);
    }
  }, [makeAuthenticatedRequest, roomId]);

  // Handle transcription when user toggles mute
  const handleTranscriptionOnMuteToggle = useCallback((isUnmuted) => {
    if (!recognition) return;

    if (isUnmuted && transcriptionEnabled && !isTranscribing) {
      try {
        recognition.start();
      } catch (e) {
        console.warn('Could not start transcription:', e);
      }
    } else if (!isUnmuted && isTranscribing) {
      recognition.stop();
    }
  }, [recognition, transcriptionEnabled, isTranscribing]);

  // Fixed media controls with proper track handling
  const toggleVideo = useCallback(async () => {
    console.log('Toggling video, current state:', isVideoEnabled);
    
    if (!localStream) {
      console.warn('No local stream available');
      return;
    }

    const videoTrack = localStream.getVideoTracks()[0];
    
    if (videoTrack) {
      videoTrack.enabled = !isVideoEnabled;
      console.log('Video track enabled:', videoTrack.enabled);
      
      peerConnections.current.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender && sender.track) {
          sender.track.enabled = videoTrack.enabled;
        }
      });
    } else {
      console.warn('No video track found');
    }
    
    setIsVideoEnabled(!isVideoEnabled);
  }, [isVideoEnabled, localStream]);

  const toggleAudio = useCallback(async () => {
    console.log('Toggling audio, current state:', isAudioEnabled);
    
    const newAudioState = !isAudioEnabled;
    
    if (!localStream) {
      console.warn('No local stream available');
      setIsAudioEnabled(newAudioState);
      return;
    }

    const audioTrack = localStream.getAudioTracks()[0];
    
    if (audioTrack) {
      audioTrack.enabled = newAudioState;
      console.log('Audio track enabled:', audioTrack.enabled);
      
      peerConnections.current.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
        if (sender && sender.track) {
          sender.track.enabled = audioTrack.enabled;
        }
      });
      
      handleTranscriptionOnMuteToggle(audioTrack.enabled);
      
      if (socketRef.current) {
        socketRef.current.emit('participant-mute-status', {
          room_id: roomId.toUpperCase(),
          socket_id: 'local',
          is_muted: !audioTrack.enabled,
          user_name: user.name
        });
      }
    } else {
      console.warn('No audio track found');
    }
    
    setIsAudioEnabled(newAudioState);
  }, [isAudioEnabled, localStream, handleTranscriptionOnMuteToggle, roomId, user.name]);

  // Host-only transcription toggle
  const toggleTranscriptionForAll = useCallback(async () => {
    if (!isHost) return;
    
    const newEnabled = !transcriptionEnabled;
    
    try {
      await makeAuthenticatedRequest(`/webrtc/room/${roomId}/transcription`, {
        method: 'POST',
        body: JSON.stringify({ enabled: newEnabled })
      });
      
      if (socketRef.current) {
        socketRef.current.emit('transcription-toggled', {
          room_id: roomId.toUpperCase(),
          enabled: newEnabled,
          host_name: user.name
        });
      }
      
      setTranscriptionEnabled(newEnabled);
    } catch (error) {
      console.error('Failed to toggle transcription:', error);
    }
  }, [isHost, transcriptionEnabled, makeAuthenticatedRequest, roomId, user.name]);

  const toggleTranscription = useCallback(() => {
    if (isHost) {
      toggleTranscriptionForAll();
    } else {
      console.log('Only host can control transcription');
    }
  }, [isHost, toggleTranscriptionForAll]);

  const copyRoomId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy room ID:', error);
    }
  }, [roomId]);

  const togglePin = useCallback((socketId) => {
    setPinnedParticipant(pinnedParticipant === socketId ? null : socketId);
  }, [pinnedParticipant]);

  // Leave meeting function
  const leaveMeeting = useCallback(async () => {
    try {
      if (socketRef.current) {
        socketRef.current.emit('leave-room', {
          room_id: roomId.toUpperCase()
        });
        socketRef.current.disconnect();
      }
      
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      
      peerConnections.current.forEach(pc => pc.close());
      peerConnections.current.clear();
      
      if (recognition) {
        recognition.stop();
      }
      
      await makeAuthenticatedRequest(`/webrtc/room/${roomId}/leave`, {
        method: 'POST'
      });
      
      onLeave();
    } catch (error) {
      console.error('Error leaving meeting:', error);
      onLeave();
    }
  }, [roomId, localStream, recognition, makeAuthenticatedRequest, onLeave]);

  // Main initialization effect
  useEffect(() => {
    if (!roomId || !user || initializingRef.current) return;
    
    console.log('[MEETING] Initializing WebRTC meeting...');
    console.log('[MEETING] Room ID:', roomId.toUpperCase());
    console.log('[MEETING] User:', user);
    
    initializingRef.current = true;
    
    const initialize = async () => {
      try {
        console.log('[MEETING] Step 1: Initializing media...');
        const stream = await initializeMedia(isVideoEnabled, isAudioEnabled);
        
        if (stream) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          console.log('[MEETING] Step 2: Initializing socket...');
          initializeSocket(stream);
          
          if (transcriptionEnabled) {
            console.log('[MEETING] Step 3: Initializing transcription...');
            setTimeout(() => {
              initializeTranscription();
            }, 2000);
          }
        }
      } catch (error) {
        console.error('[MEETING] Initialization failed:', error);
        setConnectionError('Failed to initialize meeting: ' + error.message);
      } finally {
        initializingRef.current = false;
      }
    };
    
    initialize();
    
    return () => {
      console.log('[MEETING] Cleaning up...');
      
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      
      if (localStream) {
        localStream.getTracks().forEach(track => {
          track.stop();
          console.log(`🔇 Stopped ${track.kind} track`);
        });
      }
      
      peerConnections.current.forEach((pc, socketId) => {
        console.log(`🔌 Closing peer connection with ${socketId}`);
        pc.close();
      });
      peerConnections.current.clear();
      
      if (recognition) {
        recognition.stop();
      }
      
      setRemoteStreams(new Map());
      setParticipants([]);
      setIsConnected(false);
      initializingRef.current = false;
    };
  }, []); // Empty dependency array

  // End meeting function (host only)
  const endMeeting = useCallback(async () => {
    if (!isHost) return;
    
    try {
      const fullTranscript = transcript.map(entry => 
        `${entry.speaker} (${entry.timestamp}): ${entry.text}`
      ).join('\n\n');
      
      await makeAuthenticatedRequest(`/webrtc/room/${roomId}/end`, {
        method: 'POST',
        body: JSON.stringify({ transcript: fullTranscript })
      });
      
      if (socketRef.current) {
        socketRef.current.emit('meeting-ended', {
          room_id: roomId.toUpperCase(),
          host_name: user.name,
          meeting_data: { transcript: fullTranscript }
        });
      }
      
      onLeave();
    } catch (error) {
      console.error('Error ending meeting:', error);
      onLeave();
    }
  }, [isHost, transcript, makeAuthenticatedRequest, roomId, user.name, onLeave]);

  // UI Render
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Meeting Header */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-semibold">
            {meetingInfo?.title || `Room ${roomId}`}
          </h1>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="text-sm text-gray-300">
              {isConnected ? 'Connected' : 'Connecting...'}
            </span>
          </div>
          {isHost && (
            <span className="px-2 py-1 bg-blue-600 text-xs rounded-full">Host</span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={copyRoomId}
            className="flex items-center space-x-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span className="text-sm">{copied ? 'Copied!' : roomId}</span>
          </button>
          
          <button
            onClick={() => setShowParticipants(!showParticipants)}
            className="flex items-center space-x-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            <Users className="w-4 h-4" />
            <span>{participants.length + 1}</span>
          </button>
        </div>
      </div>

      {/* Main Meeting Area */}
      <div className="flex flex-1 h-[calc(100vh-80px)]">
        {/* Video Grid */}
        <div className="flex-1 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full">
            {/* Local Video */}
            <div className="relative bg-gray-800 rounded-lg overflow-hidden">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-sm">
                You {!isAudioEnabled && '(muted)'}
              </div>
              {!isVideoEnabled && (
                <div className="absolute inset-0 bg-gray-700 flex items-center justify-center">
                  <VideoOff className="w-8 h-8 text-gray-400" />
                </div>
              )}
            </div>

            {/* Remote Videos */}
            {Array.from(remoteStreams.entries()).map(([socketId, streamData]) => (
              <div key={socketId} className="relative bg-gray-800 rounded-lg overflow-hidden">
                <video
                  ref={el => {
                    if (el) {
                      remoteVideosRef.current.set(socketId, el);
                      if (streamData.stream) {
                        el.srcObject = streamData.stream;
                      }
                    }
                  }}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-sm">
                  {streamData.userName} {participantMuteStatus.get(socketId) && '(muted)'}
                </div>
                <button
                  onClick={() => togglePin(socketId)}
                  className="absolute top-2 right-2 p-1 bg-black bg-opacity-50 rounded hover:bg-opacity-75 transition-opacity"
                >
                  {pinnedParticipant === socketId ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        {showParticipants && (
          <div className="w-80 bg-gray-800 border-l border-gray-700 p-4">
            <h3 className="text-lg font-semibold mb-4">Participants ({participants.length + 1})</h3>
            <div className="space-y-2">
              <div className="flex items-center space-x-3 p-2 rounded-lg">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium">{user.name?.[0]}</span>
                </div>
                <span className="flex-1">{user.name} (You)</span>
                {!isAudioEnabled && <MicOff className="w-4 h-4 text-red-400" />}
                {isHost && <span className="text-xs bg-blue-600 px-2 py-1 rounded">Host</span>}
              </div>
              
              {participants.map((participant) => (
                <div key={participant.socket_id} className="flex items-center space-x-3 p-2 rounded-lg">
                  <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium">{participant.user_name?.[0]}</span>
                  </div>
                  <span className="flex-1">{participant.user_name}</span>
                  {participantMuteStatus.get(participant.socket_id) && (
                    <MicOff className="w-4 h-4 text-red-400" />
                  )}
                </div>
              ))}
            </div>

            {/* Transcription */}
            {transcriptionEnabled && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">Live Transcript</h4>
                  {isHost && (
                    <button
                      onClick={toggleTranscription}
                      className={`px-2 py-1 rounded text-xs ${
                        transcriptionEnabled
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-gray-600 hover:bg-gray-700'
                      }`}
                    >
                      {transcriptionEnabled ? 'On' : 'Off'}
                    </button>
                  )}
                </div>
                <div className="bg-gray-700 rounded-lg p-3 h-32 overflow-y-auto text-sm">
                  {transcript.length > 0 ? (
                    transcript.slice(-5).map((entry) => (
                      <div key={entry.id} className="mb-2">
                        <span className="font-medium text-blue-400">{entry.speaker}:</span>{' '}
                        <span className="text-gray-300">{entry.text}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-400 text-center py-4">
                      Transcript will appear here...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-4 bg-gray-800 rounded-full px-6 py-3 shadow-lg">
        <button
          onClick={toggleAudio}
          className={`p-3 rounded-full transition-colors ${
            isAudioEnabled
              ? 'bg-gray-700 hover:bg-gray-600 text-white'
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
        >
          {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>

        <button
          onClick={toggleVideo}
          className={`p-3 rounded-full transition-colors ${
            isVideoEnabled
              ? 'bg-gray-700 hover:bg-gray-600 text-white'
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
        >
          {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

        <button
          onClick={leaveMeeting}
          className="p-3 bg-red-600 hover:bg-red-700 rounded-full text-white transition-colors"
        >
          <Phone className="w-5 h-5" />
        </button>

        {isHost && (
          <button
            onClick={endMeeting}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-full text-white text-sm transition-colors"
          >
            End Meeting
          </button>
        )}
      </div>

      {/* Error Message */}
      {connectionError && (
        <div className="fixed top-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg">
          {connectionError}
        </div>
      )}

      {/* Meeting Ended Modal */}
      {showMeetingEndedModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Meeting Ended</h2>
            <p className="text-gray-300 mb-6">
              The meeting has been ended by {meetingEndedBy}.
            </p>
            <button
              onClick={onLeave}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebRTCMeeting;
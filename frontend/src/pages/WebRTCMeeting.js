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
  const [participantMuteStatus, setParticipantMuteStatus] = useState(new Map()); // Track mute status
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
  }, []);

  // Update peer connections with new stream
  const updatePeerConnectionsWithNewStream = (stream) => {
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
  };

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
      forceNew: true // Force new connection to avoid state issues
    });
    
    socketRef.current = socket;
    
    socket.on('connect', () => {
      console.log('[SOCKET] Connected with ID:', socket.id);
      setIsConnected(true);
      setConnectionError('');
      
      // Join the room with consistent room ID formatting
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
      
      // Clear all peer connections on disconnect
      peerConnections.current.forEach(pc => pc.close());
      peerConnections.current.clear();
      setRemoteStreams(new Map());
      setParticipants([]);
    
      if (reason === 'io server disconnect') {
        // Reconnect if server disconnected
        setTimeout(() => socket.connect(), 2000);
      }
    });
    
    // Handle existing users in the room
    socket.on('existing-users', async (users) => {
      console.log('[SOCKET] Received existing users:', users);
      setParticipants(users);
      
      // Create peer connections for existing users with delay to ensure media is ready
      for (const user of users) {
        console.log('[SOCKET] Creating peer connection for existing user:', user.user_name);
        try {
          await createPeerConnection(user.socket_id, user.user_name, true, stream);
          // Small delay between connections
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error('[SOCKET] Failed to create peer connection:', error);
        }
      }
    });
    
    // Handle new user joining
    socket.on('user-joined', async (data) => {
      console.log('[SOCKET] New user joined:', data);
      setParticipants(prev => [...prev, data]);
      
      // Create peer connection for new user (we are NOT the initiator in this case)
      try {
        await createPeerConnection(data.socket_id, data.user_name, false, stream);
      } catch (error) {
        console.error('[SOCKET] Failed to create peer connection for new user:', error);
      }
    });
    
    // Handle user leaving
    socket.on('user-left', (data) => {
      console.log('[SOCKET] User left:', data);
      handleUserLeft(data.socket_id);
    });
    
    // WebRTC signaling handlers
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    
    // Other socket events...
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
    
  }, [roomId, user, transcriptionEnabled, createPeerConnection, handleOffer, handleAnswer, handleIceCandidate, handleUserLeft]);

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
          // You might want to implement ICE restart here
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

  // Handle received offer with proper state checking
  const handleOffer = async (data) => {
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
  };

  // Handle received answer with proper state checking
  const handleAnswer = async (data) => {
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

    // Remove mute status
    setParticipantMuteStatus(prev => {
      const newMap = new Map(prev);
      newMap.delete(socketId);
      return newMap;
    });

    // Clean up video reference
    remoteVideosRef.current.delete(socketId);
  };

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
        if (!isAudioEnabled) return; // Privacy check
        
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
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
          
          // Save to database and broadcast only if not muted
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
        
        // Restart if still enabled and not muted
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

  // Fixed media controls with transcription privacy handling
  const toggleVideo = async () => {
    console.log('Toggling video, current state:', isVideoEnabled);
    
    if (!localStream) {
      console.log('No local stream, initializing...');
      const newStream = await initializeMedia(!isVideoEnabled, isAudioEnabled);
      if (newStream) {
        setIsVideoEnabled(!isVideoEnabled);
      }
      return;
    }

    const videoTrack = localStream.getVideoTracks()[0];
    
    if (videoTrack) {
      // Simply toggle the existing track
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
      console.log('Video track enabled:', videoTrack.enabled);
    } else if (!isVideoEnabled) {
      // No video track but user wants to enable video - need new stream
      console.log('No video track found, getting new stream with video...');
      try {
        const newVideoStream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: false 
        });
        
        const newVideoTrack = newVideoStream.getVideoTracks()[0];
        if (newVideoTrack) {
          // Add video track to existing stream
          localStream.addTrack(newVideoTrack);
          
          // Update video element
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStream;
          }
          
          // Update all peer connections
          updatePeerConnectionsWithNewStream(localStream);
          
          setIsVideoEnabled(true);
        }
      } catch (error) {
        console.error('Error adding video track:', error);
        setConnectionError('Failed to enable camera');
      }
    }
  };

  const toggleAudio = async () => {
    console.log('Toggling audio, current state:', isAudioEnabled);
    
    const newAudioState = !isAudioEnabled;
    
    if (!localStream) {
      console.log('No local stream, initializing...');
      const newStream = await initializeMedia(isVideoEnabled, newAudioState);
      if (newStream) {
        setIsAudioEnabled(newAudioState);
        
        // Handle transcription based on new audio state
        handleTranscriptionOnMuteToggle(newAudioState);
      }
      return;
    }

    const audioTrack = localStream.getAudioTracks()[0];
    
    if (audioTrack) {
      // Toggle the existing track
      audioTrack.enabled = newAudioState;
      setIsAudioEnabled(newAudioState);
      console.log('Audio track enabled:', newAudioState);
      
      // Handle transcription based on mute status
      handleTranscriptionOnMuteToggle(newAudioState);
      
      // Notify other participants about mute status change
      if (socketRef.current) {
        socketRef.current.emit('participant-mute-status', {
          room_id: roomId,
          socket_id: 'local', // Special identifier for local user
          is_muted: !newAudioState,
          user_name: user?.name || 'You'
        });
      }
      
    } else if (newAudioState) {
      // No audio track but user wants to enable audio - need new stream
      console.log('No audio track found, getting new stream with audio...');
      try {
        const newAudioStream = await navigator.mediaDevices.getUserMedia({ 
          video: false, 
          audio: true 
        });
        
        const newAudioTrack = newAudioStream.getAudioTracks()[0];
        if (newAudioTrack) {
          // Add audio track to existing stream
          localStream.addTrack(newAudioTrack);
          
          // Update all peer connections
          updatePeerConnectionsWithNewStream(localStream);
          
          setIsAudioEnabled(true);
          
          // Handle transcription
          handleTranscriptionOnMuteToggle(true);
        }
      } catch (error) {
        console.error('Error adding audio track:', error);
        setConnectionError('Failed to enable microphone');
      }
    }
  };

  // Handle transcription when user toggles mute
  const handleTranscriptionOnMuteToggle = (isUnmuted) => {
    if (!recognition) return;

    if (isUnmuted && transcriptionEnabled && !isTranscribing) {
      // User unmuted and transcription is enabled - start transcribing
      console.log('🎙️ User unmuted, starting transcription');
      try {
        recognition.start();
        setIsTranscribing(true);
      } catch (error) {
        console.error('Error starting transcription on unmute:', error);
      }
    } else if (!isUnmuted && isTranscribing) {
      // User muted - stop transcribing for privacy
      console.log('🔇 User muted, stopping transcription for privacy');
      recognition.stop();
      setIsTranscribing(false);
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
        
        // Update local transcription - but only if user is unmuted
        if (newEnabled && !isTranscribing && recognition && isAudioEnabled) {
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
    initializeMedia(isVideoEnabled, isAudioEnabled);
    
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
  }, []); // Remove dependencies to avoid re-initialization

  // Main initialization effect with proper sequencing
  useEffect(() => {
    if (!roomId || !user || initializingRef.current) return;
    
    console.log('[MEETING] Initializing WebRTC meeting...');
    console.log('[MEETING] Room ID:', roomId.toUpperCase());
    console.log('[MEETING] User:', user);
    
    initializingRef.current = true;
    
    const initialize = async () => {
      try {
        // Step 1: Initialize media first
        console.log('[MEETING] Step 1: Initializing media...');
        const stream = await initializeMedia(isVideoEnabled, isAudioEnabled);
        
        if (stream) {
          // Step 2: Wait a bit for media to be fully ready
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Step 3: Initialize socket with media stream
          console.log('[MEETING] Step 2: Initializing socket...');
          initializeSocket(stream);
          
          // Step 4: Initialize transcription if enabled
          if (transcriptionEnabled) {
            console.log('[MEETING] Step 3: Initializing transcription...');
            // Wait for socket to connect before starting transcription
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
    
    // Cleanup on unmount
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
  }, []); // Empty dependency array to prevent re-initialization
};

export default WebRTCMeeting;
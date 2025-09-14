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
    
    if (initializingRef.current) {
      console.log('Media initialization already in progress');
      return localStream;
    }
    
    initializingRef.current = true;
    
    try {
      // Always request both audio and video initially to avoid permission issues
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      // Apply the desired states after getting permission
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      
      if (videoTrack) {
        videoTrack.enabled = videoEnabled;
      }
      
      if (audioTrack) {
        audioTrack.enabled = audioEnabled;
      }

      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      console.log('✅ Media initialized successfully');
      
      // Initialize socket after media is ready
      if (!socketRef.current) {
        initializeSocket(stream);
      } else {
        // Update existing peer connections with new stream
        updatePeerConnectionsWithNewStream(stream);
      }
      
      return stream;
      
    } catch (error) {
      console.error('❌ Error initializing media:', error);
      setConnectionError('Failed to access camera/microphone');
      return null;
    } finally {
      initializingRef.current = false;
    }
  }, [localStream]);

  // Update peer connections with new stream
  const updatePeerConnectionsWithNewStream = (stream) => {
    peerConnections.current.forEach((pc, socketId) => {
      console.log(`Updating stream for peer: ${socketId}`);
      
      // Remove old tracks
      pc.getSenders().forEach(sender => {
        pc.removeTrack(sender);
      });
      
      // Add new tracks
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
    });
  };

  // Initialize Socket.IO connection
  const initializeSocket = useCallback((stream) => {
    try {
      // Use the API_BASE but replace /api with nothing for socket connection
      const socketUrl = API_BASE.replace('/api', '');
      
      console.log('Connecting to socket at:', socketUrl);
      
      const socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        upgrade: true,
        rememberUpgrade: true,
        timeout: 20000,
        forceNew: true
      });

      socket.on('connect', () => {
        console.log('Connected to signaling server');
        setIsConnected(true);
        setConnectionError('');
        
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
      
      // Handle transcript updates
      socket.on('transcript-update', (data) => {
        setTranscript(prev => [...prev, data]);
      });

      // Handle mute status updates
      socket.on('participant-mute-status', (data) => {
        console.log('🔇 Participant mute status update:', data);
        setParticipantMuteStatus(prev => {
          const newMap = new Map(prev);
          newMap.set(data.socket_id, data.is_muted);
          return newMap;
        });
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
        console.log('Disconnected from signaling server');
        setIsConnected(false);
      });

      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        setConnectionError('Failed to connect to meeting server. Please check your internet connection.');
        setIsConnected(false);
      });

      // Initialize transcription after socket setup
      if (transcriptionEnabled) {
        initializeTranscription();
      }

      return socket;
    } catch (error) {
      console.error('Failed to initialize socket:', error);
      setConnectionError('Failed to initialize connection');
    }
  }, [roomId, user, transcriptionEnabled, isAudioEnabled]);

  // Create peer connection
  const createPeerConnection = useCallback(async (socketId, userName, isInitiator, stream) => {
    console.log(`🔗 Creating peer connection with ${userName} (${socketId})`);
    
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections.current.set(socketId, pc);

    // Add local stream tracks
    if (stream) {
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
    }

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

      // Monitor audio track for mute status
      const audioTrack = remoteStream.getAudioTracks()[0];
      if (audioTrack) {
        // Listen for track enabled/disabled changes
        const checkMuteStatus = () => {
          const isMuted = !audioTrack.enabled;
          setParticipantMuteStatus(prev => {
            const newMap = new Map(prev);
            if (newMap.get(socketId) !== isMuted) {
              newMap.set(socketId, isMuted);
              // Notify other participants about mute status change
              if (socketRef.current) {
                socketRef.current.emit('participant-mute-status', {
                  room_id: roomId,
                  socket_id: socketId,
                  is_muted: isMuted,
                  user_name: userName
                });
              }
            }
            return newMap;
          });
        };

        // Initial check
        checkMuteStatus();
        
        // Monitor for changes
        audioTrack.addEventListener('ended', checkMuteStatus);
        // Note: There's no direct event for enabled/disabled changes,
        // so we'll rely on periodic checks or UI updates
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
  }, [rtcConfig, roomId]);

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

    // Remove mute status
    setParticipantMuteStatus(prev => {
      const newMap = new Map(prev);
      newMap.delete(socketId);
      return newMap;
    });

    // Clean up video reference
    remoteVideosRef.current.delete(socketId);
  };

  // Initialize speech recognition with privacy check
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
      // PRIVACY CHECK: Only transcribe if user is unmuted
      if (!isAudioEnabled) {
        console.log('🔇 User is muted, skipping transcription for privacy');
        return;
      }

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
          confidence: event.results[event.results.length - 1][0].confidence || 0.9,
          is_muted: false // Explicitly mark as unmuted since we checked above
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
        // Only restart if user is still unmuted
        if (isAudioEnabled) {
          setTimeout(() => {
            try {
              recognitionInstance.start();
            } catch (error) {
              console.error('Error restarting speech recognition:', error);
              setIsTranscribing(false);
            }
          }, 1000);
        } else {
          console.log('🔇 User is muted, stopping transcription');
          setIsTranscribing(false);
        }
      }
    };

    setRecognition(recognitionInstance);

    // Only start if transcription is enabled AND user is unmuted
    if (transcriptionEnabled && isAudioEnabled) {
      try {
        recognitionInstance.start();
        setIsTranscribing(true);
      } catch (error) {
        console.error('Error starting speech recognition:', error);
      }
    }
  }, [user, meetingInfo, transcriptionEnabled, isAudioEnabled]);

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

  // Handle transcription state based on audio enabled state
  useEffect(() => {
    if (recognition && transcriptionEnabled) {
      if (isAudioEnabled && !isTranscribing) {
        // User is unmuted and transcription is enabled - start transcribing
        try {
          recognition.start();
          setIsTranscribing(true);
        } catch (error) {
          console.error('Error starting transcription:', error);
        }
      } else if (!isAudioEnabled && isTranscribing) {
        // User is muted - stop transcribing for privacy
        recognition.stop();
        setIsTranscribing(false);
      }
    }
  }, [isAudioEnabled, transcriptionEnabled, recognition, isTranscribing]);

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
          <div className="space-y-3">
            <button
              onClick={() => {
                setConnectionError('');
                initializeMedia(true, true);
              }}
              className="w-full px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
            >
              Retry Connection
            </button>
            <button
              onClick={onLeave}
              className="w-full px-6 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg"
            >
              Go Back
            </button>
          </div>
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
            {!isAudioEnabled && transcriptionEnabled && (
              <span className="text-xs bg-red-500 px-1 rounded" title="You're muted - not transcribing">
                🔇
              </span>
            )}
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
                {transcriptionEnabled && isAudioEnabled && isTranscribing && (
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" title="Being transcribed" />
                )}
              </div>
              <button
                onClick={() => togglePin('local')}
                className="absolute top-2 right-2 p-1 bg-black bg-opacity-50 hover:bg-opacity-70 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Pin className="w-3 h-3 text-white" />
              </button>
            </div>

            {/* Remote videos */}
            {Array.from(remoteStreams.entries()).map(([socketId, { stream, userName }]) => {
              const isMuted = participantMuteStatus.get(socketId) || false;
              const isBeingTranscribed = transcriptionEnabled && !isMuted;
              
              return (
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
                  <div className="absolute top-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-white text-sm flex items-center space-x-1">
                    <span>{userName}</span>
                    {isMuted && <MicOff className="w-3 h-3 text-red-400" />}
                    {isBeingTranscribed && (
                      <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" title="Being transcribed" />
                    )}
                  </div>
                  <button
                    onClick={() => togglePin(socketId)}
                    className="absolute top-2 right-2 p-1 bg-black bg-opacity-50 hover:bg-opacity-70 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Pin className="w-3 h-3 text-white" />
                  </button>
                </div>
              );
            })}
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
              title={isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
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
                {transcriptionEnabled && (
                  <div className="flex items-center space-x-2 mt-1">
                    <span className={`text-xs ${isTranscribing ? 'text-green-400' : 'text-yellow-400'}`}>
                      {isTranscribing ? '● Recording' : '⚪ Paused (muted)'}
                    </span>
                    <span className="text-xs text-gray-400">
                      (Privacy: Only unmuted participants are transcribed)
                    </span>
                  </div>
                )}
              </div>
              <div
                ref={transcriptRef}
                className="flex-1 p-3 overflow-y-auto space-y-2"
              >
                {transcript.length === 0 ? (
                  <div className="text-gray-400 text-sm text-center py-8">
                    {!transcriptionEnabled 
                      ? 'Transcription is disabled by host'
                      : !isAudioEnabled 
                        ? 'You are muted - unmute to be transcribed'
                        : 'Listening for speech...'
                    }
                  </div>
                ) : (
                  transcript.map((entry) => (
                    <div key={entry.id} className="bg-gray-700 rounded-lg p-3">
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                        <span className="flex items-center space-x-1">
                          <span>{entry.speaker_name}</span>
                          <span className="w-2 h-2 bg-green-400 rounded-full" title="Was unmuted when speaking" />
                        </span>
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
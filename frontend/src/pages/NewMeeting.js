import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Square, Play, Pause, Settings, Volume2, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NewMeeting = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');
  const [audioLevel, setAudioLevel] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [meetingId, setMeetingId] = useState(null);
  const [liveTranscript, setLiveTranscript] = useState([]);
  const [currentSpeaker, setCurrentSpeaker] = useState('Speaker A');
  const [audioStream, setAudioStream] = useState(null);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const speechRecognitionRef = useRef(null);
  const { makeAuthenticatedRequest } = useAuth();

  useEffect(() => {
    let interval;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const setupAudioContext = async (stream) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      // Start audio level monitoring
      const updateAudioLevel = () => {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
          setAudioLevel(Math.min(100, (average / 128) * 100));
          
          if (isRecording) {
            requestAnimationFrame(updateAudioLevel);
          }
        }
      };
      updateAudioLevel();
    } catch (error) {
      console.error('Error setting up audio context:', error);
    }
  };

  const setupSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = selectedLanguage;
    
    recognition.onresult = (event) => {
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
        const newEntry = {
          id: Date.now(),
          speaker: currentSpeaker,
          text: finalTranscript.trim(),
          timestamp: new Date().toLocaleTimeString(),
          confidence: event.results[event.results.length - 1][0].confidence || 0.8
        };
        
        setLiveTranscript(prev => [...prev, newEntry]);
      }
    };
    
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone access and try again.');
      }
    };
    
    recognition.onend = () => {
      if (isRecording && !isPaused) {
        recognition.start(); // Restart recognition if still recording
      }
    };
    
    speechRecognitionRef.current = recognition;
  };

  const startRecording = async () => {
    try {
      setError('');
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      setAudioStream(stream);
      streamRef.current = stream;
      
      // Setup audio context for visualization
      await setupAudioContext(stream);
      
      // Setup MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current = mediaRecorder;
      
      // Create meeting
      const response = await makeAuthenticatedRequest('/meetings', {
        method: 'POST',
        body: JSON.stringify({
          title: meetingTitle || `Meeting ${new Date().toLocaleDateString()}`,
          language: selectedLanguage,
          status: 'recording'
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to create meeting');
      }
      
      const meetingData = await response.json();
      setMeetingId(meetingData.id);
      
      // Start recording
      mediaRecorder.start(1000); // Record in 1-second chunks
      
      // Setup speech recognition
      setupSpeechRecognition();
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.start();
      }
      
      setIsRecording(true);
      setRecordingTime(0);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      setError(error.message || 'Failed to start recording. Please check your microphone permissions.');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        if (speechRecognitionRef.current) {
          speechRecognitionRef.current.start();
        }
      } else {
        mediaRecorderRef.current.pause();
        if (speechRecognitionRef.current) {
          speechRecognitionRef.current.stop();
        }
      }
      setIsPaused(!isPaused);
    }
  };

  const stopRecording = async () => {
    try {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
        
        if (speechRecognitionRef.current) {
          speechRecognitionRef.current.stop();
        }
        
        // Stop audio stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        
        // Close audio context
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
        
        setIsRecording(false);
        setIsPaused(false);
        setAudioLevel(0);
        
        // Save transcript to database
        if (meetingId && liveTranscript.length > 0) {
          const fullTranscript = liveTranscript.map(entry => 
            `[${entry.timestamp}] ${entry.speaker}: ${entry.text}`
          ).join('\n');
          
          await makeAuthenticatedRequest(`/transcription/${meetingId}`, {
            method: 'POST',
            body: JSON.stringify({
              transcript: fullTranscript,
              speakers: { [currentSpeaker]: liveTranscript.length },
              language: selectedLanguage
            })
          });
          
          // Update meeting status
          await makeAuthenticatedRequest(`/meetings/${meetingId}`, {
            method: 'PUT',
            body: JSON.stringify({
              status: 'completed'
            })
          });
        }
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      setError('Failed to save recording');
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          New Meeting
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Start recording and let AI handle the rest
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Meeting Setup */}
      {!isRecording && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Meeting Setup
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Meeting Title
              </label>
              <input
                type="text"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                placeholder="Enter meeting title..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Language
              </label>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="es-ES">Spanish</option>
                <option value="fr-FR">French</option>
                <option value="de-DE">German</option>
                <option value="it-IT">Italian</option>
                <option value="pt-BR">Portuguese</option>
                <option value="ja-JP">Japanese</option>
                <option value="ko-KR">Korean</option>
                <option value="zh-CN">Chinese (Simplified)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Recording Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8">
        <div className="text-center">
          {/* Audio Level Visualization */}
          <div className="mb-6">
            <div className="w-32 h-32 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center relative overflow-hidden">
              <div 
                className="absolute inset-0 bg-white/20 transition-all duration-150"
                style={{ 
                  transform: `scale(${1 + audioLevel / 200})`,
                  opacity: audioLevel / 100 
                }}
              />
              {isRecording ? (
                <Mic className="w-12 h-12 text-white z-10" />
              ) : (
                <MicOff className="w-12 h-12 text-white z-10" />
              )}
            </div>
          </div>

          {/* Timer */}
          {isRecording && (
            <div className="mb-6">
              <div className="flex items-center justify-center space-x-2 text-2xl font-mono text-gray-900 dark:text-white">
                <Clock className="w-6 h-6" />
                <span>{formatTime(recordingTime)}</span>
              </div>
            </div>
          )}

          {/* Control Buttons */}
          <div className="flex items-center justify-center space-x-4">
            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={!meetingTitle.trim()}
                className="flex items-center space-x-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white px-8 py-4 rounded-xl font-semibold transition-colors"
              >
                <Mic className="w-5 h-5" />
                <span>Start Recording</span>
              </button>
            ) : (
              <>
                <button
                  onClick={pauseRecording}
                  className="flex items-center space-x-2 bg-yellow-500 hover:bg-yellow-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
                >
                  {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                  <span>{isPaused ? 'Resume' : 'Pause'}</span>
                </button>
                <button
                  onClick={stopRecording}
                  className="flex items-center space-x-2 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
                >
                  <Square className="w-5 h-5" />
                  <span>Stop</span>
                </button>
              </>
            )}
          </div>

          {/* Status */}
          <div className="mt-4">
            <p className="text-gray-600 dark:text-gray-400">
              {!isRecording && 'Ready to record'}
              {isRecording && !isPaused && 'Recording...'}
              {isRecording && isPaused && 'Paused'}
            </p>
          </div>
        </div>
      </div>

      {/* Live Transcript */}
      {isRecording && liveTranscript.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Live Transcript
          </h3>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {liveTranscript.map((entry) => (
              <div key={entry.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span>{entry.speaker}</span>
                  <span>{entry.timestamp}</span>
                </div>
                <p className="text-gray-900 dark:text-white">{entry.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NewMeeting;
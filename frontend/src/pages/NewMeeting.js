import React, { useState, useEffect } from 'react';
import { Mic, Play, Pause, Square, Settings, Volume2, Users, Clock } from 'lucide-react';

const NewMeeting = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [audioLevel, setAudioLevel] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    let interval = null;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setRecordingTime(time => time + 1);
        // Simulate audio level changes
        setAudioLevel(Math.random() * 100);
      }, 1000);
    } else {
      clearInterval(interval);
      setAudioLevel(0);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = () => {
    if (!meetingTitle.trim()) {
      alert('Please enter a meeting title before starting');
      return;
    }
    setIsRecording(true);
    setIsPaused(false);
  };

  const pauseRecording = () => {
    setIsPaused(!isPaused);
  };

  const stopRecording = () => {
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* Header Section */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
          New Meeting
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Start recording your meeting and let AI handle the transcription, analysis, and insights.
        </p>
      </div>

      {/* Meeting Configuration */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-shadow duration-300 p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Meeting Setup</h2>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Meeting Title *
            </label>
            <input
              type="text"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              placeholder="Enter meeting title..."
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            />
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Primary Language
            </label>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            >
              <option value="en">🇺🇸 English</option>
              <option value="es">🇪🇸 Spanish</option>
              <option value="fr">🇫🇷 French</option>
              <option value="de">🇩🇪 German</option>
              <option value="hi">🇮🇳 Hindi</option>
              <option value="zh">🇨🇳 Chinese</option>
            </select>
          </div>
        </div>

        {showSettings && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 animate-slide-up">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Advanced Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="flex items-center space-x-3">
                  <input type="checkbox" className="rounded text-blue-600" defaultChecked />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Auto-save transcript</span>
                </label>
              </div>
              <div>
                <label className="flex items-center space-x-3">
                  <input type="checkbox" className="rounded text-blue-600" defaultChecked />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Speaker identification</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recording Interface */}
      <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-850 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg p-10">
        <div className="text-center space-y-8">
          {/* Recording Status Circle */}
          <div className="flex justify-center">
            <div className={`relative w-40 h-40 rounded-full flex items-center justify-center transition-all duration-500 ${
              isRecording 
                ? 'bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900 dark:to-red-800 border-4 border-red-500 shadow-lg shadow-red-500/25' 
                : 'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 border-4 border-gray-300 dark:border-gray-500 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-lg'
            }`}>
              {isRecording ? (
                <div className="flex items-center justify-center">
                  {isPaused ? (
                    <Play className="w-10 h-10 text-red-600 dark:text-red-400" />
                  ) : (
                    <div className="w-6 h-6 bg-red-500 rounded-full animate-pulse-slow" />
                  )}
                </div>
              ) : (
                <Mic className="w-10 h-10 text-gray-500 dark:text-gray-400" />
              )}
              
              {/* Audio level indicator */}
              {isRecording && !isPaused && (
                <div className="absolute inset-0 rounded-full border-4 border-red-400 animate-ping" />
              )}
            </div>
          </div>

          {/* Timer and Status */}
          <div className="space-y-3">
            <div className="text-6xl font-mono font-bold text-gray-900 dark:text-white tracking-wider">
              {formatTime(recordingTime)}
            </div>
            <div className="flex items-center justify-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${
                isRecording 
                  ? (isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse') 
                  : 'bg-gray-400'
              }`} />
              <p className="text-lg text-gray-600 dark:text-gray-400 font-medium">
                {isRecording 
                  ? (isPaused ? 'Recording Paused' : 'Recording in Progress') 
                  : 'Ready to Record'
                }
              </p>
            </div>
          </div>

          {/* Audio Level Indicator */}
          {isRecording && !isPaused && (
            <div className="w-full max-w-md mx-auto">
              <div className="flex items-center space-x-2 mb-2">
                <Volume2 className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-500">Audio Level</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-150"
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
            </div>
          )}

          {/* Control Buttons */}
          <div className="flex justify-center space-x-6">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="group px-8 py-4 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl font-semibold transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center space-x-3"
              >
                <Mic className="w-6 h-6 group-hover:scale-110 transition-transform" />
                <span>Start Recording</span>
              </button>
            ) : (
              <div className="flex space-x-4">
                <button
                  onClick={pauseRecording}
                  className="px-6 py-4 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-white rounded-xl font-semibold transition-all duration-200 transform hover:scale-105 shadow-lg flex items-center space-x-2"
                >
                  {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                  <span>{isPaused ? 'Resume' : 'Pause'}</span>
                </button>
                <button
                  onClick={stopRecording}
                  className="px-6 py-4 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white rounded-xl font-semibold transition-all duration-200 transform hover:scale-105 shadow-lg flex items-center space-x-2"
                >
                  <Square className="w-5 h-5" />
                  <span>Stop</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Panels */}
      {isRecording && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
          {/* Live Transcription */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-shadow duration-300 p-6">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                Live Transcription
              </h3>
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
            <div className="h-64 bg-gray-50 dark:bg-gray-700 rounded-xl p-4 overflow-y-auto border-2 border-dashed border-gray-300 dark:border-gray-600">
              <p className="text-sm text-gray-600 dark:text-gray-400 italic">
                Transcription will appear here as you speak...
              </p>
              <div className="mt-4 space-y-3">
                <div className="animate-pulse">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-blue-200 dark:bg-blue-700 rounded-full flex items-center justify-center">
                      <span className="text-xs font-medium text-blue-700 dark:text-blue-300">A</span>
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-3/4" />
                      <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-1/2" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Speaker Recognition */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-shadow duration-300 p-6">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                Speaker Recognition
              </h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-md">
                    <span className="text-white text-sm font-bold">A</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Speaker A</p>
                    <p className="text-sm text-blue-600 dark:text-blue-400">Currently Active</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-sm text-gray-500">85%</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-bold">B</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Speaker B</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Idle</p>
                  </div>
                </div>
                <span className="text-sm text-gray-400">--</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewMeeting;
import React, { useState, useEffect } from 'react';
import { Video, Users, Clock, User, ArrowLeft, Loader } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const JoinMeeting = ({ roomId, onJoin, onBack }) => {
  const [roomInfo, setRoomInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  
  const { makeAuthenticatedRequest, user } = useAuth();

  useEffect(() => {
    fetchRoomInfo();
    if (user?.name) {
      setDisplayName(user.name);
    }
  }, [roomId, user]);

  const fetchRoomInfo = async () => {
    try {
      const response = await fetch(`http://localhost:5000/api/webrtc/room/${roomId}/info`);
      if (response.ok) {
        const data = await response.json();
        setRoomInfo(data);
      } else {
        setError('Room not found');
      }
    } catch (error) {
      console.error('Error fetching room info:', error);
      setError('Unable to connect to room');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!displayName.trim()) {
      setError('Please enter your name');
      return;
    }

    setJoining(true);
    setError('');

    try {
      const response = await makeAuthenticatedRequest(`/webrtc/join/${roomId}`, {
        method: 'POST',
        body: JSON.stringify({
          display_name: displayName.trim()
        })
      });

      if (response.ok) {
        const data = await response.json();
        onJoin(data.meeting, data.is_host);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to join meeting');
      }
    } catch (error) {
      console.error('Error joining meeting:', error);
      setError('Failed to join meeting');
    } finally {
      setJoining(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'waiting': return 'text-yellow-400';
      case 'active': return 'text-green-400';
      case 'ended': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'waiting': return 'Waiting for participants';
      case 'active': return 'Meeting in progress';
      case 'ended': return 'Meeting ended';
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Loading room information...</p>
        </div>
      </div>
    );
  }

  if (error && !roomInfo) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white max-w-md">
          <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Video className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Room Not Found</h2>
          <p className="text-gray-300 mb-6">{error}</p>
          <button
            onClick={onBack}
            className="flex items-center space-x-2 px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors mx-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go Back</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        {/* Main content */}
        <div className="bg-gray-800 rounded-2xl p-8 shadow-xl">
          {/* Room info */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Video className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              {roomInfo?.title || `Room ${roomId}`}
            </h1>
            <div className="flex items-center justify-center space-x-6 text-gray-300">
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4" />
                <span>Host: {roomInfo?.host_name}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4" />
                <span>{roomInfo?.participant_count} / {roomInfo?.max_participants}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4" />
                <span className={getStatusColor(roomInfo?.status)}>
                  {getStatusText(roomInfo?.status)}
                </span>
              </div>
            </div>
          </div>

          {/* Join form */}
          {roomInfo?.status !== 'ended' ? (
            <div className="space-y-6">
              {/* Display name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Media preview */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-white font-medium">Camera</span>
                    <button
                      onClick={() => setVideoEnabled(!videoEnabled)}
                      className={`p-2 rounded-lg transition-colors ${
                        videoEnabled
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-red-600 hover:bg-red-700'
                      }`}
                    >
                      {videoEnabled ? (
                        <Video className="w-4 h-4 text-white" />
                      ) : (
                        <Video className="w-4 h-4 text-white" />
                      )}
                    </button>
                  </div>
                  <div className="aspect-video bg-gray-800 rounded-lg flex items-center justify-center">
                    {videoEnabled ? (
                      <Video className="w-8 h-8 text-gray-400" />
                    ) : (
                      <span className="text-gray-400">Camera Off</span>
                    )}
                  </div>
                </div>

                <div className="bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-white font-medium">Microphone</span>
                    <button
                      onClick={() => setAudioEnabled(!audioEnabled)}
                      className={`p-2 rounded-lg transition-colors ${
                        audioEnabled
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-red-600 hover:bg-red-700'
                      }`}
                    >
                      {audioEnabled ? (
                        <User className="w-4 h-4 text-white" />
                      ) : (
                        <User className="w-4 h-4 text-white" />
                      )}
                    </button>
                  </div>
                  <div className="aspect-video bg-gray-800 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <div className={`w-4 h-4 rounded-full mx-auto mb-2 ${
                        audioEnabled ? 'bg-green-400' : 'bg-red-400'
                      }`} />
                      <span className="text-gray-400 text-sm">
                        {audioEnabled ? 'Mic On' : 'Mic Off'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* Join button */}
              <button
                onClick={handleJoin}
                disabled={joining || !displayName.trim()}
                className="w-full py-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold rounded-lg transition-all duration-200 transform hover:scale-105 disabled:transform-none disabled:opacity-50"
              >
                {joining ? (
                  <div className="flex items-center justify-center space-x-2">
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Joining...</span>
                  </div>
                ) : (
                  `Join Meeting`
                )}
              </button>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Meeting Ended</h3>
              <p className="text-gray-400">This meeting has already ended.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JoinMeeting;
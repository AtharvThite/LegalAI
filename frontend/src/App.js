import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import NewMeeting from './pages/NewMeeting';
import NewWebRTCMeeting from './pages/NewWebRTCMeeting';
import AllMeetings from './pages/AllMeetings';
import MeetingDetails from './pages/MeetingDetails';
import JoinMeeting from './pages/JoinMeeting';
import WebRTCMeeting from './pages/WebRTCMeeting';
import Auth from './components/Auth';
import LoadingSpinner from './components/LoadingSpinner';

const AppContent = () => {
  const [activeView, setActiveView] = useState('dashboard');
  const [selectedMeetingId, setSelectedMeetingId] = useState(null);
  const [activeTab, setActiveTab] = useState('transcript');
  const [roomId, setRoomId] = useState(null);
  const [meetingData, setMeetingData] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Auth />;
  }

  const handleMeetingClick = (meetingId, tab = 'transcript') => {
    setSelectedMeetingId(meetingId);
    setActiveTab(tab);
    setActiveView('meeting-details');
  };

  const handleBackFromMeeting = () => {
    setSelectedMeetingId(null);
    setActiveView('meetings');
  };

  const handleMeetingCreated = (meetingId) => {
    // When a recorded meeting is created, navigate to it
    handleMeetingClick(meetingId, 'transcript');
  };

  const handleWebRTCMeetingCreated = (meeting, roomIdParam) => {
    // When a WebRTC meeting is created, start the meeting
    setMeetingData(meeting);
    setRoomId(roomIdParam);
    setIsHost(true);
    setActiveView('webrtc-meeting');
  };

  const handleJoinRoom = (roomIdParam) => {
    setRoomId(roomIdParam);
    setActiveView('join-meeting');
  };

  const handleJoinMeeting = (meeting, isHostParam) => {
    setMeetingData(meeting);
    setIsHost(isHostParam);
    setActiveView('webrtc-meeting');
  };

  const handleLeaveMeeting = () => {
    setRoomId(null);
    setMeetingData(null);
    setIsHost(false);
    setActiveView('dashboard');
  };

  const handleBackFromJoin = () => {
    setRoomId(null);
    setActiveView('dashboard');
  };

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard': 
        return (
          <Dashboard 
            onNavigate={setActiveView}
            onMeetingClick={handleMeetingClick}
            onJoinRoom={handleJoinRoom}
          />
        );
      case 'new-meeting': 
        return (
          <NewMeeting 
            onMeetingCreated={handleMeetingCreated}
            onNavigate={setActiveView}
          />
        );
      case 'new-webrtc-meeting':
        return (
          <NewWebRTCMeeting 
            onMeetingCreated={handleWebRTCMeetingCreated}
            onNavigate={setActiveView}
          />
        );
      case 'join-meeting':
        return (
          <JoinMeeting 
            roomId={roomId}
            onJoin={handleJoinMeeting}
            onBack={handleBackFromJoin}
          />
        );
      case 'webrtc-meeting':
        return (
          <WebRTCMeeting 
            roomId={roomId}
            onLeave={handleLeaveMeeting}
            isHost={isHost}
            meetingData={meetingData}
          />
        );
      case 'meetings': 
        return (
          <AllMeetings 
            onMeetingClick={handleMeetingClick}
          />
        );
      case 'meeting-details': 
        return (
          <MeetingDetails 
            meetingId={selectedMeetingId}
            activeTab={activeTab}
            onBack={handleBackFromMeeting}
            onTabChange={setActiveTab}
          />
        );
      default: 
        return <Dashboard onNavigate={setActiveView} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <Header />
      <div className="flex h-screen">
        {!['webrtc-meeting', 'join-meeting'].includes(activeView) && (
          <Sidebar 
            activeView={activeView} 
            setActiveView={setActiveView}
            onMeetingClick={handleMeetingClick}
          />
        )}
        <main className={`flex-1 overflow-y-auto ${
          ['webrtc-meeting', 'join-meeting'].includes(activeView) ? '' : 'pt-20'
        }`}>
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

const App = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
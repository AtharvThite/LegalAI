import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import NewMeeting from './pages/NewMeeting';
import AllMeetings from './pages/AllMeetings';
import MeetingDetails from './pages/MeetingDetails';
import Auth from './components/Auth';
import LoadingSpinner from './components/LoadingSpinner';

const AppContent = () => {
  const [activeView, setActiveView] = useState('dashboard');
  const [selectedMeetingId, setSelectedMeetingId] = useState(null);
  const [activeTab, setActiveTab] = useState('transcript');
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
    // When a meeting is created from recording, navigate to it
    handleMeetingClick(meetingId, 'transcript');
  };

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard': 
        return (
          <Dashboard 
            onNavigate={setActiveView}
            onMeetingClick={handleMeetingClick}
          />
        );
      case 'new-meeting': 
        return (
          <NewMeeting 
            onMeetingCreated={handleMeetingCreated}
            onNavigate={setActiveView}
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
        <Sidebar 
          activeView={activeView} 
          setActiveView={setActiveView}
          onMeetingClick={handleMeetingClick}
        />
        <main className="flex-1 overflow-y-auto pt-20">{renderContent()}</main>
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
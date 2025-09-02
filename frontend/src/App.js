import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import NewMeeting from './pages/NewMeeting';
import AllMeetings from './pages/AllMeetings';

const App = () => {
  const [activeView, setActiveView] = useState('dashboard');
  const renderContent = () => {
    switch (activeView) {
      case 'dashboard': return <Dashboard />;
      case 'new-meeting': return <NewMeeting />;
      case 'meetings': return <AllMeetings />;
      default: return <Dashboard />;
    }
  };

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        <Header />
        <div className="flex h-screen pt-20">
          <Sidebar activeView={activeView} setActiveView={setActiveView} />
          <main className="flex-1 overflow-y-auto">{renderContent()}</main>
        </div>
      </div>
    </ThemeProvider>
  );
};

export default App;
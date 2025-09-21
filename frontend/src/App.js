import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import NewDocument from './pages/NewDocument';
import AllDocuments from './pages/AllDocuments';
import DocumentDetails from './pages/DocumentDetails';
import Auth from './components/Auth';
import LoadingSpinner from './components/LoadingSpinner';
import LandingPage from './pages/LandingPage';

const AppContent = () => {
  // Load initial states from localStorage
  const [activeView, setActiveView] = useState(() => {
    return localStorage.getItem('activeView') || 'dashboard';
  });
  const [selectedDocumentId, setSelectedDocumentId] = useState(() => {
    return localStorage.getItem('selectedDocumentId') || null;
  });
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('activeTab') || 'content';
  });
  const [showLanding, setShowLanding] = useState(true);
  const { user, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      setShowLanding(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    localStorage.setItem('activeView', activeView);
  }, [activeView]);

  useEffect(() => {
    if (selectedDocumentId) {
      localStorage.setItem('selectedDocumentId', selectedDocumentId);
    } else {
      localStorage.removeItem('selectedDocumentId');
    }
  }, [selectedDocumentId]);

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    if (!showLanding) {
      return <Auth />;
    }
    return <LandingPage onGetStarted={() => setShowLanding(false)} />;
  }

  const handleDocumentClick = (documentId, tab = 'content') => {
    setSelectedDocumentId(documentId);
    setActiveTab(tab);
    setActiveView('document-details');
  };

  const handleBackFromDocument = () => {
    setSelectedDocumentId(null);
    setActiveView('documents');
  };

  const handleDocumentCreated = (document) => {
    // When a document is created, navigate to it
    const documentId = document.id || document._id;
    handleDocumentClick(documentId, 'content');
  };

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard': 
        return (
          <Dashboard 
            onNavigate={setActiveView}
            onDocumentClick={handleDocumentClick}
          />
        );
      case 'new-document': 
        return (
          <NewDocument 
            onDocumentCreated={handleDocumentCreated}
            onNavigate={setActiveView}
          />
        );
      case 'documents': 
        return (
          <AllDocuments 
            onDocumentClick={handleDocumentClick}
          />
        );
      case 'document-details': 
        return (
          <DocumentDetails 
            documentId={selectedDocumentId}
            activeTab={activeTab}
            onBack={handleBackFromDocument}
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
          onDocumentClick={handleDocumentClick}
        />
        <main className="flex-1 overflow-y-auto pt-20">
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
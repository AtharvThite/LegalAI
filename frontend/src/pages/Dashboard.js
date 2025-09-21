import React, { useState, useEffect } from 'react';
import { FileText, Clock, Users, Globe, TrendingUp, Calendar, Zap, Activity, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Documents = ({ onNavigate, onDocumentClick }) => {
  const [recentDocuments, setRecentDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const { makeAuthenticatedRequest } = useAuth();

  const stats = [
    { label: 'Total Documents', value: '24', icon: FileText, color: 'blue', change: '+12%' },
    { label: 'Words Processed', value: '45.2K', icon: FileText, color: 'green', change: '+18%' },
    { label: 'Summaries Generated', value: '18', icon: FileText, color: 'purple', change: '+5' },
    { label: 'Knowledge Graphs', value: '12', icon: FileText, color: 'orange', change: '+3' },
  ];

  const recentActivities = [
    { title: 'Legal contract analyzed', time: '2 hours ago', type: 'success', icon: FileText },
    { title: 'Document summary generated', time: '4 hours ago', type: 'info', icon: Zap },
    { title: 'Knowledge graph created', time: '1 day ago', type: 'success', icon: Activity },
    { title: 'Report exported', time: '2 days ago', type: 'info', icon: TrendingUp },
  ];

  const formatDate = (dateValue) => {
    if (!dateValue) return 'N/A';
    
    try {
      let date;
      
      if (typeof dateValue === 'string') {
        date = new Date(dateValue);
      } else if (dateValue.$date) {
        date = new Date(dateValue.$date);
      } else {
        date = new Date(dateValue);
      }
      
      if (isNaN(date.getTime())) {
        return 'N/A';
      }
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'N/A';
    }
  };

  useEffect(() => {
    const fetchRecentDocuments = async () => {
      try {
        const response = await makeAuthenticatedRequest('/documents?limit=5');
        const data = await response.json();
        setRecentDocuments(data.documents || []);
      } catch (error) {
        console.error('Error fetching recent documents:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentDocuments();
  }, [makeAuthenticatedRequest]);

  return (
    <div className="p-6 space-y-8 animate-fade-in">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 rounded-2xl p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">
              Welcome back! 👋
            </h2>
            <p className="text-blue-100 text-lg">
              Here's what's happening with your documents today.
            </p>
          </div>
          <div className="hidden md:block">
            <Calendar className="w-16 h-16 text-blue-200" />
          </div>
        </div>
      </div>

      {/* Quick Document Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Quick Actions
          </h3>
          <div className="space-y-3">
            <button 
              onClick={() => onNavigate('new-document')}
              className="w-full p-4 text-left bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors border-2 border-dashed border-blue-300 dark:border-blue-600"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                  <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <span className="block text-sm font-medium text-blue-900 dark:text-blue-100">Upload Document</span>
                  <span className="text-xs text-blue-700 dark:text-blue-300">Upload and analyze documents</span>
                </div>
              </div>
            </button>
            
            <button 
              onClick={() => onNavigate('documents')}
              className="w-full p-4 text-left bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 rounded-lg transition-colors border-2 border-dashed border-green-300 dark:border-green-600"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/40 rounded-lg">
                  <FileText className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <span className="block text-sm font-medium text-green-900 dark:text-green-100">View Documents</span>
                  <span className="text-xs text-green-700 dark:text-green-300">Browse all your documents</span>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1"
          >
            <div className="flex items-center justify-between">
              <div className={`p-3 rounded-xl bg-${stat.color}-100 dark:bg-${stat.color}-900`}>
                <stat.icon className={`w-6 h-6 text-${stat.color}-600 dark:text-${stat.color}-400`} />
              </div>
              <div className={`text-sm font-medium text-${stat.color}-600 dark:text-${stat.color}-400 bg-${stat.color}-50 dark:bg-${stat.color}-900/50 px-2 py-1 rounded-full`}>
                {stat.change}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {stat.value}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {stat.label}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                Recent Documents
              </h3>
              <button 
                onClick={() => onNavigate('documents')}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
              >
                View All
              </button>
            </div>
          </div>
          <div className="p-6">
            {loading ? (
              <div className="space-y-4">
                {[1,2,3].map(i => (
                  <div key={i} className="animate-pulse flex items-center space-x-4 p-4">
                    <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : recentDocuments.length > 0 ? (
              <div className="space-y-4">
                {recentDocuments.map((document) => (
                  <div 
                    key={document.id} 
                    onClick={() => onDocumentClick(document.id)}
                    className="flex items-start space-x-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-colors cursor-pointer group"
                  >
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                      <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {document.title || 'Untitled Document'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {formatDate(document.created_at)} • {document.status} • Document
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">No documents yet</p>
                <button 
                  onClick={() => onNavigate('new-document')}
                  className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                >
                  Create your first document
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Weekly Summary */}
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white">
          <h3 className="text-lg font-semibold mb-4">This Week</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-indigo-100">Documents</span>
              <span className="font-semibold">8</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-indigo-100">Total Words</span>
              <span className="font-semibold">12,345</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-indigo-100">Summaries</span>
              <span className="font-semibold">5</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-indigo-100">Knowledge Graphs</span>
              <span className="font-semibold">3</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Documents;
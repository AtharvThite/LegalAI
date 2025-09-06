import React, { useState, useEffect } from 'react';
import { FileText, Clock, Users, Globe, TrendingUp, Calendar, Zap, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Dashboard = ({ onNavigate, onMeetingClick }) => {
  const [recentMeetings, setRecentMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const { makeAuthenticatedRequest } = useAuth();

  const stats = [
    { label: 'Total Meetings', value: '24', icon: FileText, color: 'blue', change: '+12%' },
    { label: 'Hours Recorded', value: '18.5', icon: Clock, color: 'green', change: '+8%' },
    { label: 'Participants', value: '156', icon: Users, color: 'purple', change: '+23%' },
    { label: 'Languages', value: '5', icon: Globe, color: 'orange', change: '+1' },
  ];

  const recentActivities = [
    { title: 'Team Standup completed', time: '2 hours ago', type: 'success', icon: FileText },
    { title: 'Client Call transcription ready', time: '4 hours ago', type: 'info', icon: Zap },
    { title: 'Project Review summary generated', time: '1 day ago', type: 'success', icon: Activity },
    { title: 'Weekly report exported', time: '2 days ago', type: 'info', icon: TrendingUp },
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
    const fetchRecentMeetings = async () => {
      try {
        const response = await makeAuthenticatedRequest('/meetings?limit=5');
        const data = await response.json();
        setRecentMeetings(data.meetings || []);
      } catch (error) {
        console.error('Error fetching recent meetings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentMeetings();
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
              Here's what's happening with your meetings today.
            </p>
          </div>
          <div className="hidden md:block">
            <Calendar className="w-16 h-16 text-blue-200" />
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
                Recent Meetings
              </h3>
              <button 
                onClick={() => onNavigate('meetings')}
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
            ) : recentMeetings.length > 0 ? (
              <div className="space-y-4">
                {recentMeetings.map((meeting) => (
                  <div 
                    key={meeting.id} 
                    onClick={() => onMeetingClick(meeting.id)}
                    className="flex items-start space-x-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-colors cursor-pointer group"
                  >
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                      <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {meeting.title || 'Untitled Meeting'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {formatDate(meeting.created_at)} • {meeting.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">No meetings yet</p>
                <button 
                  onClick={() => onNavigate('new-meeting')}
                  className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                >
                  Create your first meeting
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Quick Actions
            </h3>
            <div className="space-y-3">
              <button 
                onClick={() => onNavigate('new-meeting')}
                className="w-full p-3 text-left bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Start New Meeting</span>
                </div>
              </button>
              <button 
                onClick={() => onNavigate('meetings')}
                className="w-full p-3 text-left bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded-lg transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm font-medium text-purple-900 dark:text-purple-100">View All Meetings</span>
                </div>
              </button>
              <button className="w-full p-3 text-left bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 rounded-lg transition-colors">
                <div className="flex items-center space-x-3">
                  <Calendar className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-medium text-green-900 dark:text-green-100">Schedule Meeting</span>
                </div>
              </button>
            </div>
          </div>

          {/* Weekly Summary */}
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white">
            <h3 className="text-lg font-semibold mb-2">This Week</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-indigo-100">Meetings</span>
                <span className="font-semibold">8</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-indigo-100">Total Time</span>
                <span className="font-semibold">6.5h</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-indigo-100">Participants</span>
                <span className="font-semibold">42</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
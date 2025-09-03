import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  FileText, 
  Brain, 
  MessageSquare, 
  Share2, 
  Download, 
  Clock, 
  Globe, 
  Users, 
  Check,
  Edit,
  Folder,
  Tag
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TranscriptViewer from '../components/TranscriptViewer';
import MeetingChatbot from '../components/MeetingChatbot';
import KnowledgeGraph from '../components/KnowledgeGraph';

const MeetingDetails = ({ meetingId, activeTab, onBack, onTabChange }) => {
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [folders, setFolders] = useState([]);
  const { makeAuthenticatedRequest } = useAuth();

  const tabs = [
    { id: 'transcript', label: 'Transcript', icon: FileText },
    { id: 'summary', label: 'Summary', icon: FileText },
    { id: 'knowledge-graph', label: 'Knowledge Graph', icon: Brain },
    { id: 'chat', label: 'AI Chat', icon: MessageSquare },
    { id: 'insights', label: 'Insights', icon: Brain }
  ];

  useEffect(() => {
    if (meetingId) {
      fetchMeetingDetails();
      fetchFolders();
    }
  }, [meetingId]);

  const fetchMeetingDetails = async () => {
    try {
      setLoading(true);
      const response = await makeAuthenticatedRequest(`/meetings/${meetingId}`);
      if (response.ok) {
        const data = await response.json();
        setMeeting(data);
        setEditForm({
          title: data.title,
          description: data.description || '',
          folder_id: data.folder_id,
          tags: data.tags || []
        });
      } else {
        setError('Failed to load meeting details');
      }
    } catch (error) {
      console.error('Error fetching meeting:', error);
      setError('Failed to load meeting details');
    } finally {
      setLoading(false);
    }
  };

  const fetchFolders = async () => {
    try {
      const response = await makeAuthenticatedRequest('/meetings/folders');
      if (response.ok) {
        const data = await response.json();
        setFolders(data);
      }
    } catch (error) {
      console.error('Error fetching folders:', error);
    }
  };

  const handleSaveEdit = async () => {
    try {
      const response = await makeAuthenticatedRequest(`/meetings/${meetingId}`, {
        method: 'PUT',
        body: JSON.stringify(editForm)
      });

      if (response.ok) {
        setMeeting(prev => ({ ...prev, ...editForm }));
        setEditing(false);
      }
    } catch (error) {
      console.error('Error updating meeting:', error);
    }
  };

  const handleShare = async () => {
    try {
      const shareUrl = `${window.location.origin}/meeting/${meetingId}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy meeting URL:', error);
    }
  };

  const formatDuration = () => {
    if (meeting?.ended_at && meeting?.created_at) {
      const duration = new Date(meeting.ended_at) - new Date(meeting.created_at);
      const minutes = Math.floor(duration / 60000);
      return `${minutes} min`;
    }
    return 'N/A';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300';
      case 'recording':
        return 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300';
      case 'processing':
        return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300';
      default:
        return 'bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300';
    }
  };

  const downloadReport = async (format) => {
    try {
      const response = await makeAuthenticatedRequest(`/report/${meetingId}/${format}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `meeting_${meetingId}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error downloading report:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Error</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={onBack}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              
              <div className="flex-1">
                {editing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                      className="text-2xl font-bold bg-transparent border-b border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                    <div className="flex items-center space-x-4">
                      <select
                        value={editForm.folder_id}
                        onChange={(e) => setEditForm(prev => ({ ...prev, folder_id: e.target.value }))}
                        className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        {folders.map(folder => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex space-x-2">
                        <button
                          onClick={handleSaveEdit}
                          className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditing(false)}
                          className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center space-x-2">
                      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {meeting?.title}
                      </h1>
                      <button
                        onClick={() => setEditing(true)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                      >
                        <Edit className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                    <div className="flex items-center space-x-4 mt-1">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(meeting?.status)}`}>
                        {meeting?.status}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(meeting?.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      {meeting?.folder_id && (
                        <div className="flex items-center space-x-1 text-sm text-gray-500 dark:text-gray-400">
                          <Folder className="w-4 h-4" />
                          <span>{folders.find(f => f.id === meeting.folder_id)?.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleShare}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                <span className="text-sm">{copied ? 'Copied!' : 'Share'}</span>
              </button>

              <div className="relative group">
                <button className="flex items-center space-x-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">
                  <Download className="w-4 h-4" />
                  <span className="text-sm">Export</span>
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                  <div className="py-2">
                    <button
                      onClick={() => downloadReport('pdf')}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      Download as PDF
                    </button>
                    <button
                      onClick={() => downloadReport('json')}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      Export as JSON
                    </button>
                    <button
                      onClick={() => downloadReport('txt')}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      Save as Text
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Meeting Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Duration</span>
              </div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                {formatDuration()}
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Language</span>
              </div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                {meeting?.language || 'en-US'}
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Participants</span>
              </div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                {meeting?.participants?.length || 0}
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Words</span>
              </div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                {meeting?.transcript ? meeting.transcript.split(' ').length : 0}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 mt-6 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'transcript' && (
          <TranscriptViewer transcript={meeting?.transcript} meetingId={meetingId} />
        )}

        {activeTab === 'summary' && (
          <SummaryView summary={meeting?.summary} meetingId={meetingId} />
        )}

        {activeTab === 'knowledge-graph' && (
          <KnowledgeGraph 
            graphData={meeting?.knowledge_graph} 
            onNodeClick={(node) => console.log('Node clicked:', node)}
          />
        )}

        {activeTab === 'chat' && (
          <MeetingChatbot meetingId={meetingId} />
        )}

        {activeTab === 'insights' && (
          <InsightsView meeting={meeting} />
        )}
      </div>
    </div>
  );
};

// Summary Component
const SummaryView = ({ summary, meetingId }) => {
  const [generating, setGenerating] = useState(false);
  const [currentSummary, setCurrentSummary] = useState(summary);
  const { makeAuthenticatedRequest } = useAuth();

  const generateSummary = async () => {
    setGenerating(true);
    try {
      const response = await makeAuthenticatedRequest(`/summary/${meetingId}`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      
      if (response.ok) {
        const data = await response.json();
        setCurrentSummary(data.summary);
      }
    } catch (error) {
      console.error('Error generating summary:', error);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            Meeting Summary
          </h3>
          {!currentSummary && (
            <button
              onClick={generateSummary}
              disabled={generating}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {generating ? 'Generating...' : 'Generate Summary'}
            </button>
          )}
        </div>
      </div>
      
      <div className="p-6">
        {currentSummary ? (
          <div className="prose dark:prose-invert max-w-none">
            <div className="whitespace-pre-wrap text-gray-700 dark:text-gray-300 leading-relaxed">
              {currentSummary}
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No Summary Available
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Generate an AI-powered summary of this meeting
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// Insights Component
const InsightsView = ({ meeting }) => {
  const insights = [
    {
      title: 'Meeting Effectiveness',
      value: '8.5/10',
      color: 'green',
      description: 'Good participation and clear decisions'
    },
    {
      title: 'Speaking Time Distribution',
      value: 'Balanced',
      color: 'blue',
      description: 'All participants had good speaking time'
    },
    {
      title: 'Action Items Identified',
      value: meeting?.knowledge_graph?.action_items?.length || 0,
      color: 'purple',
      description: 'Clear next steps defined'
    },
    {
      title: 'Key Topics Covered',
      value: meeting?.knowledge_graph?.topics?.length || 0,
      color: 'orange',
      description: 'Diverse range of topics discussed'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {insights.map((insight, index) => (
        <div key={index} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
          <div className="text-center">
            <div className={`text-3xl font-bold text-${insight.color}-600 mb-2`}>
              {insight.value}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {insight.title}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {insight.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MeetingDetails;
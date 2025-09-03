import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  Users, 
  Share2, 
  Download, 
  Edit, 
  Save, 
  X, 
  Check, 
  FolderOpen,
  FileText,
  MessageSquare,
  Brain,
  RefreshCw  
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TranscriptViewer from '../components/TranscriptViewer';
import KnowledgeGraph from '../components/KnowledgeGraph';
import MeetingChatbot from '../components/MeetingChatbot';
import MarkdownRenderer from '../components/MarkdownRenderer';

const MeetingDetails = ({ meetingId, activeTab, onBack, onTabChange }) => {
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [folders, setFolders] = useState([]);
  
  // Move dialog state
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [selectedTargetFolder, setSelectedTargetFolder] = useState('');
  const [isMoving, setIsMoving] = useState(false);
  
  const { makeAuthenticatedRequest, downloadFile } = useAuth();

  const tabs = [
    { id: 'transcript', label: 'Transcript', icon: FileText },
    { id: 'summary', label: 'Summary', icon: FileText },
    { id: 'knowledge-graph', label: 'Knowledge Graph', icon: Brain },
    { id: 'chat', label: 'AI Chat', icon: MessageSquare },
    { id: 'insights', label: 'Insights', icon: Brain }
  ];

  useEffect(() => {
    fetchMeetingDetails();
    fetchFolders();
  }, [meetingId]);

  const fetchMeetingDetails = async () => {
    try {
      setLoading(true);
      const response = await makeAuthenticatedRequest(`/meetings/${meetingId}`);
      
      if (response.ok) {
        const data = await response.json();
        setMeeting(data);
        setEditForm({
          title: data.title || '',
          description: data.description || '',
          folder_id: data.folder_id || 'recent'
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
      console.error('Failed to copy link:', error);
    }
  };

  const handleMoveClick = () => {
    setSelectedTargetFolder(meeting.folder_id || 'recent');
    setShowMoveDialog(true);
  };

  const handleMoveMeeting = async () => {
    if (!selectedTargetFolder) return;

    setIsMoving(true);
    try {
      const response = await makeAuthenticatedRequest(`/meetings/${meetingId}`, {
        method: 'PUT',
        body: JSON.stringify({ folder_id: selectedTargetFolder })
      });

      if (response.ok) {
        setMeeting(prev => ({ ...prev, folder_id: selectedTargetFolder }));
        setShowMoveDialog(false);
      }
    } catch (error) {
      console.error('Error moving meeting:', error);
    } finally {
      setIsMoving(false);
    }
  };

  const formatDuration = () => {
    if (!meeting.created_at || !meeting.ended_at) return 'N/A';
    
    const start = new Date(meeting.created_at);
    const end = new Date(meeting.ended_at);
    const diff = end - start;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300';
      case 'recording': return 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300';
      case 'processing': return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    }
  };

  const downloadReport = async (format) => {
    try {
      await downloadFile(`/report/${meetingId}/${format}`, `meeting_${meetingId}.${format}`);
    } catch (error) {
      console.error('Error downloading report:', error);
    }
  };

  const getFolderName = (folderId) => {
    const folder = folders.find(f => f.id === folderId);
    return folder ? folder.name : 'Unknown';
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading meeting details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Error Loading Meeting</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
          <button
            onClick={onBack}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Meeting Not Found</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">The requested meeting could not be found.</p>
          <button
            onClick={onBack}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Meetings</span>
          </button>

          <div className="flex items-center space-x-3">
            {/* Download Dropdown */}
            <div className="relative group">
              <button className="flex items-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors">
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
              
              <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                <div className="p-2">
                  <button
                    onClick={() => downloadReport('pdf')}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                  >
                    Download PDF
                  </button>
                  <button
                    onClick={() => downloadReport('json')}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={() => downloadReport('csv')}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                  >
                    Export CSV
                  </button>
                  <button
                    onClick={() => downloadReport('txt')}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                  >
                    Export TXT
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleShare}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              <span>{copied ? 'Copied!' : 'Share'}</span>
            </button>

            <button
              onClick={() => setEditing(!editing)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-lg transition-colors"
            >
              <Edit className="w-4 h-4" />
              <span>Edit</span>
            </button>
          </div>
        </div>

        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Title
              </label>
              <input
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows="3"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Folder
              </label>
              <select
                value={editForm.folder_id}
                onChange={(e) => setEditForm({ ...editForm, folder_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {folders.map(folder => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={handleSaveEdit}
                className="flex items-center space-x-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Save</span>
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              {meeting.title || 'Untitled Meeting'}
            </h1>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
              <div className="flex items-center space-x-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Date</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {new Date(meeting.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Clock className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Duration</p>
                  <p className="font-medium text-gray-900 dark:text-white">{formatDuration()}</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Users className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Participants</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {meeting.participants?.length || 0}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <FolderOpen className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Folder</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {getFolderName(meeting.folder_id)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(meeting.status)}`}>
                {meeting.status}
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Language: {meeting.language || 'en-US'}
              </span>
            </div>

            {meeting.description && (
              <div className="mt-4">
                <p className="text-gray-700 dark:text-gray-300">{meeting.description}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex space-x-1 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'transcript' && (
            <TranscriptViewer transcript={meeting.transcript} meetingId={meetingId} />
          )}
          
          {activeTab === 'summary' && (
            <SummaryView summary={meeting.summary} meetingId={meetingId} />
          )}
          
          {activeTab === 'knowledge-graph' && (
            <KnowledgeGraph graphData={meeting.knowledge_graph} />
          )}
          
          {activeTab === 'chat' && (
            <MeetingChatbot meetingId={meetingId} />
          )}
          
          {activeTab === 'insights' && (
            <InsightsView meeting={meeting} />
          )}
        </div>
      </div>

      {/* Move Dialog */}
      {showMoveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Move Meeting
            </h3>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Folder
              </label>
              <select
                value={selectedTargetFolder}
                onChange={(e) => setSelectedTargetFolder(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {folders.map(folder => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowMoveDialog(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMoveMeeting}
                disabled={isMoving}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isMoving ? 'Moving...' : 'Move'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Updated Summary Component with better styling
const SummaryView = ({ summary, meetingId }) => {
  const { makeAuthenticatedRequest } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSummary, setGeneratedSummary] = useState(summary);
  const [error, setError] = useState('');

  const generateSummary = async () => {
    setIsGenerating(true);
    setError('');
    
    try {
      console.log('Generating summary for meeting:', meetingId);
      
      const response = await makeAuthenticatedRequest(`/summary/${meetingId}`, {
        method: 'POST',
        body: JSON.stringify({})
      });

      if (response.ok) {
        const data = await response.json();
        setGeneratedSummary(data.summary);
        console.log('Summary generated successfully');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate summary');
      }
    } catch (error) {
      console.error('Error generating summary:', error);
      setError(error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!generatedSummary && !isGenerating && !error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
        <Brain className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No Summary Available
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Generate an AI-powered summary of this meeting's key points and decisions.
        </p>
        <button
          onClick={generateSummary}
          className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
        >
          Generate Summary
        </button>
      </div>
    );
  }

  if (isGenerating) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Generating Summary...
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          AI is analyzing the meeting transcript and creating a comprehensive summary.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
          <X className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Summary Generation Failed
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {error}
        </p>
        <button
          onClick={generateSummary}
          className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            Meeting Summary
          </h3>
          <button
            onClick={generateSummary}
            disabled={isGenerating}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>Regenerate</span>
          </button>
        </div>
      </div>
      
      {/* Summary content with chat bubble styling */}
      <div className="p-6">
        <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-6">
          <MarkdownRenderer 
            content={generatedSummary} 
            className="text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>
    </div>
  );
};

// Insights Component  
const InsightsView = ({ meeting }) => {
  const insights = [
    {
      title: 'Meeting Duration',
      value: '45 minutes',
      description: 'Efficient meeting length',
      color: 'green'
    },
    {
      title: 'Speaker Distribution',
      value: '3 active speakers',
      description: 'Good participation balance',
      color: 'blue'
    },
    {
      title: 'Action Items',
      value: `${meeting.knowledge_graph?.action_items?.length || 0} items`,
      description: 'Clear next steps defined',
      color: 'purple'
    },
    {
      title: 'Topics Covered',
      value: `${meeting.knowledge_graph?.topics?.length || 0} topics`,
      description: 'Comprehensive discussion',
      color: 'orange'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {insights.map((insight, index) => (
          <div key={index} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {insight.title}
            </h3>
            <div className={`text-2xl font-bold text-${insight.color}-600 dark:text-${insight.color}-400 mb-1`}>
              {insight.value}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {insight.description}
            </p>
          </div>
        ))}
      </div>

      {/* Action Items */}
      {meeting.knowledge_graph?.action_items && meeting.knowledge_graph.action_items.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Action Items
          </h3>
          <div className="space-y-3">
            {meeting.knowledge_graph.action_items.map((item, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-white dark:bg-gray-600 rounded-lg">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-300">
                    {index + 1}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-gray-900 dark:text-white font-medium">
                    {item.task}
                  </p>
                  {item.assignee && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Assigned to: {item.assignee}
                    </p>
                  )}
                  {item.due_date && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Due: {item.due_date}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetingDetails;
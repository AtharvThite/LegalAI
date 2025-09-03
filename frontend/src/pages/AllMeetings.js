import React, { useState, useEffect } from 'react';
import { Search, Clock, Users, Globe, MessageCircle, Download, Folder, Trash2, Edit, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const AllMeetings = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [meetings, setMeetings] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const { makeAuthenticatedRequest } = useAuth();

  const fetchMeetings = async (searchQuery = '', folderFilter = 'all', pageNum = 1) => {
    try {
      let url = `/meetings?page=${pageNum}&limit=12`;
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
      if (folderFilter !== 'all') url += `&folder_id=${folderFilter}`;

      const response = await makeAuthenticatedRequest(url);
      if (response.ok) {
        const data = await response.json();
        setMeetings(data.meetings);
        setTotalPages(data.pages);
      }
    } catch (error) {
      console.error('Error fetching meetings:', error);
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

  const deleteMeeting = async (meetingId) => {
    if (!confirm('Are you sure you want to delete this meeting?')) return;
    
    try {
      const response = await makeAuthenticatedRequest(`/meetings/${meetingId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setMeetings(prev => prev.filter(m => m.id !== meetingId));
      }
    } catch (error) {
      console.error('Error deleting meeting:', error);
    }
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

  const formatDuration = (meeting) => {
    if (meeting.ended_at && meeting.created_at) {
      const duration = new Date(meeting.ended_at) - new Date(meeting.created_at);
      const minutes = Math.floor(duration / 60000);
      return `${minutes} min`;
    }
    return 'N/A';
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchMeetings(searchTerm, selectedFolder, page),
        fetchFolders()
      ]);
      setLoading(false);
    };
    loadData();
  }, [searchTerm, selectedFolder, page]);

  const handleSearch = (value) => {
    setSearchTerm(value);
    setPage(1);
  };

  const handleFolderChange = (folderId) => {
    setSelectedFolder(folderId);
    setPage(1);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-48 bg-gray-200 dark:bg-gray-700 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            All Meetings
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Manage and explore your recorded meetings.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          {/* Folder Filter */}
          <select
            value={selectedFolder}
            onChange={(e) => handleFolderChange(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Folders</option>
            {folders.map(folder => (
              <option key={folder.id} value={folder.id}>
                {folder.name} ({folder.meeting_count || 0})
              </option>
            ))}
          </select>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search meetings..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full md:w-80"
            />
          </div>
        </div>
      </div>

      {meetings.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No meetings found
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {searchTerm ? 'Try adjusting your search terms' : 'Start by creating your first meeting'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {meetings.map((meeting) => (
              <div
                key={meeting.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                      {meeting.title}
                    </h3>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(meeting.status)}`}>
                        {meeting.status}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                      <Clock className="w-4 h-4 mr-2" />
                      {new Date(meeting.created_at).toLocaleDateString()} • {formatDuration(meeting)}
                    </div>
                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                      <Globe className="w-4 h-4 mr-2" />
                      {meeting.language || 'en-US'}
                    </div>
                    {meeting.folder_id && (
                      <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                        <Folder className="w-4 h-4 mr-2" />
                        {folders.find(f => f.id === meeting.folder_id)?.name || 'Unknown Folder'}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <button className="flex items-center space-x-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium">
                      <MessageCircle className="w-4 h-4" />
                      <span>Chat</span>
                    </button>
                    <div className="flex items-center space-x-2">
                      <button className="flex items-center space-x-1 text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-sm">
                        <Download className="w-4 h-4" />
                        <span>Export</span>
                      </button>
                      <button 
                        onClick={() => deleteMeeting(meeting.id)}
                        className="flex items-center space-x-1 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center space-x-2 mt-8">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    page === pageNum
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {pageNum}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AllMeetings;
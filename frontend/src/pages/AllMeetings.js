import React, { useState, useEffect, useMemo } from 'react'; 
import { 
  Search, 
  Filter, 
  Grid, 
  List, 
  Plus, 
  Calendar, 
  Clock, 
  Users, 
  FileText, 
  MoreVertical, 
  SortAsc, 
  SortDesc,
  FolderPlus,
  X,
  Check,
  Move,
  Trash2,
  Download,
  CheckSquare,
  Square,
  Edit,
  Eye,
  Share2,
  Archive,
  Palette
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const AllMeetings = ({ onMeetingClick }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [meetings, setMeetings] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [viewMode, setViewMode] = useState('grid');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Bulk operations
  const [selectedMeetings, setSelectedMeetings] = useState([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  
  // Folder management
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#3B82F6');
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  
  // Individual meeting actions
  const [showMeetingMenu, setShowMeetingMenu] = useState(null);
  const [showIndividualMoveDialog, setShowIndividualMoveDialog] = useState(null);
  const [showIndividualDeleteConfirm, setShowIndividualDeleteConfirm] = useState(null);
  
  const { makeAuthenticatedRequest } = useAuth();

  const colorOptions = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'
  ];

  // Fetch functions
  const fetchMeetings = async (searchQuery = '', folderFilter = 'all', pageNum = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum,
        limit: 12,
        search: searchQuery,
        sort_by: sortBy,
        sort_order: sortOrder
      });

      if (folderFilter !== 'all') {
        params.append('folder_id', folderFilter);
      }

      const response = await makeAuthenticatedRequest(`/meetings?${params}`);
      if (response.ok) {
        const data = await response.json();
        setMeetings(data.meetings || []);
        setTotalPages(data.pages || 1);
      }
    } catch (error) {
      console.error('Failed to fetch meetings:', error);
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
      console.error('Failed to fetch folders:', error);
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      const response = await makeAuthenticatedRequest('/meetings/folders', {
        method: 'POST',
        body: JSON.stringify({ 
          name: newFolderName, 
          color: newFolderColor 
        })
      });

      if (response.ok) {
        await fetchFolders();
        setShowCreateFolder(false);
        setNewFolderName('');
        setNewFolderColor('#3B82F6');
      }
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const deleteMeeting = async (meetingId) => {
    try {
      const response = await makeAuthenticatedRequest(`/meetings/${meetingId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        fetchMeetings(searchTerm, selectedFolder, page);
      }
    } catch (error) {
      console.error('Failed to delete meeting:', error);
    }
  };

  const moveMeetings = async (targetFolderId) => {
    try {
      const promises = selectedMeetings.map(meetingId =>
        makeAuthenticatedRequest(`/meetings/${meetingId}`, {
          method: 'PUT',
          body: JSON.stringify({ folder_id: targetFolderId })
        })
      );

      await Promise.all(promises);
      setSelectedMeetings([]);
      setShowMoveDialog(false);
      fetchMeetings(searchTerm, selectedFolder, page);
    } catch (error) {
      console.error('Failed to move meetings:', error);
    }
  };

  const moveIndividualMeeting = async (meetingId, targetFolderId) => {
    try {
      const response = await makeAuthenticatedRequest(`/meetings/${meetingId}`, {
        method: 'PUT',
        body: JSON.stringify({ folder_id: targetFolderId })
      });

      if (response.ok) {
        setShowIndividualMoveDialog(null);
        fetchMeetings(searchTerm, selectedFolder, page);
      }
    } catch (error) {
      console.error('Failed to move meeting:', error);
    }
  };

  const bulkDeleteMeetings = async () => {
    try {
      const promises = selectedMeetings.map(meetingId =>
        makeAuthenticatedRequest(`/meetings/${meetingId}`, {
          method: 'DELETE'
        })
      );

      await Promise.all(promises);
      setSelectedMeetings([]);
      setShowDeleteConfirm(null);
      fetchMeetings(searchTerm, selectedFolder, page);
    } catch (error) {
      console.error('Failed to delete meetings:', error);
    }
  };

  const exportMeetings = async (format = 'json') => {
    try {
      const response = await makeAuthenticatedRequest('/report/bulk-export', {
        method: 'POST',
        body: JSON.stringify({
          meeting_ids: selectedMeetings,
          format: format
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meetings_export.${format === 'json' ? 'zip' : format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Failed to export meetings:', error);
    }
  };

  const downloadIndividualReport = async (meetingId, format) => {
    try {
      const response = await makeAuthenticatedRequest(`/report/${meetingId}/${format}`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meeting_${meetingId}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Failed to download report:', error);
    }
  };

  const shareIndividualMeeting = async (meetingId) => {
    try {
      const url = `${window.location.origin}/meetings/${meetingId}`;
      await navigator.clipboard.writeText(url);
      // You could add a toast notification here
      console.log('Meeting link copied to clipboard');
    } catch (error) {
      console.error('Failed to share meeting:', error);
    }
  };

  const toggleMeetingSelection = (meetingId) => {
    setSelectedMeetings(prev => {
      const newSelection = prev.includes(meetingId)
        ? prev.filter(id => id !== meetingId)
        : [...prev, meetingId];
      
      setSelectAll(newSelection.length === meetings.length);
      return newSelection;
    });
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedMeetings([]);
      setSelectAll(false);
    } else {
      const allMeetingIds = meetings.map(meeting => meeting.id || meeting._id);
      setSelectedMeetings(allMeetingIds);
      setSelectAll(true);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200';
      case 'recording':
        return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200';
      case 'processing':
        return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';
    }
  };

  // Add the same helper functions
  const parseDateTime = (dateValue) => {
    if (!dateValue) return null;
    
    try {
      let date;
      
      // Handle different date formats from MongoDB
      if (typeof dateValue === 'string') {
        // Handle ISO strings with or without timezone
        date = new Date(dateValue);
      } else if (dateValue.$date) {
        // Handle MongoDB $date format
        if (typeof dateValue.$date === 'string') {
          date = new Date(dateValue.$date);
        } else {
          date = new Date(dateValue.$date);
        }
      } else if (typeof dateValue === 'object' && dateValue.getTime) {
        // Already a Date object
        date = dateValue;
      } else {
        date = new Date(dateValue);
      }
      
      // Validate the date
      if (isNaN(date.getTime())) {
        console.warn('Invalid date:', dateValue);
        return null;
      }
      
      return date;
    } catch (error) {
      console.error('Error parsing date:', error, dateValue);
      return null;
    }
  };

  // Update formatDuration function
  const formatDuration = (meeting) => {
    if (!meeting) return 'N/A';
    
    const createdAt = parseDateTime(meeting.created_at);
    const endedAt = parseDateTime(meeting.ended_at);
    
    if (!createdAt) {
      return 'N/A';
    }
    
    let endTime;
    if (endedAt) {
      endTime = endedAt;
    } else if (meeting.status === 'completed') {
      // Default to 1 hour if no end time but marked as completed
      endTime = new Date(createdAt.getTime() + (60 * 60 * 1000));
    } else {
      return 'Ongoing';
    }
    
    const durationMs = endTime.getTime() - createdAt.getTime();
    
    if (durationMs <= 0) {
      return 'N/A';
    }
    
    const totalMinutes = Math.floor(durationMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

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
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'N/A';
    }
  };

  // Add this useMemo to handle client-side sorting for all options
  const sortedMeetings = useMemo(() => {
    if (!meetings.length) return meetings;

    const sorted = [...meetings].sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case 'created_at':
          aValue = parseDateTime(a.created_at)?.getTime() || 0;
          bValue = parseDateTime(b.created_at)?.getTime() || 0;
          break;
        case 'title':
          aValue = (a.title || '').toLowerCase();
          bValue = (b.title || '').toLowerCase();
          break;
        case 'status':
          // Custom order: completed > processing > recording > others
          const statusOrder = { completed: 1, processing: 2, recording: 3 };
          aValue = statusOrder[a.status] || 4;
          bValue = statusOrder[b.status] || 4;
          break;
        case 'folder_color':
          const folderA = folders.find(f => f.id === a.folder_id);
          const folderB = folders.find(f => f.id === b.folder_id);
          aValue = folderA?.color || '#000000';
          bValue = folderB?.color || '#000000';
          break;
        default:
          return 0;  // No sorting if unknown
      }

      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    return sorted;
  }, [meetings, sortBy, sortOrder, folders]);  // Dependencies: re-sort when these change

  const renderMeetingCard = (meeting) => {
    const folder = folders.find(f => f.id === meeting.folder_id);
    const folderColor = folder?.color || '#3B82F6';
    const isSelected = selectedMeetings.includes(meeting.id || meeting._id);
    const meetingId = meeting.id || meeting._id;

    return (
      <div
        key={meetingId}
        className={`bg-white dark:bg-gray-800 rounded-2xl border ${
          isSelected 
            ? 'border-blue-500 dark:border-blue-400 shadow-lg' 
            : 'border-gray-200 dark:border-gray-700'
        } shadow-sm hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 cursor-pointer group relative overflow-hidden`}
        onClick={() => onMeetingClick(meetingId)}
      >
        {/* Selection checkbox */}
        <div 
          className="absolute top-4 left-4 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => toggleMeetingSelection(meetingId)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {isSelected ? (
              <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            ) : (
              <Square className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
            )}
          </button>
        </div>

        {/* Color bar at top - confined to tab area */}
        <div 
          className="h-1"
          style={{ backgroundColor: folderColor }}
        />
        
        <div className="p-6 pt-12">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 pr-4">
              <div className="flex items-center space-x-2 mb-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {meeting.title || 'Untitled Meeting'}
                </h3>
              </div>
              
              {/* Folder indicator */}
              {folder && (
                <div className="flex items-center space-x-2 mb-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: folderColor }}
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {folder.name}
                  </span>
                </div>
              )}
              
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {meeting.description || 'No description available'}
              </p>
              
              <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center space-x-1">
                  <Calendar className="w-4 h-4" />
                  <span>
                    {formatDate(meeting.created_at)}
                  </span>
                </div>
                
                <div className="flex items-center space-x-1">
                  <Clock className="w-4 h-4" />
                  <span>{formatDuration(meeting)}</span>
                </div>
                
                <div className="flex items-center space-x-1">
                  <Users className="w-4 h-4" />
                  <span>{meeting.participants?.length || 0}</span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-end space-y-2 flex-shrink-0">
              <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(meeting.status)}`}>
                {meeting.status}
              </span>
              
              {/* Three-dot menu - allow overflow */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMeetingMenu(showMeetingMenu === meetingId ? null : meetingId);
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <MoreVertical className="w-4 h-4 text-gray-400" />
                </button>

                {/* Dropdown menu - positioned to extend outside card */}
                {showMeetingMenu === meetingId && (
                  <div 
                    className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700"
                    style={{ 
                      zIndex: 9999,
                      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }}
                  >
                    <div className="py-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onMeetingClick(meetingId);
                          setShowMeetingMenu(null);
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        <span>View Details</span>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowIndividualMoveDialog(meeting);
                          setShowMeetingMenu(null);
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Move className="w-4 h-4" />
                        <span>Move to Folder</span>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          shareIndividualMeeting(meetingId);
                          setShowMeetingMenu(null);
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Share2 className="w-4 h-4" />
                        <span>Share</span>
                      </button>

                      <div className="relative group/export">
                        <button
                          className="w-full flex items-center justify-between px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            <Download className="w-4 h-4" />
                            <span>Export</span>
                          </div>
                          <span className="text-xs">›</span>
                        </button>
                        
                        {/* Export submenu */}
                        <div 
                          className="absolute left-full top-0 w-32 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover/export:opacity-100 group-hover/export:visible transition-all duration-200"
                          style={{ 
                            zIndex: 10000,
                            marginLeft: '4px'
                          }}
                        >
                          <div className="py-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadIndividualReport(meetingId, 'pdf');
                                setShowMeetingMenu(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                              PDF
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadIndividualReport(meetingId, 'json');
                                setShowMeetingMenu(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                              JSON
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadIndividualReport(meetingId, 'txt');
                                setShowMeetingMenu(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                              TXT
                            </button>
                          </div>
                        </div>
                      </div>

                      <hr className="my-2 border-gray-200 dark:border-gray-700" />

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowIndividualDeleteConfirm(meeting);
                          setShowMeetingMenu(null);
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-2 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Meeting stats */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
                <FileText className="w-3 h-3" />
                <span>{meeting.transcript ? 'Transcript' : 'No transcript'}</span>
              </div>
              
              <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
                <Users className="w-3 h-3" />
                <span>{meeting.summary ? 'Summary' : 'No summary'}</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-1">
              <div 
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: folderColor }}
              />
              <span className="text-xs text-gray-400">
                {folder?.name || 'No folder'}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Effect hooks
  useEffect(() => {
    fetchMeetings(searchTerm, selectedFolder, page);
  }, [searchTerm, selectedFolder, page, sortBy, sortOrder]);

  useEffect(() => {
    fetchFolders();
  }, []);

  useEffect(() => {
    setShowBulkActions(selectedMeetings.length > 0);
  }, [selectedMeetings]);

  useEffect(() => {
    // Close meeting menu when clicking outside
    const handleClickOutside = (event) => {
      if (showMeetingMenu && !event.target.closest('[data-menu-container]')) {
        setShowMeetingMenu(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showMeetingMenu]);

  const handleSearch = (value) => {
    setSearchTerm(value);
    setPage(1);
  };

  const handleFolderChange = (folderId) => {
    setSelectedFolder(folderId);
    setPage(1);
    setSelectedMeetings([]);
    setSelectAll(false);
  };

  const handleSortChange = (newSortBy) => {
    setSortBy(newSortBy);
    setPage(1);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-64 bg-gray-200 dark:bg-gray-700 rounded-2xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            All Meetings
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Manage and explore your recorded meetings.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Select All button - fixed dark theme visibility */}
          <button
            onClick={toggleSelectAll}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            {selectAll ? (
              <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            ) : (
              <Square className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            )}
            <span className="text-sm text-gray-700 dark:text-gray-300">Select All</span>
          </button>

          {/* View Mode Toggle - fixed dark theme visibility */}
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${
                viewMode === 'grid' 
                  ? 'bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${
                viewMode === 'list' 
                  ? 'bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setShowCreateFolder(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Folder</span>
          </button>
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search meetings..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

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

        {/* Sort Controls */}
        <div className="flex space-x-2">
          <select
            value={sortBy}
            onChange={(e) => handleSortChange(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="created_at">Date Created</option>
            <option value="title">Title</option>
            <option value="status">Status</option>
            <option value="folder_color">Folder Color</option>
          </select>
          
          {/* Sort order button - fixed dark theme visibility */}
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            {sortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {showBulkActions && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <span className="text-blue-700 dark:text-blue-300">
              {selectedMeetings.length} meeting(s) selected
            </span>
            <div className="flex space-x-2">
              <button
                onClick={() => setShowMoveDialog(true)}
                className="flex items-center space-x-2 px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm transition-colors"
              >
                <Move className="w-4 h-4" />
                <span>Move</span>
              </button>
              
              <button
                onClick={() => exportMeetings('json')}
                className="flex items-center space-x-2 px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-sm transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
              
              <button
                onClick={() => setShowDeleteConfirm('bulk')}
                className="flex items-center space-x-2 px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-sm transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
              
              <button
                onClick={() => {
                  setSelectedMeetings([]);
                  setSelectAll(false);
                }}
                className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded text-sm transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meetings Display */}
      {sortedMeetings.length === 0 ? (
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
          {viewMode === 'grid' ? (
            <div 
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              style={{ overflow: 'visible' }}
            >
              {sortedMeetings.map(renderMeetingCard)}
            </div>
          ) : (
            <div className="space-y-3" style={{ overflow: 'visible' }}>
              {sortedMeetings.map((meeting) => {
                const folder = folders.find(f => f.id === meeting.folder_id);
                const folderColor = folder?.color || '#3B82F6';
                const isSelected = selectedMeetings.includes(meeting.id || meeting._id);
                const meetingId = meeting.id || meeting._id;
                
                return (
                  <div
                    key={meetingId}
                    className={`flex items-center space-x-4 p-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer group border-l-4 relative ${
                      isSelected ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''
                    }`}
                    style={{ 
                      borderLeftColor: folderColor,
                      overflow: 'visible'
                    }}
                    onClick={() => onMeetingClick(meetingId)}
                  >
                    <div onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => toggleMeetingSelection(meetingId)}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                    </div>
                    
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: folderColor }}
                    />
                    
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {meeting.title || 'Untitled Meeting'}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {folder?.name} • {new Date(meeting.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(meeting.status)}`}>
                        {meeting.status}
                      </span>
                      
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="relative" data-menu-container>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowMeetingMenu(showMeetingMenu === meetingId ? null : meetingId);
                            }}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                          >
                            <MoreVertical className="w-4 h-4 text-gray-400" />
                          </button>

                          {/* Same dropdown menu as in grid view */}
                          {showMeetingMenu === meetingId && (
                            <div 
                              className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700"
                              style={{ 
                                zIndex: 9999,
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                              }}
                            >
                              <div className="py-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onMeetingClick(meetingId);
                                    setShowMeetingMenu(null);
                                  }}
                                  className="w-full flex items-center space-x-3 px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                  <Eye className="w-4 h-4" />
                                  <span>View Details</span>
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowIndividualMoveDialog(meeting);
                                    setShowMeetingMenu(null);
                                  }}
                                  className="w-full flex items-center space-x-3 px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                  <Move className="w-4 h-4" />
                                  <span>Move to Folder</span>
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    shareIndividualMeeting(meetingId);
                                    setShowMeetingMenu(null);
                                  }}
                                  className="w-full flex items-center space-x-3 px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                  <Share2 className="w-4 h-4" />
                                  <span>Share</span>
                                </button>

                                <hr className="my-2 border-gray-200 dark:border-gray-700" />

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowIndividualDeleteConfirm(meeting);
                                    setShowMeetingMenu(null);
                                  }}
                                  className="w-full flex items-center space-x-3 px-4 py-2 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

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

      {/* Individual Meeting Move Dialog */}
      {showIndividualMoveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-96 max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Move Meeting
              </h3>
              <button
                onClick={() => setShowIndividualMoveDialog(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Move "{showIndividualMoveDialog.title || 'Untitled Meeting'}" to:
            </p>
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {folders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => moveIndividualMeeting(showIndividualMoveDialog.id || showIndividualMoveDialog._id, folder.id)}
                  disabled={folder.id === showIndividualMoveDialog.folder_id}
                  className={`w-full flex items-center space-x-3 p-3 rounded-lg transition-colors text-left ${
                    folder.id === showIndividualMoveDialog.folder_id
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: folder.color }}
                  />
                  <span className="flex-1 text-gray-900 dark:text-white font-medium">
                    {folder.name}
                  </span>
                  {folder.id === showIndividualMoveDialog.folder_id && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">Current</span>
                  )}
                </button>
              ))}
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowIndividualMoveDialog(null)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Individual Meeting Delete Confirmation */}
      {showIndividualDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-96 max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">
                Delete Meeting
              </h3>
              <button
                onClick={() => setShowIndividualDeleteConfirm(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete "{showIndividualDeleteConfirm.title || 'Untitled Meeting'}"? This action cannot be undone.
            </p>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowIndividualDeleteConfirm(null)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteMeeting(showIndividualDeleteConfirm.id || showIndividualDeleteConfirm._id);
                  setShowIndividualDeleteConfirm(null);
                }}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Dialog */}
      {showMoveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-96 max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Move Meetings
              </h3>
              <button
                onClick={() => setShowMoveDialog(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Select a folder to move {selectedMeetings.length} meeting(s) to:
            </p>
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {folders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => moveMeetings(folder.id)}
                  className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                >
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: folder.color }}
                  />
                  <span className="flex-1 text-gray-900 dark:text-white font-medium">
                    {folder.name}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {folder.meeting_count || 0} meetings
                  </span>
                </button>
              ))}
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowMoveDialog(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Create New Folder
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Folder Name
                </label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter folder name..."
                  maxLength={50}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Note: Default folders (Recent, Work, Personal) cannot be renamed or deleted
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map(color => (
                    <button
                      key={color}
                      className={`w-8 h-8 rounded-lg border-2 transition-all ${
                        newFolderColor === color 
                          ? 'border-gray-800 dark:border-white scale-110' 
                          : 'border-gray-300 dark:border-gray-600 hover:scale-105'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setNewFolderColor(color)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowCreateFolder(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createFolder}
                disabled={!newFolderName.trim()}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Create Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-96 max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">
                Confirm Deletion
              </h3>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete {selectedMeetings.length} selected meeting(s)? This action cannot be undone.
            </p>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={bulkDeleteMeetings}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AllMeetings;
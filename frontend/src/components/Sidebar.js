import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Mic, 
  Video, 
  FileText, 
  Users, 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  Edit, 
  Trash2, 
  Move,
  Folder,
  Clock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = ({ activeView, setActiveView, onMeetingClick }) => {
  const [expandedFolders, setExpandedFolders] = useState(new Set(['recent']));
  const [folders, setFolders] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#3B82F6');
  const [editingFolder, setEditingFolder] = useState(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [editFolderColor, setEditFolderColor] = useState('#3B82F6');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [showMoveDialog, setShowMoveDialog] = useState(null);
  const [selectedMeetingToMove, setSelectedMeetingToMove] = useState(null);
  const [loading, setLoading] = useState(true);
  const { makeAuthenticatedRequest } = useAuth();

  const colorOptions = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'
  ];

  const toggleFolder = (folderId) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'new-meeting', label: 'Record Meeting', icon: Mic },
    { id: 'new-webrtc-meeting', label: 'Video Meeting', icon: Video },
    { id: 'meetings', label: 'All Meetings', icon: FileText },
  ];

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

  // Add default folders definition
  const defaultFolders = [
    { id: 'recent', name: 'Recent', color: '#3B82F6', meeting_count: 0 },
    { id: 'work', name: 'Work', color: '#10B981', meeting_count: 0 },
    { id: 'personal', name: 'Personal', color: '#F59E0B', meeting_count: 0 }
  ];

  // Separate default and custom folders
  const customFolders = folders.filter(folder => 
    !['recent', 'work', 'personal'].includes(folder.id)
  );

  const allFolders = [...defaultFolders, ...customFolders];

  const fetchMeetings = async (folderId = null) => {
    try {
      const url = folderId ? `/meetings?folder_id=${folderId}&limit=50` : '/meetings?limit=50';
      const response = await makeAuthenticatedRequest(url);
      if (response.ok) {
        const data = await response.json();
        setMeetings(data.meetings || []);
      }
    } catch (error) {
      console.error('Error fetching meetings:', error);
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
        const newFolder = await response.json();
        setFolders([...folders, newFolder]);
        setShowCreateFolder(false);
        setNewFolderName('');
        setNewFolderColor('#3B82F6');
      }
    } catch (error) {
      console.error('Error creating folder:', error);
    }
  };

  const editFolder = async (folderId) => {
    if (!editFolderName.trim()) return;

    try {
      const response = await makeAuthenticatedRequest(`/meetings/folders/${folderId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editFolderName,
          color: editFolderColor
        })
      });

      if (response.ok) {
        setFolders(folders.map(f => 
          f.id === folderId 
            ? { ...f, name: editFolderName, color: editFolderColor }
            : f
        ));
        setEditingFolder(null);
        setEditFolderName('');
        setEditFolderColor('#3B82F6');
      }
    } catch (error) {
      console.error('Error editing folder:', error);
    }
  };

  const deleteFolder = async (folderId) => {
    try {
      const response = await makeAuthenticatedRequest(`/meetings/folders/${folderId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setFolders(folders.filter(f => f.id !== folderId));
        setShowDeleteConfirm(null);
        // Refresh meetings to show moved meetings in Recent
        fetchMeetings();
      }
    } catch (error) {
      console.error('Error deleting folder:', error);
    }
  };

  const moveMeeting = async (meetingId, targetFolderId) => {
    try {
      const response = await makeAuthenticatedRequest(`/meetings/${meetingId}`, {
        method: 'PUT',
        body: JSON.stringify({
          folder_id: targetFolderId
        })
      });

      if (response.ok) {
        // Update local state
        setMeetings(meetings.map(m => 
          (m.id === meetingId || m._id === meetingId)
            ? { ...m, folder_id: targetFolderId }
            : m
        ));
        setShowMoveDialog(false);
        setSelectedMeetingToMove(null);
      }
    } catch (error) {
      console.error('Error moving meeting:', error);
    }
  };

  const getMeetingsForFolder = (folderId) => {
    return meetings.filter(meeting => meeting.folder_id === folderId);
  };

  const getFolderMeetingCount = (folderId) => {
    // For default folders, count meetings dynamically from the local meetings array
    if (['recent', 'work', 'personal'].includes(folderId)) {
      return getMeetingsForFolder(folderId).length;
    }
    
    // For custom folders, use the count from the API but fallback to local count if needed
    const folder = folders.find(f => f.id === folderId);
    const apiCount = folder?.meeting_count || 0;
    const localCount = getMeetingsForFolder(folderId).length;
    
    // Use the local count if it's different from API count (more accurate for current view)
    return localCount;
  };

  const handleMoveClick = (e, meeting) => {
    e.stopPropagation();
    setSelectedMeetingToMove(meeting);
    setShowMoveDialog(true);
  };

  const renderFolderActions = (folder) => {
    // Don't show actions for default folders
    if (['recent', 'work', 'personal'].includes(folder.id)) {
      return null;
    }

    return (
      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setEditingFolder(folder.id);
            setEditFolderName(folder.name);
            setEditFolderColor(folder.color);
          }}
          className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          title="Edit folder"
        >
          <Edit className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowDeleteConfirm(folder.id);
          }}
          className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          title="Delete folder"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    );
  };

  const renderMeetingActions = (meeting) => (
    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={(e) => handleMoveClick(e, meeting)}
        className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        title="Move meeting"
      >
        <Move className="w-3 h-3" />
      </button>
    </div>
  );

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
        month: 'short',
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
    const loadData = async () => {
      await fetchFolders();
      await fetchMeetings();
      setLoading(false);
    };
    loadData();
  }, []);

  // Add this new function to handle meeting click with hover effect
  const handleMeetingClick = (meetingId, tab = 'transcript') => {
    onMeetingClick(meetingId, tab);
  };

  if (loading) {
    return (
      <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4">
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full">
        {/* Navigation Menu */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                    activeView === item.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Folders */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">
                Folders
              </h3>
              <button
                onClick={() => setShowCreateFolder(true)}
                className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                title="Create folder"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              {allFolders.map((folder) => {
                const isExpanded = expandedFolders.has(folder.id);
                const folderMeetings = getMeetingsForFolder(folder.id);
                const meetingCount = folderMeetings.length; // Use actual length instead of getFolderMeetingCount

                return (
                  <div key={folder.id}>
                    {editingFolder === folder.id ? (
                      <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <input
                          type="text"
                          value={editFolderName}
                          onChange={(e) => setEditFolderName(e.target.value)}
                          className="w-full px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded mb-2"
                          autoFocus
                        />
                        <div className="flex space-x-1 mb-2">
                          {colorOptions.map(color => (
                            <button
                              key={color}
                              onClick={() => setEditFolderColor(color)}
                              className={`w-4 h-4 rounded-full border ${
                                editFolderColor === color ? 'border-gray-900 dark:border-white' : 'border-gray-300'
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => editFolder(folder.id)}
                            className="flex-1 text-xs bg-blue-500 text-white py-1 rounded"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingFolder(null);
                              setEditFolderName('');
                              setEditFolderColor('#3B82F6');
                            }}
                            className="flex-1 text-xs bg-gray-500 text-white py-1 rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div 
                        className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg cursor-pointer group"
                        onClick={() => toggleFolder(folder.id)}
                      >
                        <div className="flex items-center space-x-2 flex-1">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: folder.color }}
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                            {folder.name}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto mr-2">
                            {meetingCount}
                          </span>
                        </div>
                        {renderFolderActions(folder)}
                      </div>
                    )}

                    {isExpanded && folderMeetings.length > 0 && (
                      <div className="ml-6 mt-1 space-y-1">
                        {folderMeetings.slice(0, 5).map((meeting) => (
                          <div
                            key={meeting.id || meeting._id}
                            onClick={() => handleMeetingClick(meeting.id || meeting._id)}
                            className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg cursor-pointer group"
                          >
                            <div className="flex items-center space-x-2 flex-1">
                              {meeting.meeting_type === 'webrtc' ? (
                                <Video className="w-3 h-3 text-green-500" />
                              ) : (
                                <Mic className="w-3 h-3 text-blue-500" />
                              )}
                              <div className="flex-1">
                                <p className="text-xs text-gray-700 dark:text-gray-300 font-medium truncate">
                                  {meeting.title || 'Untitled Meeting'}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  <Clock className="inline w-3 h-3 mr-1" />
                                  {formatDate(meeting.created_at)}
                                </p>
                              </div>
                            </div>
                            {renderMeetingActions(meeting)}
                          </div>
                        ))}
                        {folderMeetings.length > 5 && (
                          <div className="p-2 text-center">
                            <button
                              onClick={() => setActiveView('meetings')}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                            >
                              View {folderMeetings.length - 5} more...
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4">
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
                  placeholder="Enter folder name..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Color
                </label>
                <div className="flex space-x-2">
                  {colorOptions.map(color => (
                    <button
                      key={color}
                      onClick={() => setNewFolderColor(color)}
                      className={`w-8 h-8 rounded-full border-2 ${
                        newFolderColor === color ? 'border-gray-900 dark:border-white' : 'border-gray-300 dark:border-gray-600'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={createFolder}
                disabled={!newFolderName.trim()}
                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Create Folder
              </button>
              <button
                onClick={() => {
                  setShowCreateFolder(false);
                  setNewFolderName('');
                  setNewFolderColor('#3B82F6');
                }}
                className="flex-1 bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Delete Folder
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete this folder? All meetings will be moved to the Recent folder.
            </p>
            
            <div className="flex space-x-3">
              <button
                onClick={() => deleteFolder(showDeleteConfirm)}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Meeting Modal */}
      {showMoveDialog && selectedMeetingToMove && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Move Meeting
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Move "{selectedMeetingToMove.title || 'Untitled Meeting'}" to:
            </p>
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {allFolders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => moveMeeting(selectedMeetingToMove.id || selectedMeetingToMove._id, folder.id)}
                  className="w-full flex items-center space-x-3 px-3 py-2 text-left rounded-lg transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: folder.color }}
                  />
                  <span className="text-gray-900 dark:text-white">{folder.name}</span>
                </button>
              ))}
            </div>
            
            <div className="flex justify-end mt-6">
              <button
                onClick={() => {
                  setShowMoveDialog(false);
                  setSelectedMeetingToMove(null);
                }}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
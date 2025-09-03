import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Plus, 
  FileText, 
  ChevronDown, 
  ChevronRight, 
  Calendar, 
  Folder,
  FolderOpen,
  FolderPlus,
  Settings,
  Edit,
  Trash2,
  X,
  Check,
  Move,
  MoreHorizontal
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
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'new-meeting', label: 'New Meeting', icon: Plus },
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
      console.error('Failed to fetch folders:', error);
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
      const url = folderId ? `/meetings?folder_id=${folderId}` : '/meetings';
      const response = await makeAuthenticatedRequest(url);
      if (response.ok) {
        const data = await response.json();
        setMeetings(data.meetings || []);
      }
    } catch (error) {
      console.error('Failed to fetch meetings:', error);
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
        const folder = await response.json();
        setFolders(prev => [...prev, folder]);
        setNewFolderName('');
        setNewFolderColor('#3B82F6');
        setShowCreateFolder(false);
      }
    } catch (error) {
      console.error('Failed to create folder:', error);
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
        setFolders(prev => prev.map(folder => 
          folder.id === folderId 
            ? { ...folder, name: editFolderName, color: editFolderColor }
            : folder
        ));
        setEditingFolder(null);
        setEditFolderName('');
        setEditFolderColor('#3B82F6');
      }
    } catch (error) {
      console.error('Failed to edit folder:', error);
    }
  };

  const deleteFolder = async (folderId) => {
    try {
      const response = await makeAuthenticatedRequest(`/meetings/folders/${folderId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setFolders(prev => prev.filter(folder => folder.id !== folderId));
        await fetchMeetings(); // Refresh meetings
      }
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  };

  const moveMeeting = async (meetingId, targetFolderId) => {
    try {
      const response = await makeAuthenticatedRequest(`/meetings/${meetingId}`, {
        method: 'PUT',
        body: JSON.stringify({ folder_id: targetFolderId })
      });

      if (response.ok) {
        await fetchMeetings(); // Refresh meetings to show updated folder assignments
        setShowMoveDialog(false);
        setSelectedMeetingToMove(null);
      }
    } catch (error) {
      console.error('Failed to move meeting:', error);
    }
  };

  const getMeetingsForFolder = (folderId) => {
    return meetings.filter(meeting => meeting.folder_id === folderId);
  };

  const getFolderMeetingCount = (folderId) => {
    const folder = folders.find(f => f.id === folderId);
    return folder?.meeting_count || getMeetingsForFolder(folderId).length;
  };

  const handleMoveClick = (e, meeting) => {
    e.stopPropagation();
    setSelectedMeetingToMove(meeting);
    setShowMoveDialog(true);
  };

  const renderFolderActions = (folder) => {
    // Don't show edit/delete actions for default folders
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

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchFolders(), fetchMeetings()]);
      setLoading(false);
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full flex flex-col">
      {/* Navigation Menu - Fixed, non-scrollable */}
      <div className="flex-shrink-0 p-6 border-b border-gray-200 dark:border-gray-700">
        <nav className="space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
                activeView === item.id
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Folders Section - Scrollable with proper boundaries */}
      <div className="flex-1 min-h-0">
        <div className="h-full overflow-y-auto overscroll-contain">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">
                Folders
              </h3>
              <button
                onClick={() => setShowCreateFolder(true)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Create folder"
              >
                <FolderPlus className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
              </button>
            </div>

            <div className="space-y-1">
              {allFolders.map((folder) => (
                <div key={folder.id} className="group">
                  <div
                    className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      expandedFolders.has(folder.id)
                        ? 'bg-gray-100 dark:bg-gray-700'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                    onClick={() => toggleFolder(folder.id)}
                  >
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <ChevronRight
                        className={`w-4 h-4 text-gray-400 transition-transform ${
                          expandedFolders.has(folder.id) ? 'transform rotate-90' : ''
                        }`}
                      />
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: folder.color }}
                      />
                      
                      {editingFolder === folder.id && !['recent', 'work', 'personal'].includes(folder.id) ? (
                        <div className="flex items-center space-x-2 flex-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editFolderName}
                            onChange={(e) => setEditFolderName(e.target.value)}
                            className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                editFolder(folder.id);
                              } else if (e.key === 'Escape') {
                                setEditingFolder(null);
                              }
                            }}
                            autoFocus
                          />
                          <select
                            value={editFolderColor}
                            onChange={(e) => setEditFolderColor(e.target.value)}
                            className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            {colorOptions.map(color => (
                              <option key={color} value={color}>
                                {color}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => editFolder(folder.id)}
                            className="p-1 text-green-600 hover:text-green-700 transition-colors"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setEditingFolder(null)}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                          {folder.name}
                          {['recent', 'work', 'personal'].includes(folder.id) && (
                            <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(default)</span>
                          )}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {getFolderMeetingCount(folder.id)}
                      </span>
                      {renderFolderActions(folder)}
                    </div>
                  </div>

                  {/* Meeting list for expanded folders */}
                  {expandedFolders.has(folder.id) && (
                    <div className="ml-6 mt-1 space-y-1">
                      {getMeetingsForFolder(folder.id).map((meeting) => (
                        <div
                          key={meeting.id || meeting._id}
                          className="flex items-center justify-between px-3 py-2 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer group"
                          onClick={() => onMeetingClick(meeting.id || meeting._id)}
                        >
                          <div className="flex items-center space-x-2 flex-1 min-w-0">
                            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="text-gray-700 dark:text-gray-300 truncate">
                              {meeting.title || 'Untitled Meeting'}
                            </span>
                          </div>
                          
                          <div className="flex items-center space-x-1">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(meeting.created_at).toLocaleDateString()}
                            </span>
                            <button
                              onClick={(e) => handleMoveClick(e, meeting)}
                              className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100"
                              title="Move meeting"
                            >
                              <FolderOpen className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add some bottom padding to ensure the last item is fully visible */}
            <div className="h-6"></div>
          </div>
        </div>
      </div>

      {/* Move Meeting Dialog */}
      {showMoveDialog && selectedMeetingToMove && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-96 max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Move Meeting
              </h3>
              <button
                onClick={() => {
                  setShowMoveDialog(false);
                  setSelectedMeetingToMove(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Move "{selectedMeetingToMove.title || 'Untitled Meeting'}" to:
            </p>
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {allFolders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => moveMeeting(selectedMeetingToMove.id || selectedMeetingToMove._id, folder.id)}
                  disabled={folder.id === selectedMeetingToMove.folder_id}
                  className={`w-full flex items-center space-x-3 p-3 rounded-lg transition-colors text-left ${
                    folder.id === selectedMeetingToMove.folder_id
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
                  {folder.id === selectedMeetingToMove.folder_id && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">Current</span>
                  )}
                </button>
              ))}
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowMoveDialog(false);
                  setSelectedMeetingToMove(null);
                }}
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
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-96 max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Create New Folder
              </h3>
              <button
                onClick={() => setShowCreateFolder(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
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
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        newFolderColor === color 
                          ? 'border-gray-400 dark:border-gray-300 scale-110' 
                          : 'border-gray-200 dark:border-gray-600 hover:scale-105'
                      }`}
                      style={{ backgroundColor: color }}
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
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Folder Color Modal */}
      {editingFolder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-96 max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Edit Folder
              </h3>
              <button
                onClick={() => setEditingFolder(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Folder Name
                </label>
                <input
                  type="text"
                  value={editFolderName}
                  onChange={(e) => setEditFolderName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                      onClick={() => setEditFolderColor(color)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        editFolderColor === color 
                          ? 'border-gray-400 dark:border-gray-300 scale-110' 
                          : 'border-gray-200 dark:border-gray-600 hover:scale-105'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setEditingFolder(null)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => editFolder(editingFolder)}
                disabled={!editFolderName.trim()}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Save Changes
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
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Delete Folder
              </h3>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete this folder? All meetings in this folder will be moved to "Recent Meetings".
            </p>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteFolder(showDeleteConfirm);
                  setShowDeleteConfirm(null);
                }}
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

export default Sidebar;
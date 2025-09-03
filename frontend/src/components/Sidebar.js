import React, { useState, useEffect } from 'react';
import { Folder, FolderOpen, BarChart3, Plus, FileText, FolderPlus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = ({ activeView, setActiveView }) => {
  const [expandedFolders, setExpandedFolders] = useState(new Set(['recent']));
  const [folders, setFolders] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [loading, setLoading] = useState(true);
  const { makeAuthenticatedRequest } = useAuth();

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
      console.error('Error fetching folders:', error);
    }
  };

  const fetchMeetings = async (folderId = null) => {
    try {
      const url = folderId ? `/meetings?folder_id=${folderId}` : '/meetings';
      const response = await makeAuthenticatedRequest(url);
      if (response.ok) {
        const data = await response.json();
        setMeetings(data.meetings);
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
          color: '#3B82F6'
        })
      });
      
      if (response.ok) {
        const newFolder = await response.json();
        setFolders(prev => [...prev, { ...newFolder, meeting_count: 0 }]);
        setNewFolderName('');
        setShowCreateFolder(false);
      }
    } catch (error) {
      console.error('Error creating folder:', error);
    }
  };

  const getMeetingsForFolder = (folderId) => {
    return meetings.filter(meeting => meeting.folder_id === folderId).slice(0, 5);
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchFolders(), fetchMeetings()]);
      setLoading(false);
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <aside className="w-80 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 h-full overflow-y-auto">
        <div className="p-4">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-80 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 h-full overflow-y-auto">
      <div className="p-4">
        <nav className="space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                activeView === item.id
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-8">
          <div className="flex items-center justify-between px-3 mb-3">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Folders
            </h3>
            <button
              onClick={() => setShowCreateFolder(true)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Create new folder"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>

          {/* Create Folder Form */}
          {showCreateFolder && (
            <div className="mb-4 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyPress={(e) => e.key === 'Enter' && createFolder()}
                  autoFocus
                />
                <button
                  onClick={createFolder}
                  className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setShowCreateFolder(false);
                    setNewFolderName('');
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* Folders List */}
          {folders.length === 0 ? (
            <div className="text-center py-8">
              <Folder className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No folders yet</p>
              <button
                onClick={() => setShowCreateFolder(true)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1"
              >
                Create your first folder
              </button>
            </div>
          ) : (
            folders.map((folder) => (
              <div key={folder.id} className="mb-4">
                <button
                  onClick={() => toggleFolder(folder.id)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    {expandedFolders.has(folder.id) ? (
                      <FolderOpen className="w-4 h-4" />
                    ) : (
                      <Folder className="w-4 h-4" />
                    )}
                    <span className="font-medium">{folder.name}</span>
                  </div>
                  <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded-full">
                    {folder.meeting_count || 0}
                  </span>
                </button>
                
                {expandedFolders.has(folder.id) && (
                  <div className="ml-6 mt-2 space-y-1">
                    {getMeetingsForFolder(folder.id).map((meeting) => (
                      <div
                        key={meeting.id}
                        className="flex items-center justify-between p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                        onClick={() => setActiveView('meetings')}
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                            {meeting.title}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(meeting.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                    {getMeetingsForFolder(folder.id).length === 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">
                        No meetings yet
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
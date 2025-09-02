import React, { useState } from 'react';
import { Folder, FolderOpen, BarChart3, Plus, FileText } from 'lucide-react';

const Sidebar = ({ activeView, setActiveView }) => {
  const [expandedFolders, setExpandedFolders] = useState(new Set(['recent']));

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

  const folders = [
    {
      id: 'recent',
      name: 'Recent Meetings',
      meetings: [
        { id: 1, name: 'Team Standup', date: '2024-03-15', duration: '25 min' },
        { id: 2, name: 'Client Call', date: '2024-03-14', duration: '45 min' },
        { id: 3, name: 'Project Review', date: '2024-03-13', duration: '60 min' },
      ]
    },
    {
      id: 'work',
      name: 'Work Meetings',
      meetings: [
        { id: 4, name: 'Strategy Session', date: '2024-03-12', duration: '90 min' },
        { id: 5, name: 'All Hands', date: '2024-03-11', duration: '30 min' },
      ]
    }
  ];

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
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-3 mb-3">
            Folders
          </h3>
          {folders.map((folder) => (
            <div key={folder.id} className="mb-4">
              <button
                onClick={() => toggleFolder(folder.id)}
                className="w-full flex items-center space-x-2 px-3 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                {expandedFolders.has(folder.id) ? (
                  <FolderOpen className="w-4 h-4" />
                ) : (
                  <Folder className="w-4 h-4" />
                )}
                <span className="font-medium">{folder.name}</span>
              </button>
              {expandedFolders.has(folder.id) && (
                <div className="ml-6 mt-2 space-y-1">
                  {folder.meetings.map((meeting) => (
                    <div
                      key={meeting.id}
                      className="flex items-center justify-between p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {meeting.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {meeting.date} • {meeting.duration}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
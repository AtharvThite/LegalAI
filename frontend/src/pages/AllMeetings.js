import React, { useState } from 'react';
import { Search, Clock, Users, Globe, MessageCircle, Download } from 'lucide-react';

const AllMeetings = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const meetings = [
    {
      id: 1,
      title: 'Team Standup',
      date: '2024-03-15',
      duration: '25 min',
      participants: 5,
      status: 'processed',
      language: 'English'
    },
    {
      id: 2,
      title: 'Client Presentation',
      date: '2024-03-14',
      duration: '45 min',
      participants: 8,
      status: 'processing',
      language: 'English'
    },
    {
      id: 3,
      title: 'Project Review',
      date: '2024-03-13',
      duration: '60 min',
      participants: 12,
      status: 'processed',
      language: 'Spanish'
    },
  ];

  const filteredMeetings = meetings.filter(meeting =>
    meeting.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search meetings..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full md:w-80"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMeetings.map((meeting) => (
          <div
            key={meeting.id}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {meeting.title}
                </h3>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  meeting.status === 'processed' 
                    ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                    : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300'
                }`}>
                  {meeting.status}
                </span>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                  <Clock className="w-4 h-4 mr-2" />
                  {meeting.date} • {meeting.duration}
                </div>
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                  <Users className="w-4 h-4 mr-2" />
                  {meeting.participants} participants
                </div>
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                  <Globe className="w-4 h-4 mr-2" />
                  {meeting.language}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <button className="flex items-center space-x-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium">
                  <MessageCircle className="w-4 h-4" />
                  <span>Chat</span>
                </button>
                <button className="flex items-center space-x-1 text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-sm">
                  <Download className="w-4 h-4" />
                  <span>Export</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AllMeetings;
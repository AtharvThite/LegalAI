import React, { useState, useEffect, useRef } from 'react';
import { Globe, Folder, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NewDocument = ({ onDocumentCreated, onNavigate }) => {
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentDescription, setDocumentDescription] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('recent');
  const [folders, setFolders] = useState([]);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#3B82F6');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  const { makeAuthenticatedRequest } = useAuth();

  const colorOptions = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'
  ];

  useEffect(() => {
    fetchFolders();
  }, []);

  const fetchFolders = async () => {
    try {
      const response = await makeAuthenticatedRequest('/documents/folders');
      if (response.ok) {
        const data = await response.json();
        setFolders(data.folders || []);
      }
    } catch (error) {
      console.error('Error fetching folders:', error);
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      const response = await makeAuthenticatedRequest('/documents/folders', {
        method: 'POST',
        body: JSON.stringify({
          name: newFolderName,
          color: newFolderColor
        })
      });

      if (response.ok) {
        const newFolder = await response.json();
        setFolders([...folders, newFolder]);
        setNewFolderName('');
        setNewFolderColor('#3B82F6');
        setShowCreateFolder(false);
        setSelectedFolder(newFolder.id);
      }
    } catch (error) {
      console.error('Error creating folder:', error);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setError('');
    }
  };

  const startUpload = async () => {
    if (!documentTitle.trim() || !selectedFile) {
      setError('Please enter a title and select a file to upload.');
      return;
    }

    setIsUploading(true);
    setError('');
    setUploadProgress(0);

    try {
      // Upload file
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', documentTitle);
      formData.append('description', documentDescription);
      formData.append('folder_id', selectedFolder);

      const response = await makeAuthenticatedRequest('/documents/upload', {
        method: 'POST',
        body: formData,
        headers: {
          // 'X-CSRF-Token': csrfToken // Uncomment if using CSRF protection
        },
        onUploadProgress: (progressEvent) => {
          const { loaded, total } = progressEvent;
          const percent = Math.floor((loaded * 100) / total);
          setUploadProgress(percent);
        }
      });

      if (response.ok) {
        const data = await response.json();
        onDocumentCreated(data);
        setDocumentTitle('');
        setDocumentDescription('');
        setSelectedFolder('recent');
        setSelectedFile(null);
        setUploadProgress(0);
        setShowCreateFolder(false);
      } else {
        throw new Error('Failed to upload document');
      }
    } catch (error) {
      console.error('Error uploading document:', error);
      setError('Failed to upload document. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Upload Document
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Upload your files and organize them in folders
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Document Setup */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Document Setup
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Document Title
            </label>
            <input
              type="text"
              value={documentTitle}
              onChange={(e) => setDocumentTitle(e.target.value)}
              placeholder="Enter document title..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description (Optional)
            </label>
            <textarea
              value={documentDescription}
              onChange={(e) => setDocumentDescription(e.target.value)}
              placeholder="Add document description..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Folder className="inline w-4 h-4 mr-1" />
                Save to Folder
              </label>
              <div className="flex space-x-2">
                <select
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {Array.isArray(folders) && folders.map(folder => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowCreateFolder(true)}
                  className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                  title="Create new folder"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select File
            </label>
            <input
              type="file"
              onChange={handleFileChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
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

      {/* Upload Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8">
        <div className="text-center">
          {/* Progress Bar */}
          {isUploading && (
            <div className="mb-6">
              <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Control Buttons */}
          <div className="flex items-center justify-center space-x-4">
            <button
              onClick={startUpload}
              disabled={isUploading}
              className="flex items-center space-x-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white px-8 py-4 rounded-xl font-semibold transition-colors"
            >
              {isUploading ? (
                <>
                  <svg className="animate-spin h-5 w-5 mr-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M14.243 4.757a6 6 0 00-8.486 8.486M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  <span>Upload Document</span>
                </>
              )}
            </button>
          </div>

          {/* Status */}
          <div className="mt-4">
            <p className="text-gray-600 dark:text-gray-400">
              {isUploading && `Uploading... (${uploadProgress}%)`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewDocument;
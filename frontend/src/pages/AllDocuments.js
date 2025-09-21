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

const DocumentsPage = ({ onDocumentClick }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [viewMode, setViewMode] = useState('grid');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Bulk operations
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  
  // Folder management
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#3B82F6');
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  
  // Individual document actions
  const [showDocumentMenu, setShowDocumentMenu] = useState(null);
  const [showIndividualMoveDialog, setShowIndividualMoveDialog] = useState(null);
  const [showIndividualDeleteConfirm, setShowIndividualDeleteConfirm] = useState(null);
  
  const { makeAuthenticatedRequest } = useAuth();

  const colorOptions = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'
  ];

  // Fetch functions
  const fetchDocuments = async (searchQuery = '', folderFilter = 'all', pageNum = 1) => {
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

      const response = await makeAuthenticatedRequest(`/documents?${params}`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
        setTotalPages(data.pages || 1);
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFolders = async () => {
    try {
      const response = await makeAuthenticatedRequest('/documents/folders');
      if (response.ok) {
        const data = await response.json();
        setFolders(data.folders || []);
      }
    } catch (error) {
      console.error('Failed to fetch folders:', error);
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
        await fetchFolders();
        setShowCreateFolder(false);
        setNewFolderName('');
        setNewFolderColor('#3B82F6');
      }
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const deleteDocument = async (documentId) => {
    try {
      const response = await makeAuthenticatedRequest(`/documents/${documentId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchDocuments(searchTerm, selectedFolder, page);
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
    }
  };

  const moveDocuments = async (targetFolderId) => {
    try {
      const promises = selectedDocuments.map(documentId =>
        makeAuthenticatedRequest(`/documents/${documentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder_id: targetFolderId })
        })
      );
      await Promise.all(promises);
      setSelectedDocuments([]);
      fetchDocuments(searchTerm, selectedFolder, page);
    } catch (error) {
      console.error('Failed to move documents:', error);
    }
  };

  const moveIndividualDocument = async (documentId, targetFolderId) => {
    try {
      const response = await makeAuthenticatedRequest(`/documents/${documentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: targetFolderId })
      });
      if (response.ok) {
        fetchDocuments(searchTerm, selectedFolder, page);
      }
    } catch (error) {
      console.error('Failed to move document:', error);
    }
  };

  const bulkDeleteDocuments = async () => {
    try {
      const promises = selectedDocuments.map(documentId =>
        makeAuthenticatedRequest(`/documents/${documentId}`, {
          method: 'DELETE'
        })
      );

      await Promise.all(promises);
      setSelectedDocuments([]);
      setShowDeleteConfirm(null);
      fetchDocuments(searchTerm, selectedFolder, page);
    } catch (error) {
      console.error('Failed to delete documents:', error);
    }
  };

  const exportDocuments = async (format = 'json') => {
    try {
      const response = await makeAuthenticatedRequest('/report/bulk-export', {
        method: 'POST',
        body: JSON.stringify({
          document_ids: selectedDocuments,
          format: format
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `documents_export.${format === 'json' ? 'zip' : format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Failed to export documents:', error);
    }
  };

  const downloadIndividualReport = async (documentId, format) => {
    try {
      const response = await makeAuthenticatedRequest(`/report/${documentId}/${format}`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `document_${documentId}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Failed to download report:', error);
    }
  };

  const shareIndividualDocument = async (documentId) => {
    try {
      const url = `${window.location.origin}/documents/${documentId}`;
      await navigator.clipboard.writeText(url);
      // You could add a toast notification here
      console.log('Document link copied to clipboard');
    } catch (error) {
      console.error('Failed to share document:', error);
    }
  };

  const toggleDocumentSelection = (documentId) => {
    setSelectedDocuments(prev => {
      const newSelection = prev.includes(documentId)
        ? prev.filter(id => id !== documentId)
        : [...prev, documentId];
      
      setSelectAll(newSelection.length === documents.length);
      return newSelection;
    });
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedDocuments([]);
      setSelectAll(false);
    } else {
      const allDocumentIds = documents.map(document => document.id || document._id);
      setSelectedDocuments(allDocumentIds);
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
  const sortedDocuments = useMemo(() => {
    if (!documents.length) return documents;

    const sorted = [...documents].sort((a, b) => {
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
  }, [documents, sortBy, sortOrder, folders]);  // Dependencies: re-sort when these change

  const renderDocumentCard = (document) => {
    const folder = folders.find(f => f.id === document.folder_id);
    const folderColor = folder?.color || '#3B82F6';
    const isSelected = selectedDocuments.includes(document.id || document._id);
    const documentId = document.id || document._id;

    return (
      <div
        key={documentId}
        className={`bg-white dark:bg-gray-800 rounded-2xl border ${
          isSelected 
            ? 'border-blue-500 dark:border-blue-400 shadow-lg' 
            : 'border-gray-200 dark:border-gray-700'
        } shadow-sm hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 cursor-pointer group relative overflow-hidden`}
        onClick={() => onDocumentClick(documentId)}
      >
        {/* Selection checkbox */}
        <div 
          className="absolute top-4 left-4 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => toggleDocumentSelection(documentId)}
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
                  {document.title || 'Untitled Document'}
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
                {document.description || 'No description available'}
              </p>
              
              <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center space-x-1">
                  <Calendar className="w-4 h-4" />
                  <span>
                    {formatDate(document.created_at)}
                  </span>
                </div>
                
                <div className="flex items-center space-x-1">
                  <Clock className="w-4 h-4" />
                  <span>{document.file_type || 'text'}</span>
                </div>
                
                <div className="flex items-center space-x-1">
                  <FileText className="w-4 h-4" />
                  <span>{document.content?.length || 0} chars</span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-end space-y-2 flex-shrink-0">
              <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(document.status)}`}>
                {document.status}
              </span>
              
              {/* Three-dot menu - allow overflow */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDocumentMenu(showDocumentMenu === documentId ? null : documentId);
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <MoreVertical className="w-4 h-4 text-gray-400" />
                </button>

                {/* Dropdown menu - positioned to extend outside card */}
                {showDocumentMenu === documentId && (
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
                          onDocumentClick(documentId);
                          setShowDocumentMenu(null);
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        <span>View Details</span>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowIndividualMoveDialog(document);
                          setShowDocumentMenu(null);
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Move className="w-4 h-4" />
                        <span>Move to Folder</span>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          shareIndividualDocument(documentId);
                          setShowDocumentMenu(null);
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
                                downloadIndividualReport(documentId, 'pdf');
                                setShowDocumentMenu(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                              PDF
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadIndividualReport(documentId, 'json');
                                setShowDocumentMenu(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                              JSON
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadIndividualReport(documentId, 'txt');
                                setShowDocumentMenu(null);
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
                          setShowIndividualDeleteConfirm(document);
                          setShowDocumentMenu(null);
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
          
          {/* Document stats */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
                <FileText className="w-3 h-3" />
                <span>{document.transcript ? 'Transcript' : 'No transcript'}</span>
              </div>
              
              <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
                <Users className="w-3 h-3" />
                <span>{document.summary ? 'Summary' : 'No summary'}</span>
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
    fetchDocuments(searchTerm, selectedFolder, page);
  }, [searchTerm, selectedFolder, page, sortBy, sortOrder]);

  useEffect(() => {
    fetchFolders();
  }, []);

  useEffect(() => {
    setShowBulkActions(selectedDocuments.length > 0);
  }, [selectedDocuments]);

  useEffect(() => {
    // Close document menu when clicking outside
    const handleClickOutside = (event) => {
      if (showDocumentMenu && !event.target.closest('[data-menu-container]')) {
        setShowDocumentMenu(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showDocumentMenu]);

  const handleSearch = (value) => {
    setSearchTerm(value);
    setPage(1);
  };

  const handleFolderChange = (folderId) => {
    setSelectedFolder(folderId);
    setPage(1);
    setSelectedDocuments([]);
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
            All Documents
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Manage and explore your documents.
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
            placeholder="Search documents..."
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
          {Array.isArray(folders) && folders.map(folder => (
            <option key={folder.id} value={folder.id}>
              {folder.name} ({folder.document_count || 0})
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
              {selectedDocuments.length} document(s) selected
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
                onClick={() => exportDocuments('json')}
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
                  setSelectedDocuments([]);
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

      {/* Documents Display */}
      {sortedDocuments.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No documents found
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {searchTerm ? 'Try adjusting your search terms' : 'Start by uploading your first document'}
          </p>
        </div>
      ) : (
        <>
          {viewMode === 'grid' ? (
            <div 
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              style={{ overflow: 'visible' }}
            >
              {sortedDocuments.map(renderDocumentCard)}
            </div>
          ) : (
            <div className="space-y-3" style={{ overflow: 'visible' }}>
              {sortedDocuments.map((document) => {
                const folder = folders.find(f => f.id === document.folder_id);
                const folderColor = folder?.color || '#3B82F6';
                const isSelected = selectedDocuments.includes(document.id || document._id);
                const documentId = document.id || document._id;
                
                return (
                  <div
                    key={documentId}
                    className={`flex items-center space-x-4 p-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer group border-l-4 relative ${
                      isSelected ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''
                    }`}
                    style={{ 
                      borderLeftColor: folderColor,
                      overflow: 'visible'
                    }}
                    onClick={() => onDocumentClick(documentId)}
                  >
                    <div onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => toggleDocumentSelection(documentId)}
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
                        {document.title || 'Untitled Document'}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {folder?.name} • {new Date(document.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(document.status)}`}>
                        {document.status}
                      </span>
                      
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="relative" data-menu-container>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDocumentMenu(showDocumentMenu === documentId ? null : documentId);
                            }}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                          >
                            <MoreVertical className="w-4 h-4 text-gray-400" />
                          </button>

                          {/* Same dropdown menu as in grid view */}
                          {showDocumentMenu === documentId && (
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
                                    onDocumentClick(documentId);
                                    setShowDocumentMenu(null);
                                  }}
                                  className="w-full flex items-center space-x-3 px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                  <Eye className="w-4 h-4" />
                                  <span>View Details</span>
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowIndividualMoveDialog(document);
                                    setShowDocumentMenu(null);
                                  }}
                                  className="w-full flex items-center space-x-3 px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                  <Move className="w-4 h-4" />
                                  <span>Move to Folder</span>
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    shareIndividualDocument(documentId);
                                    setShowDocumentMenu(null);
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
                                          downloadIndividualReport(documentId, 'pdf');
                                          setShowDocumentMenu(null);
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                      >
                                        PDF
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          downloadIndividualReport(documentId, 'json');
                                          setShowDocumentMenu(null);
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                      >
                                        JSON
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          downloadIndividualReport(documentId, 'txt');
                                          setShowDocumentMenu(null);
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
                                    setShowIndividualDeleteConfirm(document);
                                    setShowDocumentMenu(null);
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

      {/* Individual Document Move Dialog */}
      {showIndividualMoveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-96 max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Move Document
              </h3>
              <button
                onClick={() => setShowIndividualMoveDialog(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Move "{showIndividualMoveDialog.title || 'Untitled Document'}" to:
            </p>
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {Array.isArray(folders) && folders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => moveIndividualDocument(showIndividualMoveDialog.id || showIndividualMoveDialog._id, folder.id)}
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

      {/* Individual Document Delete Confirmation */}
      {showIndividualDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-96 max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">
                Delete Document
              </h3>
              <button
                onClick={() => setShowIndividualDeleteConfirm(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete "{showIndividualDeleteConfirm.title || 'Untitled Document'}"? This action cannot be undone.
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
                  deleteDocument(showIndividualDeleteConfirm.id || showIndividualDeleteConfirm._id);
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
                Move Documents
              </h3>
              <button
                onClick={() => setShowMoveDialog(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Select a folder to move {selectedDocuments.length} document(s) to:
            </p>
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {folders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => moveDocuments(folder.id)}
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
                    {folder.document_count || 0} documents
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
              Are you sure you want to delete {selectedDocuments.length} selected document(s)? This action cannot be undone.
            </p>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={bulkDeleteDocuments}
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

export default DocumentsPage;
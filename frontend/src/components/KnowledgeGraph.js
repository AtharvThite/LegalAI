import React, { useRef, useState, useEffect } from 'react';
import { DataSet, Network } from 'vis-network/standalone';
import { useTheme } from '../context/ThemeContext'; 

const KnowledgeGraph = ({ graphData, onNodeClick }) => {
  const networkRef = useRef(null);
  const [network, setNetwork] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeType, setActiveType] = useState('all');
  const { isDarkMode } = useTheme(); 

  const getNodeIcon = (type) => {
    const icons = {
      person: '👤',
      project: '📋',
      topic: '💡',
      action: '✅',
      company: '🏢',
      technology: '⚙️',
      decision: '🎯',
      meeting: '🤝'
    };
    return icons[type] || '📄';
  };

  const getNodeColor = (type) => {
    const colors = {
      person: { background: '#3B82F6', border: '#1E3A8A', highlight: { background: '#2563EB', border: '#1E3A8A' } },
      project: { background: '#10B981', border: '#047857', highlight: { background: '#059669', border: '#047857' } },
      topic: { background: '#F59E0B', border: '#D97706', highlight: { background: '#EAB308', border: '#D97706' } },
      action: { background: '#EF4444', border: '#DC2626', highlight: { background: '#DC2626', border: '#B91C1C' } },
      company: { background: '#8B5CF6', border: '#7C3AED', highlight: { background: '#7C3AED', border: '#6D28D9' } },
      technology: { background: '#6B7280', border: '#4B5563', highlight: { background: '#4B5563', border: '#374151' } },
      decision: { background: '#EC4899', border: '#DB2777', highlight: { background: '#DB2777', border: '#BE185D' } },
      meeting: { background: '#06B6D4', border: '#0891B2', highlight: { background: '#0891B2', border: '#0E7490' } },
    };
    return colors[type] || colors.topic;
  };

  useEffect(() => {
    // Cleanup function
    const cleanup = () => {
      if (network) {
        try {
          network.destroy();
        } catch (error) {
          console.warn('Error destroying network:', error);
        }
        setNetwork(null);
      }
      setSelectedNode(null);
    };

    // Check if we have valid data and a container
    if (!graphData || !graphData.nodes || !graphData.nodes.length || !networkRef.current) {
      cleanup();
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // Clear existing network first
      cleanup();

      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        try {
          // Prepare nodes data
          const nodes = new DataSet(graphData.nodes.map(node => ({
            id: node.id,
            label: node.label || node.id,
            title: `${node.type}: ${node.label || node.id}`,
            color: getNodeColor(node.type),
            font: { 
              color: isDarkMode ? '#fff' : '#222', // <-- Theme-based font color
              size: 12 
            },
            shape: 'dot',
            size: 20,
            type: node.type,
            properties: node.properties || {}
          })));

          // Prepare edges data
          const edges = new DataSet((graphData.edges || []).map(edge => ({
            id: `${edge.source}-${edge.target}`,
            from: edge.source,
            to: edge.target,
            label: edge.relationship || '',
            title: edge.relationship || '',
            color: { color: '#848484' },
            width: edge.weight ? Math.max(1, edge.weight * 3) : 2,
            arrows: { to: { enabled: true, scaleFactor: 1 } }
          })));

          // Network options
          const options = {
            physics: {
              enabled: true,
              stabilization: { 
                enabled: true,
                iterations: 100,
                updateInterval: 50
              },
              barnesHut: {
                gravitationalConstant: -2000,
                centralGravity: 0.3,
                springLength: 95,
                springConstant: 0.04,
                damping: 0.09
              }
            },
            nodes: {
              borderWidth: 2,
              shadow: true
            },
            edges: {
              shadow: true,
              smooth: {
                type: 'continuous'
              }
            },
            interaction: {
              hover: true,
              tooltipDelay: 200,
              hideEdgesOnDrag: true
            },
            height: '500px',
            width: '100%'
          };

          // Create network only if container still exists
          if (networkRef.current) {
            const networkInstance = new Network(networkRef.current, { nodes, edges }, options);

            // Set up event handlers
            networkInstance.on('click', (params) => {
              if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const node = graphData.nodes.find(n => n.id === nodeId);
                if (node) {
                  setSelectedNode(node);
                  if (onNodeClick) {
                    onNodeClick(node);
                  }
                }
              } else {
                setSelectedNode(null);
              }
            });

            // Handle stabilization
            networkInstance.on('stabilizationIterationsDone', () => {
              setLoading(false);
              try {
                networkInstance.setOptions({ physics: { enabled: false } });
              } catch (error) {
                console.warn('Error disabling physics:', error);
              }
            });

            // Fallback to stop loading after timeout
            const timeoutId = setTimeout(() => {
              setLoading(false);
              try {
                if (networkInstance) {
                  networkInstance.setOptions({ physics: { enabled: false } });
                }
              } catch (error) {
                console.warn('Error in timeout physics disable:', error);
              }
            }, 5000);

            // Store references for cleanup
            networkInstance._timeoutId = timeoutId;
            setNetwork(networkInstance);
          }

        } catch (error) {
          console.error('Error creating network:', error);
          setLoading(false);
        }
      }, 100);

      return () => {
        clearTimeout(timer);
        cleanup();
      };

    } catch (error) {
      console.error('Error in useEffect:', error);
      setLoading(false);
      cleanup();
    }
  }, [graphData, onNodeClick, isDarkMode]); // <-- Add isDarkMode to dependencies

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (network) {
        try {
          if (network._timeoutId) {
            clearTimeout(network._timeoutId);
          }
          network.destroy();
        } catch (error) {
          console.warn('Error during cleanup:', error);
        }
      }
    };
  }, [network]);

  const handleFilterByType = (type) => {
    setActiveType(type);
    if (!network || !graphData) return;

    try {
      const nodes = new DataSet();
      const edges = new DataSet();

      if (type === 'all') {
        // Show all nodes and edges
        nodes.add(graphData.nodes.map(node => ({
          id: node.id,
          label: node.label || node.id,
          title: `${node.type}: ${node.label || node.id}`,
          color: getNodeColor(node.type),
          font: { 
            color: isDarkMode ? '#fff' : '#222', // <-- Theme-based font color
            size: 12 
          },
          shape: 'dot',
          size: 20,
          type: node.type,
          properties: node.properties || {}
        })));

        edges.add((graphData.edges || []).map(edge => ({
          id: `${edge.source}-${edge.target}`,
          from: edge.source,
          to: edge.target,
          label: edge.relationship || '',
          title: edge.relationship || '',
          color: { color: '#848484' },
          width: edge.weight ? Math.max(1, edge.weight * 3) : 2,
          arrows: { to: { enabled: true, scaleFactor: 1 } }
        })));
      } else {
        // Filter by type
        const filteredNodes = graphData.nodes.filter(node => node.type === type);
        const filteredNodeIds = new Set(filteredNodes.map(node => node.id));

        nodes.add(filteredNodes.map(node => ({
          id: node.id,
          label: node.label || node.id,
          title: `${node.type}: ${node.label || node.id}`,
          color: getNodeColor(node.type),
          font: { 
            color: isDarkMode ? '#fff' : '#222', // <-- Theme-based font color
            size: 12 
          },
          shape: 'dot',
          size: 20,
          type: node.type,
          properties: node.properties || {}
        })));

        // Add edges between filtered nodes
        const filteredEdges = (graphData.edges || []).filter(edge => 
          filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)
        );

        edges.add(filteredEdges.map(edge => ({
          id: `${edge.source}-${edge.target}`,
          from: edge.source,
          to: edge.target,
          label: edge.relationship || '',
          title: edge.relationship || '',
          color: { color: '#848484' },
          width: edge.weight ? Math.max(1, edge.weight * 3) : 2,
          arrows: { to: { enabled: true, scaleFactor: 1 } }
        })));
      }

      network.setData({ nodes, edges });
    } catch (error) {
      console.error('Error filtering graph:', error);
    }
  };

  const resetView = () => {
    if (network) {
      try {
        network.fit({
          animation: {
            duration: 1000,
            easingFunction: 'easeInOutQuad'
          }
        });
      } catch (error) {
        console.error('Error resetting view:', error);
      }
    }
  };

  const nodeTypes = graphData?.nodes ? 
    [...new Set(graphData.nodes.map(n => n.type))] : [];

  // Show loading or empty state
  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No Knowledge Graph Available
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Generate a knowledge graph from the meeting transcript to see entities and relationships.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
      <div className={`p-6 border-b border-gray-200 dark:border-gray-700 ${
        isDarkMode
          ? 'bg-gradient-to-r from-gray-800 to-gray-900'
          : 'bg-gradient-to-r from-gray-50 to-gray-100'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className={`text-xl font-semibold ${
                isDarkMode ? 'text-gray-100' : 'text-gray-800'
              }`}>
                Knowledge Graph
              </h3>
              <p className={`text-sm ${
                isDarkMode ? 'text-gray-300' : 'text-gray-600'
              }`}>
                Interactive visualization of meeting entities and relationships
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={resetView}
              className={`px-3 py-2 text-sm rounded-lg flex items-center space-x-1 transition-colors
                ${isDarkMode
                  ? 'bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-300'
                }`}
              title="Reset view"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Reset</span>
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-medium mr-2 ${
            isDarkMode ? 'text-gray-200' : 'text-gray-700'
          }`}>Filter by type:</span>
          <button
            onClick={() => handleFilterByType('all')}
            className={`px-3 py-1.5 text-xs font-medium border rounded-full shadow-sm transition-all duration-200
              ${isDarkMode
                ? activeType === 'all'
                  ? 'bg-blue-700 text-white border-blue-500'
                  : 'bg-gray-800 text-gray-100 border-gray-600 hover:bg-gray-700'
                : activeType === 'all'
                  ? 'bg-blue-100 text-blue-700 border-blue-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
          >
            All ({graphData.nodes.length})
          </button>
          {nodeTypes.map(type => {
            const count = graphData.nodes.filter(n => n.type === type).length;
            const isActive = activeType === type;
            return (
              <button
                key={type}
                onClick={() => handleFilterByType(type)}
                className={`px-3 py-1.5 text-xs font-medium border rounded-full shadow-sm transition-all duration-200 capitalize
                  ${isDarkMode
                    ? isActive
                      ? 'bg-blue-700 text-white border-blue-500'
                      : 'bg-gray-800 text-gray-100 border-gray-600 hover:bg-gray-700'
                    : isActive
                      ? 'bg-blue-100 text-blue-700 border-blue-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                style={{
                  borderColor: getNodeColor(type).border,
                  color: isActive
                    ? (isDarkMode ? '#fff' : getNodeColor(type).background)
                    : getNodeColor(type).background
                }}
              >
                {getNodeIcon(type)} {type} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-6">
        <div className="flex gap-6 min-h-[500px]">
          <div className="flex-1 relative">
            {loading && (
              <div className="absolute inset-0 bg-gradient-to-br from-white via-gray-50 to-gray-100 dark:from-gray-800 dark:via-gray-700 dark:to-gray-600 bg-opacity-95 dark:bg-opacity-95 flex items-center justify-center z-10 rounded-lg">
                <div className="flex flex-col items-center space-y-3 text-gray-600 dark:text-gray-400">
                  <div className="relative">
                    <svg className="animate-spin w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <div className="absolute inset-0 animate-ping w-8 h-8 rounded-full bg-blue-400 opacity-20"></div>
                  </div>
                  <span className="text-sm font-medium">Building knowledge graph...</span>
                  <div className="w-32 h-1 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full animate-pulse"></div>
                  </div>
                </div>
              </div>
            )}
            <div 
              ref={networkRef} 
              className="w-full h-[500px] border-2 border-gray-200 dark:border-gray-600 rounded-xl shadow-inner"
              style={{
                background: isDarkMode
                  ? `
                    radial-gradient(circle at 25% 25%, rgba(59, 130, 246, 0.12) 0%, transparent 50%),
                    radial-gradient(circle at 75% 75%, rgba(139, 92, 246, 0.12) 0%, transparent 50%),
                    linear-gradient(135deg, 
                      rgba(31, 41, 55, 0.95) 0%, 
                      rgba(55, 65, 81, 0.95) 50%, 
                      rgba(17, 24, 39, 0.95) 100%
                    )
                  `
                  : `
                    radial-gradient(circle at 25% 25%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
                    radial-gradient(circle at 75% 75%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
                    linear-gradient(135deg, 
                      rgba(249, 250, 251, 0.9) 0%, 
                      rgba(243, 244, 246, 0.9) 50%, 
                      rgba(229, 231, 235, 0.9) 100%
                    )
                  `
              }}
            />
            
            <div className={`absolute top-4 right-4 rounded-lg shadow-lg border p-3 ${
              isDarkMode
                ? 'bg-gray-900 border-gray-700'
                : 'bg-white border-gray-200'
            }`}>
              <h4 className={`text-xs font-semibold mb-2 ${
                isDarkMode ? 'text-gray-100' : 'text-gray-700'
              }`}>Legend</h4>
              <div className="space-y-1">
                {nodeTypes.slice(0, 4).map(type => (
                  <div key={type} className="flex items-center space-x-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: getNodeColor(type).background }}
                    />
                    <span className={`text-xs capitalize ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-600'
                    }`}>
                      {getNodeIcon(type)} {type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {selectedNode && (
            <div className="w-80 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 rounded-xl p-4 animate-slide-up border border-gray-200 dark:border-gray-600 shadow-lg">
              <div className="flex items-center space-x-3 mb-4 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-lg border-2"
                  style={{ 
                    backgroundColor: getNodeColor(selectedNode.type).background,
                    borderColor: getNodeColor(selectedNode.type).border
                  }}
                >
                  {getNodeIcon(selectedNode.type)}
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">
                    {selectedNode.label}
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded-full mt-1 inline-block">
                    {selectedNode.type}
                  </p>
                </div>
              </div>

              {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
                <div className="mb-4 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                  <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Properties
                  </h5>
                  <div className="space-y-2">
                    {Object.entries(selectedNode.properties).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-xs bg-gray-50 dark:bg-gray-700 p-2 rounded">
                        <span className="text-gray-600 dark:text-gray-400 capitalize font-medium">
                          {key.replace('_', ' ')}:
                        </span>
                        <span className="text-gray-900 dark:text-white font-medium text-right ml-2">
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Connections ({graphData.edges?.filter(edge => edge.source === selectedNode.id || edge.target === selectedNode.id).length || 0})
                </h5>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {graphData.edges
                    ?.filter(edge => edge.source === selectedNode.id || edge.target === selectedNode.id)
                    .map((edge, index) => {
                      const connectedNodeId = edge.source === selectedNode.id ? edge.target : edge.source;
                      const connectedNode = graphData.nodes.find(n => n.id === connectedNodeId);
                      return (
                        <div key={index} className="text-xs bg-gray-50 dark:bg-gray-700 p-2 rounded">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {edge.relationship || 'Connected to'}
                          </div>
                          <div className="text-gray-600 dark:text-gray-400">
                            {connectedNode?.label || connectedNodeId}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-200 dark:border-gray-600">
          <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {graphData?.nodes?.length || 0}
            </div>
            <div className="text-sm text-blue-600/80 dark:text-blue-400/80 font-medium">Entities</div>
          </div>
          <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {graphData?.edges?.length || 0}
            </div>
            <div className="text-sm text-green-600/80 dark:text-green-400/80 font-medium">Relationships</div>
          </div>
          <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {graphData?.topics?.length || 0}
            </div>
            <div className="text-sm text-purple-600/80 dark:text-purple-400/80 font-medium">Topics</div>
          </div>
          <div className="text-center p-4 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-lg">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {graphData?.action_items?.length || 0}
            </div>
            <div className="text-sm text-red-600/80 dark:text-red-400/80 font-medium">Actions</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeGraph;
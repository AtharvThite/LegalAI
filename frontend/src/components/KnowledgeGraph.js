import React, { useEffect, useRef, useState } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { Users, Lightbulb, Target, Building, Code } from 'lucide-react';

const KnowledgeGraph = ({ graphData, onNodeClick }) => {
  const networkRef = useRef(null);
  const [network, setNetwork] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  const getNodeIcon = (type) => {
    switch (type) {
      case 'person': return '👤';
      case 'project': return '📁';
      case 'topic': return '💡';
      case 'action': return '✅';
      case 'company': return '🏢';
      case 'technology': return '⚙️';
      default: return '⭐';
    }
  };

  const getNodeColor = (type) => {
    switch (type) {
      case 'person': return '#3B82F6';
      case 'project': return '#10B981';
      case 'topic': return '#F59E0B';
      case 'action': return '#EF4444';
      case 'company': return '#8B5CF6';
      case 'technology': return '#6B7280';
      default: return '#9CA3AF';
    }
  };

  useEffect(() => {
    if (!graphData || !graphData.nodes || !networkRef.current) return;

    // Prepare nodes
    const nodes = new DataSet(
      graphData.nodes.map(node => ({
        id: node.id,
        label: node.label,
        title: `${node.label}\nType: ${node.type}${node.properties ? '\n' + JSON.stringify(node.properties) : ''}`,
        color: {
          background: getNodeColor(node.type),
          border: getNodeColor(node.type),
          highlight: {
            background: getNodeColor(node.type),
            border: '#000000'
          }
        },
        font: { color: '#ffffff', size: 14, face: 'Arial' },
        shape: 'dot',
        size: 25,
        type: node.type
      }))
    );

    // Prepare edges
    const edges = new DataSet(
      graphData.edges.map(edge => ({
        id: `${edge.source}-${edge.target}`,
        from: edge.source,
        to: edge.target,
        label: edge.relationship,
        color: { color: '#9CA3AF', highlight: '#374151' },
        font: { color: '#374151', size: 12 },
        width: edge.weight || 1,
        arrows: 'to'
      }))
    );

    const data = { nodes, edges };

    const options = {
      physics: {
        enabled: true,
        stabilization: { iterations: 100 },
        barnesHut: {
          gravitationalConstant: -2000,
          centralGravity: 0.3,
          springLength: 95,
          springConstant: 0.04,
          damping: 0.09
        }
      },
      layout: {
        improvedLayout: true
      },
      interaction: {
        hover: true,
        tooltipDelay: 200
      },
      nodes: {
        borderWidth: 2,
        shadow: true
      },
      edges: {
        smooth: {
          type: 'continuous',
          roundness: 0.2
        },
        shadow: true
      }
    };

    const networkInstance = new Network(networkRef.current, data, options);

    // Handle node selection
    networkInstance.on('selectNode', (event) => {
      const nodeId = event.nodes[0];
      const nodeData = graphData.nodes.find(n => n.id === nodeId);
      setSelectedNode(nodeData);
      if (onNodeClick) onNodeClick(nodeData);
    });

    // Handle click on empty area
    networkInstance.on('deselectNode', () => {
      setSelectedNode(null);
    });

    setNetwork(networkInstance);

    return () => {
      networkInstance.destroy();
    };
  }, [graphData, onNodeClick]);

  const handleFilterByType = (type) => {
    if (!network) return;

    const nodes = graphData.nodes.filter(node => 
      type === 'all' || node.type === type
    ).map(node => node.id);

    network.selectNodes(nodes);
    network.fit({ nodes });
  };

  const nodeTypes = graphData?.nodes ? 
    [...new Set(graphData.nodes.map(n => n.type))] : [];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          Knowledge Graph
        </h3>
        
        {/* Type filters */}
        <div className="flex space-x-2">
          <button
            onClick={() => handleFilterByType('all')}
            className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            All
          </button>
          {nodeTypes.map(type => (
            <button
              key={type}
              onClick={() => handleFilterByType(type)}
              className="px-3 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors capitalize"
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Graph visualization */}
        <div className="flex-1">
          <div 
            ref={networkRef} 
            className="w-full h-96 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700"
          />
        </div>

        {/* Node details sidebar */}
        {selectedNode && (
          <div className="w-80 bg-gray-50 dark:bg-gray-700 rounded-lg p-4 animate-slide-up">
            <div className="flex items-center space-x-3 mb-4">
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm"
                style={{ backgroundColor: getNodeColor(selectedNode.type) }}
              >
                {getNodeIcon(selectedNode.type)}
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">
                  {selectedNode.label}
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                  {selectedNode.type}
                </p>
              </div>
            </div>

            {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
              <div className="space-y-2">
                <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Properties:
                </h5>
                {Object.entries(selectedNode.properties).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 capitalize">
                      {key}:
                    </span>
                    <span className="text-gray-900 dark:text-white">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Related connections */}
            <div className="mt-4">
              <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Connections:
              </h5>
              <div className="space-y-1">
                {graphData.edges
                  .filter(edge => edge.source === selectedNode.id || edge.target === selectedNode.id)
                  .map(edge => {
                    const connectedNodeId = edge.source === selectedNode.id ? edge.target : edge.source;
                    const connectedNode = graphData.nodes.find(n => n.id === connectedNodeId);
                    return (
                      <div key={edge.source + edge.target} className="text-xs text-gray-600 dark:text-gray-400">
                        {edge.relationship} → {connectedNode?.label}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Graph statistics */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {graphData?.nodes?.length || 0}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Entities</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {graphData?.edges?.length || 0}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Relationships</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {graphData?.topics?.length || 0}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Topics</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {graphData?.action_items?.length || 0}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Actions</div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeGraph;
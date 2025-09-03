import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Play, 
  Pause, 
  Volume2, 
  Download, 
  Copy, 
  Check,
  User,
  Clock,
  Mic
} from 'lucide-react';

const TranscriptViewer = ({ transcript, meetingId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('all');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [copied, setCopied] = useState(false);
  const transcriptRef = useRef(null);

  // Parse transcript into segments (assuming it's formatted with timestamps and speakers)
  const parseTranscript = (rawTranscript) => {
    if (!rawTranscript) return [];
    
    // This is a simple parser - in production, you'd have a more sophisticated format
    const lines = rawTranscript.split('\n').filter(line => line.trim());
    return lines.map((line, index) => {
      // Try to extract timestamp and speaker from line
      const timestampMatch = line.match(/(\d{2}:\d{2}:\d{2})/);
      const speakerMatch = line.match(/^([A-Za-z\s]+):/);
      
      return {
        id: index,
        timestamp: timestampMatch ? timestampMatch[1] : `00:${Math.floor(index / 10).toString().padStart(2, '0')}:${(index % 10 * 6).toString().padStart(2, '0')}`,
        speaker: speakerMatch ? speakerMatch[1].trim() : `Speaker ${(index % 3) + 1}`,
        text: line.replace(/^\d{2}:\d{2}:\d{2}\s*/, '').replace(/^[A-Za-z\s]+:\s*/, '').trim() || line,
        confidence: 0.85 + Math.random() * 0.15 // Mock confidence score
      };
    });
  };

  const transcriptSegments = parseTranscript(transcript);
  const speakers = [...new Set(transcriptSegments.map(segment => segment.speaker))];

  // Filter segments based on search and speaker
  const filteredSegments = transcriptSegments.filter(segment => {
    const matchesSearch = !searchTerm || 
      segment.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      segment.speaker.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSpeaker = selectedSpeaker === 'all' || segment.speaker === selectedSpeaker;
    
    return matchesSearch && matchesSpeaker;
  });

  const handleCopyTranscript = async () => {
    try {
      const textToCopy = filteredSegments
        .map(segment => `${segment.timestamp} - ${segment.speaker}: ${segment.text}`)
        .join('\n');
      
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy transcript:', error);
    }
  };

  const highlightSearchTerm = (text) => {
    if (!searchTerm) return text;
    
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-700 px-1 rounded">$1</mark>');
  };

  const getSpeakerColor = (speaker) => {
    const colors = [
      'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
      'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
      'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300',
      'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300',
      'bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300'
    ];
    const index = speakers.indexOf(speaker) % colors.length;
    return colors[index];
  };

  if (!transcript) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
        <Mic className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No Transcript Available
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          The transcript for this meeting is not yet available or is still being processed.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
      {/* Header with controls */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Meeting Transcript
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {transcriptSegments.length} segments • {speakers.length} speakers
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleCopyTranscript}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span className="text-sm">{copied ? 'Copied!' : 'Copy'}</span>
            </button>

            <button className="flex items-center space-x-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">
              <Download className="w-4 h-4" />
              <span className="text-sm">Export</span>
            </button>
          </div>
        </div>

        {/* Search and Filter Controls */}
        <div className="flex flex-col md:flex-row gap-4 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search transcript..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <select
            value={selectedSpeaker}
            onChange={(e) => setSelectedSpeaker(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Speakers</option>
            {speakers.map(speaker => (
              <option key={speaker} value={speaker}>
                {speaker}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Transcript Content */}
      <div className="p-6">
        {filteredSegments.length > 0 ? (
          <div ref={transcriptRef} className="space-y-4 max-h-96 overflow-y-auto">
            {filteredSegments.map((segment) => (
              <div
                key={segment.id}
                className="flex items-start space-x-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors group"
              >
                {/* Timestamp */}
                <div className="flex-shrink-0 w-20">
                  <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
                    <Clock className="w-3 h-3" />
                    <span>{segment.timestamp}</span>
                  </div>
                </div>

                {/* Speaker */}
                <div className="flex-shrink-0 w-32">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getSpeakerColor(segment.speaker)}`}>
                    <User className="w-3 h-3 mr-1" />
                    {segment.speaker}
                  </span>
                </div>

                {/* Text Content */}
                <div className="flex-1">
                  <p 
                    className="text-gray-900 dark:text-white leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: highlightSearchTerm(segment.text) }}
                  />
                  
                  {/* Confidence indicator */}
                  <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center space-x-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Confidence: {(segment.confidence * 100).toFixed(0)}%
                      </div>
                      <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-1">
                        <div 
                          className="bg-green-500 h-1 rounded-full transition-all duration-300"
                          style={{ width: `${segment.confidence * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                    <Play className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No Results Found
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Try adjusting your search terms or speaker filter
            </p>
          </div>
        )}
      </div>

      {/* Summary footer */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 rounded-b-2xl border-t border-gray-200 dark:border-gray-600">
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>
            Showing {filteredSegments.length} of {transcriptSegments.length} segments
          </span>
          <span>
            Total words: {filteredSegments.reduce((total, segment) => total + segment.text.split(' ').length, 0)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TranscriptViewer;
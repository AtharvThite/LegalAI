import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Play, 
  Pause, 
  Volume2, 
  Copy, 
  Check,
  User,
  Clock,
  Mic,
  VolumeX,
  Square
} from 'lucide-react';

const TranscriptViewer = ({ transcript, documentId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isTTSPlaying, setIsTTSPlaying] = useState(false);
  const [currentTTSSegment, setCurrentTTSSegment] = useState(null);
  const [isGlobalTTSPlaying, setIsGlobalTTSPlaying] = useState(false);
  const transcriptRef = useRef(null);
  const ttsRef = useRef(null);
  const isManuallyStopped = useRef(false); // Add this ref to track manual stops

  // Parse document content into segments (assuming it's formatted with timestamps or paragraphs)
  const parseTranscript = (rawTranscript) => {
    if (!rawTranscript) return [];

    // Split by paragraphs or lines for document content
    const paragraphs = rawTranscript.split('\n\n').filter(para => para.trim());
    const segments = [];
    
    paragraphs.forEach((paragraph, index) => {
      segments.push({
        id: index,
        timestamp: `Section ${index + 1}`,  // Use section numbers instead of timestamps
        text: paragraph.trim(),
        confidence: 0.9  // Default; adjust if real data is available
      });
    });
    
    return segments;
  };

  const transcriptSegments = parseTranscript(transcript);

  // Filter segments based on search
  const filteredSegments = transcriptSegments.filter(segment => {
    const matchesSearch = !searchTerm || 
      segment.text.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  // TTS Functions
  const playTTSSegment = (text, segmentId) => {
    if ('speechSynthesis' in window) {
      // If this segment is currently playing, stop it
      if (currentTTSSegment === segmentId && isTTSPlaying) {
        stopTTS();
        return;
      }
      
      // Stop any current TTS
      stopTTS();
      
      // Reset the manual stop flag
      isManuallyStopped.current = false;
      
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Configure voice settings
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      // Set voice if available
      const voices = speechSynthesis.getVoices();
      const englishVoice = voices.find(voice => voice.lang.includes('en'));
      if (englishVoice) {
        utterance.voice = englishVoice;
      }
      
      utterance.onstart = () => {
        if (!isManuallyStopped.current) {
          setIsTTSPlaying(true);
          setCurrentTTSSegment(segmentId);
        }
      };
      
      utterance.onend = () => {
        // Only reset states if not manually stopped
        if (!isManuallyStopped.current) {
          setIsTTSPlaying(false);
          setCurrentTTSSegment(null);
        }
      };
      
      utterance.onerror = () => {
        setIsTTSPlaying(false);
        setCurrentTTSSegment(null);
      };
      
      ttsRef.current = utterance;
      speechSynthesis.speak(utterance);
    } else {
      alert('Text-to-speech is not supported in your browser.');
    }
  };

  const playGlobalTTS = () => {
    if ('speechSynthesis' in window) {
      if (isGlobalTTSPlaying) {
        stopTTS();
        return;
      }
      
      // Create full text from filtered segments
      const fullText = filteredSegments
        .map(segment => segment.text)
        .join('. ');
      
      if (!fullText.trim()) {
        alert('No content to read.');
        return;
      }
      
      // Reset the manual stop flag
      isManuallyStopped.current = false;
      
      const utterance = new SpeechSynthesisUtterance(fullText);
      
      // Configure voice settings
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      // Set voice if available
      const voices = speechSynthesis.getVoices();
      const englishVoice = voices.find(voice => voice.lang.includes('en'));
      if (englishVoice) {
        utterance.voice = englishVoice;
      }
      
      utterance.onstart = () => {
        if (!isManuallyStopped.current) {
          setIsGlobalTTSPlaying(true);
        }
      };
      
      utterance.onend = () => {
        if (!isManuallyStopped.current) {
          setIsGlobalTTSPlaying(false);
        }
      };
      
      utterance.onerror = () => {
        setIsGlobalTTSPlaying(false);
      };
      
      ttsRef.current = utterance;
      speechSynthesis.speak(utterance);
    } else {
      alert('Text-to-speech is not supported in your browser.');
    }
  };

  const stopTTS = () => {
    if ('speechSynthesis' in window) {
      // Set the manual stop flag before canceling
      isManuallyStopped.current = true;
      
      speechSynthesis.cancel();
      
      // Immediately reset all states
      setIsTTSPlaying(false);
      setCurrentTTSSegment(null);
      setIsGlobalTTSPlaying(false);
      
      // Clear the TTS reference
      ttsRef.current = null;
    }
  };

  // Clean up TTS on component unmount
  useEffect(() => {
    return () => {
      isManuallyStopped.current = true;
      if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
      }
    };
  }, []);

  const handleCopyTranscript = async () => {
    try {
      const textToCopy = filteredSegments
        .map(segment => `${segment.timestamp}: ${segment.text}`)
        .join('\n\n');
      
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

  // Helper function to format section numbers
  const formatTimestamp = (timestamp) => {
    return timestamp;  // Section numbers are already formatted
  };

  if (!transcript) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
        <Mic className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No Document Content Available
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          The content for this document is not yet available or is still being processed.
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
              Document Content
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {transcriptSegments.length} sections
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center space-x-3">
            {/* Global TTS Button */}
            <button
              onClick={playGlobalTTS}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                isGlobalTTSPlaying
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50'
                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50'
              }`}
              title={isGlobalTTSPlaying ? 'Stop reading' : 'Listen to transcript'}
            >
              {isGlobalTTSPlaying ? (
                <>
                  <Square className="w-4 h-4" />
                  <span className="text-sm">Stop</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  <span className="text-sm">Listen</span>
                </>
              )}
            </button>

            {/* Copy Button */}
            <button
              onClick={handleCopyTranscript}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-lg transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span className="text-sm">{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Search Controls */}
        <div className="flex flex-col md:flex-row gap-4 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search document content..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Transcript Content */}
      <div className="p-6">
        {filteredSegments.length > 0 ? (
          <div ref={transcriptRef} className="space-y-4 max-h-96 overflow-y-auto">
            {filteredSegments.map((segment) => (
              <div
                key={segment.id}
                className={`flex items-start space-x-4 p-4 rounded-lg transition-all duration-200 group ${
                  currentTTSSegment === segment.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {/* Section */}
                <div className="flex-shrink-0 w-24">
                  <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>{formatTimestamp(segment.timestamp)}</span>
                  </div>
                </div>

                {/* Text Content */}
                <div className="flex-1">
                  <p 
                    className="text-gray-900 dark:text-white leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: highlightSearchTerm(segment.text) }}
                  />
                  
                  {/* Confidence indicator */}
                  <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Section {segment.id + 1} of {transcriptSegments.length}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => playTTSSegment(segment.text, segment.id)}
                    className={`p-1 rounded transition-colors ${
                      currentTTSSegment === segment.id && isTTSPlaying
                        ? 'text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300'
                        : 'text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
                    }`}
                    title={
                      currentTTSSegment === segment.id && isTTSPlaying
                        ? 'Stop playing'
                        : 'Play this segment'
                    }
                  >
                    {currentTTSSegment === segment.id && isTTSPlaying ? (
                      <Square className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
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
            Showing {filteredSegments.length} of {transcriptSegments.length} sections
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
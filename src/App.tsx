import React, { useState, useEffect } from 'react';
import { 
  Youtube, 
  Search, 
  Music, 
  Download, 
  History, 
  AlertCircle, 
  CheckCircle2, 
  Trash2, 
  Loader2, 
  RefreshCw 
} from 'lucide-react';

interface VideoInfo {
  title: string;
  channel: string;
  duration: string;
  durationSeconds: number;
  thumbnail: string;
  webpageUrl: string;
}

interface HistoryItem {
  id: string;
  title: string;
  channel: string;
  duration: string;
  thumbnail: string;
  bitrate: string;
  date: string;
}

const YOUTUBE_REGEX = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

export default function App() {
  const [url, setUrl] = useState('');
  const [quality, setQuality] = useState('192');
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Conversion process states
  const [_jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<'pending' | 'downloading' | 'converting' | 'completed' | 'failed' | null>(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobError, setJobError] = useState<string | null>(null);

  // Persistent Download History
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Load history on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('aether_converter_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        localStorage.removeItem('aether_converter_history');
      }
    }
  }, []);

  // Save history helper
  const saveToHistory = (item: HistoryItem) => {
    const updated = [item, ...history.filter(h => h.id !== item.id)].slice(0, 10);
    setHistory(updated);
    localStorage.setItem('aether_converter_history', JSON.stringify(updated));
  };

  // Clear history helper
  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('aether_converter_history');
  };

  // Watch URL input to fetch metadata automatically when a valid URL is pasted
  useEffect(() => {
    const match = url.match(YOUTUBE_REGEX);
    if (match) {
      fetchVideoInfo(url);
    } else {
      setVideoInfo(null);
      setError(null);
    }
  }, [url]);

  // Fetch video metadata
  const fetchVideoInfo = async (videoUrl: string) => {
    setIsLoadingInfo(true);
    setError(null);
    try {
      const response = await fetch(`/api/info?url=${encodeURIComponent(videoUrl)}`);
      const data = await response.json();
      if (response.ok) {
        setVideoInfo(data);
      } else {
        setError(data.error || 'Failed to fetch video details.');
      }
    } catch (err) {
      setError('Server unreachable. Make sure the backend dev server is running.');
    } finally {
      setIsLoadingInfo(false);
    }
  };

  // Handle URL Paste / Typing
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
  };

  // Submit and start conversion
  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoInfo) return;

    setJobId(null);
    setJobStatus('pending');
    setJobProgress(0);
    setJobError(null);

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          quality,
          metadata: videoInfo
        })
      });
      const data = await response.json();

      if (response.ok && data.jobId) {
        setJobId(data.jobId);
        pollProgress(data.jobId);
      } else {
        setJobStatus('failed');
        setJobError(data.error || 'Failed to initiate converter.');
      }
    } catch (err) {
      setJobStatus('failed');
      setJobError('Failed to establish contact with converter backend.');
    }
  };

  // Poll progress from Express backend
  const pollProgress = (id: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/progress/${id}`);
        const data = await response.json();

        if (!response.ok) {
          clearInterval(interval);
          setJobStatus('failed');
          setJobError(data.error || 'Progress polling failed.');
          return;
        }

        setJobStatus(data.status);
        setJobProgress(data.progress);

        if (data.status === 'completed') {
          clearInterval(interval);
          
          // Trigger file download
          triggerDownload(id);

          // Add to browser history
          if (videoInfo) {
            saveToHistory({
              id,
              title: videoInfo.title,
              channel: videoInfo.channel,
              duration: videoInfo.duration,
              thumbnail: videoInfo.thumbnail,
              bitrate: `${quality}kbps`,
              date: new Date().toLocaleDateString(),
            });
          }
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setJobError(data.error || 'Conversion failed.');
        }
      } catch (err) {
        clearInterval(interval);
        setJobStatus('failed');
        setJobError('Lost connection with backend server.');
      }
    }, 850);
  };

  // Triggers the download attachment
  const triggerDownload = (id: string) => {
    const link = document.createElement('a');
    link.href = `/api/download/${id}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Re-download from local cache if complete
  const handleRedownload = (id: string) => {
    triggerDownload(id);
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header>
        <div className="logo-container">
          <div className="logo-icon">
            <Music size={24} />
          </div>
          <h1 className="logo-text">AetherMP3</h1>
        </div>
        <p className="subtitle">
          An elegant, high-fidelity application that downloads and transcodes YouTube videos to MP3 directly on your machine.
        </p>
      </header>

      {/* Main Converter Card */}
      <main className="glass-panel converter-box">
        <form onSubmit={handleConvert} className="input-group">
          <label htmlFor="yt-url-input" className="input-label">
            YouTube Video Link
          </label>
          <div className="input-wrapper">
            <Search className="input-icon" size={20} />
            <input
              id="yt-url-input"
              type="text"
              className="url-input"
              placeholder="Paste YouTube video or Shorts link here..."
              value={url}
              onChange={handleUrlChange}
              disabled={jobStatus === 'downloading' || jobStatus === 'converting'}
            />
          </div>
        </form>

        {/* Video Preview Section */}
        {isLoadingInfo && (
          <div className="preview-card" style={{ justifyContent: 'center', padding: '2rem' }}>
            <Loader2 className="spinner" size={28} style={{ color: 'var(--color-primary)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Retrieving video details...</span>
          </div>
        )}

        {error && (
          <div className="error-banner">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        {videoInfo && !isLoadingInfo && (
          <div className="preview-card">
            <img 
              src={videoInfo.thumbnail} 
              alt={videoInfo.title} 
              className="preview-thumbnail" 
            />
            <div className="preview-details">
              <h3 className="preview-title">{videoInfo.title}</h3>
              <p className="preview-channel">{videoInfo.channel}</p>
              <span className="preview-duration">{videoInfo.duration}</span>
            </div>
          </div>
        )}

        {/* Controls Option */}
        <div className="controls-row">
          <div className="select-wrapper">
            <label htmlFor="quality-selector" className="input-label" style={{ display: 'block', marginBottom: '0.75rem' }}>
              Audio Quality
            </label>
            <select
              id="quality-selector"
              className="quality-select"
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              disabled={jobStatus === 'downloading' || jobStatus === 'converting'}
            >
              <option value="320">320 kbps (High Fidelity)</option>
              <option value="256">256 kbps (Excellent)</option>
              <option value="192">192 kbps (Standard Quality)</option>
              <option value="128">128 kbps (Compact Size)</option>
            </select>
          </div>

          <button
            id="convert-submit-btn"
            type="button"
            onClick={handleConvert}
            className="action-button"
            disabled={!videoInfo || jobStatus === 'downloading' || jobStatus === 'converting'}
          >
            {jobStatus === 'downloading' || jobStatus === 'converting' ? (
              <>
                <RefreshCw className="spinner" size={20} />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Youtube size={20} />
                <span>Convert to MP3</span>
              </>
            )}
          </button>
        </div>

        {/* Conversion Progress Box */}
        {(jobStatus === 'downloading' || jobStatus === 'converting') && (
          <div className="progress-panel">
            <div className="progress-header">
              <span className="progress-status">
                <Loader2 className="spinner" size={16} />
                {jobStatus === 'downloading' ? 'Downloading audio track...' : 'Converting to MP3 format...'}
              </span>
              <span className="progress-percent">{jobProgress}%</span>
            </div>
            <div className="progress-bar-container">
              <div 
                className="progress-bar-fill" 
                style={{ width: `${jobProgress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Success / Finished Box */}
        {jobStatus === 'completed' && (
          <div className="success-panel">
            <div className="success-icon">
              <CheckCircle2 size={28} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>Conversion Complete!</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                Your high-fidelity MP3 has been downloaded to your computer.
              </p>
            </div>
          </div>
        )}

        {/* Conversion Error */}
        {jobStatus === 'failed' && jobError && (
          <div className="error-banner">
            <AlertCircle size={20} />
            <span>Conversion failed: {jobError}</span>
          </div>
        )}
      </main>

      {/* History Dashboard */}
      <section className="history-section">
        <div className="history-title-row">
          <h2 className="history-heading">
            <History size={20} style={{ color: 'var(--color-primary)' }} />
            <span>Recent Conversions</span>
          </h2>
          {history.length > 0 && (
            <button 
              id="clear-history-button"
              type="button"
              onClick={clearHistory} 
              className="clear-history-btn"
            >
              <Trash2 size={15} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
              Clear Recent
            </button>
          )}
        </div>

        <div className="history-list">
          {history.length === 0 ? (
            <div className="history-empty">
              Your conversion history is empty. Paste a link above to get started!
            </div>
          ) : (
            history.map((item) => (
              <div key={item.id} className="history-item">
                <div className="history-item-details">
                  <img src={item.thumbnail} alt={item.title} style={{ width: '64px', aspectRatio: '16/9', borderRadius: '6px', objectFit: 'cover' }} />
                  <div className="history-item-text">
                    <h4 className="history-item-title">{item.title}</h4>
                    <div className="history-item-meta">
                      <span>{item.channel}</span>
                      <span>•</span>
                      <span>{item.duration}</span>
                      <span>•</span>
                      <span style={{ color: 'var(--color-accent)' }}>{item.bitrate}</span>
                    </div>
                  </div>
                </div>
                <button
                  id={`redownload-${item.id}`}
                  type="button"
                  onClick={() => handleRedownload(item.id)}
                  className="history-download-btn"
                  title="Download again"
                >
                  <Download size={18} />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Footer */}
      <footer>
        <p>© {new Date().getFullYear()} AetherMP3. All rights reserved. Created locally for non-commercial use.</p>
      </footer>
    </div>
  );
}

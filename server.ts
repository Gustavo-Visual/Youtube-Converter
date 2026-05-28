import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { create as createYoutubeDl } from 'youtube-dl-exec';
import ffmpegPath from 'ffmpeg-static';

const app = express();
const PORT = process.env.PORT || 3501;

// Ensure temporary directory exists
const TEMP_DIR = path.resolve(process.cwd(), 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

let youtubedl: any;

const YT_DLP_PATH = path.resolve(TEMP_DIR, 'yt-dlp');

async function ensureYtDlpBinary(): Promise<string> {
  if (fs.existsSync(YT_DLP_PATH)) {
    return YT_DLP_PATH;
  }

  console.log('Downloading standalone yt-dlp binary for macOS...');
  const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download yt-dlp binary: ${response.statusText}`);
  }
  
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(YT_DLP_PATH, buffer);
  
  // Make it executable
  fs.chmodSync(YT_DLP_PATH, 0o755);
  console.log('Standalone yt-dlp binary successfully installed at:', YT_DLP_PATH);
  
  return YT_DLP_PATH;
}

app.use(cors());
app.use(express.json());

// Serve static frontend files in production
const DIST_DIR = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}

interface DownloadJob {
  id: string;
  url: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail: string;
  status: 'pending' | 'downloading' | 'converting' | 'completed' | 'failed';
  progress: number;
  fileName?: string;
  error?: string;
}

const jobs = new Map<string, DownloadJob>();

// Sanitize filename for safe system saving and attachment headers
function sanitizeFileName(name: string): string {
  return name.replace(/[^\w\s\-\.]/gi, '').replace(/\s+/g, '_').trim() || 'audio';
}

// Format duration from seconds to MM:SS
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// 1. Fetch metadata endpoint
app.get('/api/info', async (req, res) => {
  const { url } = req.query;
  console.log('[API] Received request for info. URL:', url);
  if (!url || typeof url !== 'string') {
    console.warn('[API] Warning: Invalid or missing URL.');
    return res.status(400).json({ error: 'URL parameter is required.' });
  }

  try {
    // Extract metadata without downloading
    console.log('[API] Invoking yt-dlp to extract metadata...');
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      noPlaylist: true,
      addHeader: ['referer:youtube.com', 'user-agent:googlebot']
    } as any) as any;

    console.log('[API] Successfully retrieved metadata. Title:', info.title);
    return res.json({
      title: info.title,
      channel: info.uploader || info.channel || 'Unknown Channel',
      duration: formatDuration(info.duration || 0),
      durationSeconds: info.duration || 0,
      thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails.length > 0 ? info.thumbnails[info.thumbnails.length - 1].url : ''),
      webpageUrl: info.webpage_url || url,
    });
  } catch (error: any) {
    console.error('[API] Error fetching video info:', error);
    return res.status(500).json({ error: error.message || 'Failed to retrieve video information.' });
  }
});

// 2. Start conversion endpoint
app.post('/api/convert', async (req, res) => {
  const { url, quality = '192', metadata } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required.' });
  }

  const jobId = crypto.randomUUID();
  
  // Set default initial job state
  const job: DownloadJob = {
    id: jobId,
    url,
    title: metadata?.title || 'Audio File',
    channel: metadata?.channel || 'YouTube Video',
    duration: metadata?.durationSeconds || 0,
    thumbnail: metadata?.thumbnail || '',
    status: 'pending',
    progress: 0,
  };

  jobs.set(jobId, job);

  // Send back jobId immediately so frontend can poll progress
  res.json({ jobId });

  // Execute download and transcoding in the background
  try {
    if (!ffmpegPath) {
      throw new Error('FFmpeg binary could not be loaded via ffmpeg-static.');
    }

    job.status = 'downloading';
    
    // Run yt-dlp subprocess with progress templates
    const subprocess = youtubedl.exec(url, {
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: quality,
      ffmpegLocation: ffmpegPath,
      output: path.join(TEMP_DIR, `${jobId}.%(ext)s`),
      progressTemplate: '%(progress)j',
      noPlaylist: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ['referer:youtube.com', 'user-agent:googlebot']
    } as any);

    subprocess.stdout?.on('data', (data: any) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const progressObj = JSON.parse(line.trim());
          if (progressObj.status === 'downloading') {
            const downloaded = progressObj.downloaded_bytes || 0;
            const total = progressObj.total_bytes || progressObj.total_bytes_estimate || 0;
            if (total > 0) {
              // Reserve 0-90% progress for downloading
              job.progress = Math.round((downloaded / total) * 90);
            }
          } else if (progressObj.status === 'finished') {
            job.status = 'converting';
            job.progress = 90;
          }
        } catch (e) {
          // Ignore lines that aren't valid JSON progress statements
        }
      }
    });

    subprocess.on('close', (code: number | null) => {
      if (code === 0) {
        // Double-check if file was generated
        const expectedFilePath = path.join(TEMP_DIR, `${jobId}.mp3`);
        if (fs.existsSync(expectedFilePath)) {
          job.status = 'completed';
          job.progress = 100;
          job.fileName = `${sanitizeFileName(job.title)}.mp3`;
        } else {
          job.status = 'failed';
          job.error = 'Expected MP3 output was not found on disk.';
        }
      } else {
        job.status = 'failed';
        job.error = `Subprocess closed with exit code ${code}`;
      }
    });

    subprocess.on('error', (err: any) => {
      console.error('Subprocess execution error:', err);
      job.status = 'failed';
      job.error = err.message || 'Background downloader encountered an error.';
    });

  } catch (err: any) {
    console.error('Job initiation error:', err);
    job.status = 'failed';
    job.error = err.message || 'Failed to start conversion job.';
  }

  return;
});

// 3. Status endpoint
app.get('/api/progress/:id', (req, res) => {
  const { id } = req.params;
  const job = jobs.get(id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  return res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    error: job.error,
  });
});

// 4. Download file endpoint
app.get('/api/download/:id', (req, res) => {
  const { id } = req.params;
  const job = jobs.get(id);

  if (!job) {
    return res.status(404).send('Download job not found.');
  }

  if (job.status !== 'completed') {
    return res.status(400).send('File conversion is not finished yet.');
  }

  const filePath = path.join(TEMP_DIR, `${job.id}.mp3`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Requested file is missing on server storage.');
  }

  // Serve file as download attachment
  res.download(filePath, job.fileName || 'audio.mp3', (err) => {
    if (err) {
      console.error('Error sending file download:', err);
    }
    
    // Clean up temporary file to conserve disk space
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) {
        console.error('Error cleaning up temp file:', unlinkErr);
      }
    });

    // Remove job records from memory
    jobs.delete(id);
  });

  return;
});

// Route everything else to the index.html for React routing in production
if (fs.existsSync(DIST_DIR)) {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

async function startServer() {
  try {
    const binaryPath = await ensureYtDlpBinary();
    youtubedl = createYoutubeDl(binaryPath);
    
    app.listen(PORT, () => {
      console.log(`Backend server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Critical failure: Failed to initialize standalone yt-dlp binary:', err);
    process.exit(1);
  }
}

startServer();

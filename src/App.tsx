import React, { useEffect, useMemo, useRef, useState } from 'react';

type WorkerProgress = { ratio: number; message?: string };
type WorkerDone = { type: 'done'; data: Uint8Array };
type WorkerLog = { type: 'log'; message: string };
type WorkerError = { type: 'error'; message: string };
type WorkerEvent = WorkerProgress | WorkerDone | WorkerLog | WorkerError;

function useFfmpegWorker() {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Worker creation (currently unused due to main thread processing)
    try {
    const worker = new Worker(new URL('./workers/ffmpeg.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    return () => worker.terminate();
    } catch (error) {
      console.error('Failed to create worker:', error);
    }
  }, []);

  const encode = React.useCallback(
      async (opts: {
      file: ArrayBuffer;
      startSec: number;
      endSec: number;
      fps: number;
      width: number;
      loop: boolean;
      quality: 'low' | 'medium' | 'high';
      onProgress?: (p: WorkerProgress) => void;
    }): Promise<Uint8Array> => {
      // Import FFmpeg dynamically
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { fetchFile } = await import('@ffmpeg/util');
      
      const ffmpeg = new FFmpeg();
      
      // Set up progress reporting
      ffmpeg.on('progress', ({ progress }) => {
        opts.onProgress?.({ ratio: Math.max(0, Math.min(1, progress)) });
      });
      
      try {
        await ffmpeg.load({
          coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
          wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
        });
        
        const inputName = 'input.mp4';
        const palette = 'palette.png';
        const output = 'output.gif';
        
        const start = Math.max(0, Math.min(opts.startSec, opts.endSec - 0.1));
        const duration = Math.max(0.1, opts.endSec - start);
        
        // Quality settings
        const q = (() => {
          switch (opts.quality) {
            case 'low': return { dither: 'bayer:bayer_scale=5', scaleFlags: 'bilinear' };
            case 'high': return { dither: 'sierra2_4a', scaleFlags: 'lanczos' };
            default: return { dither: 'floyd_steinberg', scaleFlags: 'bicubic' };
          }
        })();
        
        console.log('Writing input file...');
        await ffmpeg.writeFile(inputName, await fetchFile(new Blob([opts.file])));
        
        console.log('Generating palette...');
        await ffmpeg.exec([
          '-ss', String(start),
          '-t', String(duration),
          '-i', inputName,
          '-vf', `fps=${opts.fps},scale=${opts.width}:-1:flags=${q.scaleFlags},palettegen`,
          palette,
        ]);
        
        console.log('Creating GIF...');
        const loopFlag = opts.loop ? '0' : '1';
        
        
        // Build filter complex
        const filterComplex = `fps=${opts.fps},scale=${opts.width}:-1:flags=${q.scaleFlags} [x]; [x][1:v] paletteuse=dither=${q.dither}`;
        
        console.log('Filter complex:', filterComplex);
        
        let execSuccess = false;
        try {
          console.log('Starting FFmpeg exec...');
          
        // Simple case: just the video
        console.log('Creating simple GIF...');
        await ffmpeg.exec([
          '-ss', String(opts.startSec),
          '-t', String(opts.endSec - opts.startSec),
          '-i', inputName,
          '-i', palette,
          '-lavfi', filterComplex,
          '-loop', loopFlag,
          output,
        ]);
          
          execSuccess = true;
          console.log('FFmpeg exec completed successfully');
        } catch (execError) {
          console.error('FFmpeg exec failed, trying alternative approach:', execError);
          console.error('Error details:', {
            name: (execError as Error).name,
            message: (execError as Error).message,
            stack: (execError as Error).stack
          });
        }
        
        console.log('Reading output...');
        
        // Debug: List files before trying to read
        try {
          const filesBeforeRead = await ffmpeg.listDir('/');
          console.log('Files before readFile:', filesBeforeRead);
          
          // Check if output file exists and get its details
          const outputExists = filesBeforeRead.some((file: any) => file.name === output);
          console.log('Output file exists:', outputExists);
          
          if (outputExists) {
            try {
              const fileInfo = filesBeforeRead.find((file: any) => file.name === output);
              console.log('Output file info:', fileInfo);
            } catch (infoError) {
              console.log('Could not get file info:', infoError);
            }
          }
        } catch (listError) {
          console.log('Could not list files before readFile:', listError);
        }
        
        let data: Uint8Array;
        try {
          data = (await ffmpeg.readFile(output)) as Uint8Array;
          console.log('Output file read successfully, size:', data.length);
          
          // Validate output file
          if (data.length === 0) {
            console.error('Output file is empty (0 bytes) - this indicates FFmpeg filter failure');
            throw new Error('Output file is empty (0 bytes) - FFmpeg filter may have failed silently');
          }
          
          // Validate that it's actually a GIF file
          if (data.length < 6 || data[0] !== 0x47 || data[1] !== 0x49 || data[2] !== 0x46) {
            console.error('Output file is not a valid GIF (invalid header)');
            throw new Error('Output file is not a valid GIF file');
          }
          
          console.log('GIF validation passed, size:', data.length, 'bytes');
        } catch (readError) {
          console.error('Failed to read output file:', readError);
          console.error('Read error details:', {
            name: (readError as Error).name,
            message: (readError as Error).message,
            stack: (readError as Error).stack
          });
          
          // List files to debug
          try {
            const files = await ffmpeg.listDir('/');
            console.log('Available files:', files);
          } catch (listError) {
            console.error('Failed to list files:', listError);
          }
          throw readError;
        }
        
        // Cleanup
        try {
          await ffmpeg.deleteFile(inputName);
          await ffmpeg.deleteFile(palette);
          await ffmpeg.deleteFile(output);
        } catch {}
        
        console.log('GIF creation completed');
        return data;
        
      } catch (error) {
        console.error('FFmpeg error:', error);
        throw error;
      }
    },
    []
  );

  return { encode };
}

function formatSeconds(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface TimelineProps {
  duration: number;
  start: number;
  end: number;
  onStartChange: (start: number) => void;
  onEndChange: (end: number) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
}

function Timeline({ duration, start, end, onStartChange, onEndChange, videoRef }: TimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);
  const videoUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced video position update to prevent excessive updates during dragging
  const updateVideoPosition = (time: number) => {
    if (videoUpdateTimeoutRef.current) {
      clearTimeout(videoUpdateTimeoutRef.current);
    }
    videoUpdateTimeoutRef.current = setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
    }, 50); // 50ms debounce
  };

  const handleMouseDown = (e: React.MouseEvent, type: 'start' | 'end') => {
    e.preventDefault();
    setIsDragging(type);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const time = percentage * duration;
    
    if (isDragging === 'start') {
      const newStart = Math.min(time, end - 0.1);
      onStartChange(newStart);
      // Update video to show the start of selection
      updateVideoPosition(newStart);
    } else {
      const newEnd = Math.max(time, start + 0.1);
      onEndChange(newEnd);
      // Update video to show the end of selection
      updateVideoPosition(newEnd);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(null);
    // Clear any pending video updates when dragging stops
    if (videoUpdateTimeoutRef.current) {
      clearTimeout(videoUpdateTimeoutRef.current);
      videoUpdateTimeoutRef.current = null;
    }
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const time = percentage * duration;
    
    // If clicked closer to start, move start; otherwise move end
    const startDistance = Math.abs(time - start);
    const endDistance = Math.abs(time - end);
    
    if (startDistance < endDistance) {
      const newStart = Math.min(time, end - 0.1);
      onStartChange(newStart);
      // Update video to show the start of selection
      updateVideoPosition(newStart);
    } else {
      const newEnd = Math.max(time, start + 0.1);
      onEndChange(newEnd);
      // Update video to show the end of selection
      updateVideoPosition(newEnd);
    }
  };

  const startPercentage = (start / duration) * 100;
  const endPercentage = (end / duration) * 100;
  const selectedWidth = endPercentage - startPercentage;

  return (
    <div className="timeline-container">
      <div className="timeline-labels">
        <span>0:00</span>
        <span>{formatSeconds(duration)}</span>
      </div>
      <div 
        ref={timelineRef}
        className="timeline"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleTimelineClick}
      >
        <div className="timeline-track">
          <div 
            className="timeline-selected"
            style={{
              left: `${startPercentage}%`,
              width: `${selectedWidth}%`
            }}
          />
          <div 
            className="timeline-handle timeline-handle-start"
            style={{ left: `${startPercentage}%` }}
            onMouseDown={(e) => handleMouseDown(e, 'start')}
          />
          <div 
            className="timeline-handle timeline-handle-end"
            style={{ left: `${endPercentage}%` }}
            onMouseDown={(e) => handleMouseDown(e, 'end')}
          />
        </div>
      </div>
      <div className="timeline-info">
        <span>Start: {formatSeconds(start)}</span>
        <span>End: {formatSeconds(end)}</span>
        <span>Duration: {formatSeconds(end - start)}</span>
      </div>
      <div className="timeline-preview">
        <button 
          className="btn" 
          onClick={() => {
            if (videoRef.current) {
              videoRef.current.currentTime = start;
              videoRef.current.play();
              // Pause at the end of the selection
              const handleTimeUpdate = () => {
                if (videoRef.current && videoRef.current.currentTime >= end) {
                  videoRef.current.pause();
                  videoRef.current.removeEventListener('timeupdate', handleTimeUpdate);
                }
              };
              videoRef.current.addEventListener('timeupdate', handleTimeUpdate);
            }
          }}
        >
          ▶️ Preview Selection
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [start, setStart] = useState<number>(0);
  const [end, setEnd] = useState<number>(0);
  const [fps, setFps] = useState<number>(12);
  const [width, setWidth] = useState<number>(360);
  const [loop, setLoop] = useState<boolean>(true);
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const [progress, setProgress] = useState<number>(0);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [isEncoding, setIsEncoding] = useState<boolean>(false);
  const [isSharedFile, setIsSharedFile] = useState<boolean>(false);
  
  const { encode } = useFfmpegWorker();

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      setDuration(v.duration || 0);
      setStart(0);
      setEnd(Math.min(6, v.duration || 0));
    };
    v.addEventListener('loadedmetadata', onLoaded);
    return () => v.removeEventListener('loadedmetadata', onLoaded);
  }, [objectUrl]);

  // Handle file sharing and file handling
  useEffect(() => {
    // Check if the app was opened via share target
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('shared') === 'true') {
      setIsSharedFile(true);
      // Retrieve the shared file from IndexedDB
      retrieveSharedFile();
    }

    // Handle file sharing from other apps
    const handleFileShare = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SHARED_VIDEO' && event.data.file) {
        setFile(event.data.file);
        setIsSharedFile(true);
      }
    };

    // Listen for messages from service worker
    navigator.serviceWorker?.addEventListener('message', handleFileShare);

    // Handle file opening via file handlers
    const handleFileOpen = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.file) {
        setFile(customEvent.detail.file);
        setIsSharedFile(true);
      }
    };

    // Listen for custom file open events
    window.addEventListener('file-open', handleFileOpen as EventListener);

    // Handle drag and drop for files
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const videoFile = Array.from(files).find(f => f.type.startsWith('video/'));
        if (videoFile) {
          setFile(videoFile);
          setIsSharedFile(false);
        }
      }
    };

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleFileShare);
      window.removeEventListener('file-open', handleFileOpen as EventListener);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, []);

  // Retrieve shared file from IndexedDB
  const retrieveSharedFile = async () => {
    try {
      const request = indexedDB.open('GIFMakerDB', 1);
      
      request.onerror = () => {
        console.error('Failed to open IndexedDB');
      };
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['sharedFiles'], 'readonly');
        const store = transaction.objectStore('sharedFiles');
        const getAllRequest = store.getAll();
        
        getAllRequest.onsuccess = () => {
          const files = getAllRequest.result;
          if (files.length > 0) {
            // Get the most recent file
            const latestFile = files.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
            setFile(latestFile.file);
          }
        };
        
        getAllRequest.onerror = () => {
          console.error('Failed to retrieve shared file');
        };
      };
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('sharedFiles')) {
          db.createObjectStore('sharedFiles', { keyPath: 'id' });
        }
      };
    } catch (error) {
      console.error('Error retrieving shared file:', error);
    }
  };

  // Handle file input changes
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type.startsWith('video/')) {
      setFile(selectedFile);
      setIsSharedFile(false);
    }
  };

  const estimatedFrames = useMemo(() => {
    const len = Math.max(0, end - start);
    return Math.round(len * fps);
  }, [start, end, fps]);


  async function handleExport() {
    if (!file) return;
    setGifUrl(null);
    setIsEncoding(true);
    setProgress(0);
    
    try {
      console.log('Starting GIF creation...', { start, end, fps, width, loop, quality });
      
      // Step 1: Create basic GIF from video using FFmpeg
      console.log('Step 1: Creating basic GIF from video...');
      setProgress(10);
      
      const buffer = await file.arrayBuffer();
      const basicGifData = await encode({
        file: buffer,
        startSec: start,
        endSec: end,
        fps,
        width,
        loop,
        quality,
        onProgress: (p) => {
          const progress = Math.max(0, Math.min(1, p.ratio)) * 80; // 80% for basic GIF
          setProgress(10 + progress);
        },
      });
      
      console.log('Basic GIF created, size:', basicGifData.length);
      setProgress(90);
      
      // Create GIF blob and URL
      const blob = new Blob([basicGifData], { type: 'image/gif' });
      const url = URL.createObjectURL(blob);
      setGifUrl(url);
      
      setProgress(100);
      console.log('GIF creation completed successfully');
      
    } catch (e) {
      console.error('GIF creation failed:', e);
      alert((e as Error).message ?? 'Failed to create GIF');
    } finally {
      setIsEncoding(false);
    }
  }

  function handleDownload() {
    if (!gifUrl) return;
    try {
      const a = document.createElement('a');
      a.href = gifUrl;
      a.download = `gif-${Date.now()}.gif`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Download failed. Please try again.');
    }
  }

  async function handleShare() {
    if (!gifUrl) return;
    try {
      const res = await fetch(gifUrl);
      const blob = await res.blob();
      const fileToShare = new File([blob], `gif-${Date.now()}.gif`, { type: blob.type });
      
      // Check if Web Share API is available and can share files
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [fileToShare] })) {
        await navigator.share({ 
          files: [fileToShare], 
          title: 'My GIF',
          text: 'Check out this GIF I created!'
        });
      } else {
        // Fallback to download if sharing is not supported
        handleDownload();
      }
    } catch (error) {
      console.error('Share failed:', error);
      // Fallback to download on error
      handleDownload();
    }
  }

  return (
    <div className="container"
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f && f.type.startsWith('video/')) {
          setFile(f);
          setIsSharedFile(false);
        }
      }}
    >
      <div className="app-header">
        <img src="/logo.svg" alt="Pipkin Logo" className="app-logo" />
      </div>
      {isSharedFile && (
        <div className="card" style={{ backgroundColor: '#10b981', color: 'white', marginBottom: '12px' }}>
          <div style={{ fontWeight: 'bold' }}>
            📱 Video received from another app!
          </div>
          <small>This video was shared to the GIF Maker app.</small>
        </div>
      )}
      <div className="card">
        <div className="row">
          <input
            type="file"
            accept="video/*"
            onChange={handleFileInputChange}
          />
          {file && (
            <button className="btn" onClick={() => {
              setFile(null);
              setIsSharedFile(false);
            }}>Clear</button>
          )}
        </div>
        {objectUrl && (
          <div className="grid" style={{ marginTop: 12 }}>
            <div>
              <video ref={videoRef} src={objectUrl ?? undefined} controls playsInline style={{ width: '100%' }} />
              <div className="spacer" />
              <div className="card">
                <Timeline
                  duration={duration}
                  start={start}
                  end={end}
                  onStartChange={setStart}
                  onEndChange={setEnd}
                  videoRef={videoRef}
                />
                <div className="row">
                  <small>
                    Estimated frames: {estimatedFrames}
                  </small>
                </div>
              </div>
            </div>
            <div>
              <div className="card">
                <div className="row">
                  <label>FPS</label>
                  <input type="range" min={6} max={30} step={1} value={fps} onChange={(e) => setFps(parseInt(e.target.value))} />
                  <span>{fps}</span>
                </div>
                <div className="row">
                  <label>Width</label>
                  <input type="number" min={160} max={720} step={10} value={width} onChange={(e) => setWidth(parseInt(e.target.value) || 360)} />
                </div>
                <div className="row">
                  <label>Loop</label>
                  <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
                </div>
                <div className="row">
                  <label>Quality</label>
                  <select value={quality} onChange={(e) => setQuality(e.target.value as any)}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                
                <div className="spacer" />
                <div className="row">
                  <button className="btn primary" onClick={handleExport} disabled={isEncoding}>
                    {isEncoding ? 'Encoding...' : 'Create GIF'}
                  </button>
                </div>
                {isEncoding && (
                  <div style={{ marginTop: 12 }}>
                    <div className="progress"><div style={{ width: `${progress.toFixed(1)}%` }} /></div>
                    <small>Encoding... {progress.toFixed(0)}%</small>
                  </div>
                )}
                {!isEncoding && progress > 0 && !gifUrl && (
                  <div style={{ marginTop: 12, color: '#ef4444' }}>
                    <small>Creation failed. Please try again.</small>
                  </div>
                )}
              </div>
              <div className="spacer" />
              {gifUrl && (
                <div className="card">
                  <div style={{ marginBottom: 12, color: '#10b981', fontWeight: 'bold' }}>
                    ✓ GIF Ready!
                  </div>
                  <img src={gifUrl} alt="GIF preview" style={{ maxHeight: '200px', objectFit: 'contain' }} />
                  <div className="row" style={{ marginTop: 12 }}>
                    <button className="btn" onClick={handleDownload}>💾 Download</button>
                    <button className="btn" onClick={handleShare}>📤 Share</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="spacer" />
      <p>
        All processing is done on-device in your browser. For higher quality, we use ffmpeg.wasm and palette-based GIF encoding.
      </p>
    </div>
  );
}

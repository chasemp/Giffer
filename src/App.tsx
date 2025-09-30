import React, { useEffect, useMemo, useRef, useState } from 'react';

type WorkerProgress = { ratio: number; message?: string };
type WorkerDone = { type: 'done'; data: Uint8Array };
type WorkerLog = { type: 'log'; message: string };
type WorkerEvent = WorkerProgress | WorkerDone | WorkerLog;

function useFfmpegWorker() {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('./workers/ffmpeg.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const encode = React.useCallback(
    (opts: {
      file: ArrayBuffer;
      startSec: number;
      endSec: number;
      fps: number;
      width: number;
      loop: boolean;
      quality: 'low' | 'medium' | 'high';
      onProgress?: (p: WorkerProgress) => void;
    }): Promise<Uint8Array> => {
      return new Promise((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) return reject(new Error('Worker not ready'));
        const handleMessage = (ev: MessageEvent<WorkerEvent>) => {
          const data = ev.data;
          if ('ratio' in data) {
            opts.onProgress?.(data);
            return;
          }
          if (data.type === 'log') {
            return; // could surface logs if needed
          }
          if (data.type === 'done') {
            worker.removeEventListener('message', handleMessage as any);
            resolve(data.data);
          }
        };
        worker.addEventListener('message', handleMessage as any);
        worker.postMessage({
          type: 'encode',
          payload: {
            file: opts.file,
            startSec: opts.startSec,
            endSec: opts.endSec,
            fps: opts.fps,
            width: opts.width,
            loop: opts.loop,
            quality: opts.quality,
          },
        }, [opts.file as any]);
      });
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
}

function Timeline({ duration, start, end, onStartChange, onEndChange }: TimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);

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
      onStartChange(Math.min(time, end - 0.1));
    } else {
      onEndChange(Math.max(time, start + 0.1));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(null);
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
      onStartChange(Math.min(time, end - 0.1));
    } else {
      onEndChange(Math.max(time, start + 0.1));
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
    const buffer = await file.arrayBuffer();
    try {
      console.log('Starting GIF encoding...', { start, end, fps, width, loop, quality });
      const data = await encode({
        file: buffer,
        startSec: start,
        endSec: end,
        fps,
        width,
        loop,
        quality,
        onProgress: (p) => {
          console.log('Encoding progress:', p.ratio);
          setProgress(Math.max(0, Math.min(1, p.ratio)) * 100);
        },
      });
      console.log('Encoding completed, data size:', data.length);
      const blob = new Blob([data], { type: 'image/gif' });
      const url = URL.createObjectURL(blob);
      console.log('GIF URL created:', url);
      setGifUrl(url);
    } catch (e) {
      console.error('Encoding failed:', e);
      alert((e as Error).message ?? 'Failed to encode GIF');
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
                    {isEncoding ? 'Encoding...' : 'Export GIF'}
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
                    <small>Export failed. Please try again.</small>
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

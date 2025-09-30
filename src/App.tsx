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
        if (f && f.type.startsWith('video/')) setFile(f);
      }}
    >
      <h1>PWA GIF Maker</h1>
      <div className="card">
        <div className="row">
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <button className="btn" onClick={() => setFile(null)}>Clear</button>
          )}
        </div>
        {objectUrl && (
          <div className="grid" style={{ marginTop: 12 }}>
            <div>
              <video ref={videoRef} src={objectUrl ?? undefined} controls playsInline style={{ width: '100%' }} />
              <div className="spacer" />
              <div className="card">
                <div className="row">
                  <label>Start: {formatSeconds(start)}</label>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, duration - 0.1)}
                    step={0.1}
                    value={Math.min(start, end)}
                    onChange={(e) => setStart(Math.min(parseFloat(e.target.value), end))}
                  />
                </div>
                <div className="row">
                  <label>End: {formatSeconds(end)}</label>
                  <input
                    type="range"
                    min={start + 0.1}
                    max={duration}
                    step={0.1}
                    value={end}
                    onChange={(e) => setEnd(Math.max(parseFloat(e.target.value), start + 0.1))}
                  />
                </div>
                <div className="row">
                  <small>
                    Segment length: {formatSeconds(Math.max(0, end - start))} • Estimated frames: {estimatedFrames}
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

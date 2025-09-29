// Worker context
import { createFFmpeg, fetchFile, FFmpeg } from '@ffmpeg/ffmpeg';

let ffmpeg: FFmpeg | null = null;
let isLoading = false;

function pickQualitySettings(q: 'low' | 'medium' | 'high') {
  switch (q) {
    case 'low':
      return { dither: 'bayer:bayer_scale=5', scaleFlags: 'bilinear' };
    case 'high':
      return { dither: 'sierra2_4a', scaleFlags: 'lanczos' };
    default:
      return { dither: 'floyd_steinberg', scaleFlags: 'bicubic' };
  }
}

async function ensureFfmpeg() {
  if (ffmpeg) return ffmpeg;
  if (isLoading) {
    while (!ffmpeg) {
      await new Promise((r) => setTimeout(r, 50));
    }
    return ffmpeg!;
  }
  isLoading = true;
  ffmpeg = createFFmpeg({
    corePath: undefined, // let the package resolve its core; can be swapped for CDN if needed
    log: false,
    progress: ({ ratio }) => {
      (self as any).postMessage({ ratio });
    },
  });
  await ffmpeg.load();
  isLoading = false;
  return ffmpeg;
}

type EncodePayload = {
  file: ArrayBuffer;
  startSec: number;
  endSec: number;
  fps: number;
  width: number;
  loop: boolean;
  quality: 'low' | 'medium' | 'high';
};

self.addEventListener('message', async (ev: MessageEvent) => {
  const { type, payload } = ev.data || {};
  if (type !== 'encode') return;
  const p = payload as EncodePayload;
  try {
    const ff = await ensureFfmpeg();
    const inputName = 'input.mp4';
    const palette = 'palette.png';
    const output = 'output.gif';

    const start = Math.max(0, Math.min(p.startSec, p.endSec - 0.1));
    const duration = Math.max(0.1, p.endSec - start);
    const q = pickQualitySettings(p.quality);

    ff.FS('writeFile', inputName, await fetchFile(new Blob([p.file])));

    // 1) Generate palette with scaling and fps
    await ff.run(
      '-ss', String(start),
      '-t', String(duration),
      '-i', inputName,
      '-vf', `fps=${p.fps},scale=${p.width}:-1:flags=${q.scaleFlags},palettegen`,
      palette
    );

    // 2) Use palette to create final GIF
    const loopFlag = p.loop ? '0' : '1';
    await ff.run(
      '-ss', String(start),
      '-t', String(duration),
      '-i', inputName,
      '-i', palette,
      '-lavfi', `fps=${p.fps},scale=${p.width}:-1:flags=${q.scaleFlags} [x]; [x][1:v] paletteuse=dither=${q.dither}`,
      '-loop', loopFlag,
      output
    );

    const data = ff.FS('readFile', output);
    (self as any).postMessage({ type: 'done', data }, [data.buffer]);

    // cleanup
    try {
      ff.FS('unlink', inputName);
      ff.FS('unlink', palette);
      ff.FS('unlink', output);
    } catch {}
  } catch (err: any) {
    (self as any).postMessage({ ratio: 1, message: err?.message || 'encode failed' });
  }
});


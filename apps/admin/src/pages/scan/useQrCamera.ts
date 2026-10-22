import { useCallback, useEffect, useRef, useState } from 'react';
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

/**
 * The phone's back camera, read for QR codes as fast as frames arrive.
 *
 * Chrome on Android has a built-in decoder (BarcodeDetector). iPhones and
 * desktop Firefox don't, so they get ZXing compiled to WebAssembly, served
 * from this site (the library would otherwise fetch it from a CDN). Only the
 * centre of the frame is decoded, at most 720px across: that's where the
 * ticket is held, and it keeps each frame to a few milliseconds.
 */

interface Detected { rawValue: string }
interface Detector { detect(source: CanvasImageSource): Promise<Detected[]> }
interface DetectorClass {
  new (options?: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

export type DecoderEngine = 'native' | 'wasm';

async function createDetector(): Promise<{ detector: Detector; engine: DecoderEngine }> {
  const Native = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (Native) {
    try {
      if ((await Native.getSupportedFormats()).includes('qr_code')) {
        return { detector: new Native({ formats: ['qr_code'] }), engine: 'native' };
      }
    } catch {
      // Present but broken (some desktop builds): fall back to WebAssembly.
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? zxingWasmUrl : prefix + path) },
  });
  return { detector: new BarcodeDetector({ formats: ['qr_code'] }) as unknown as Detector, engine: 'wasm' };
}

function cameraError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access was blocked. Allow the camera for this site in the browser’s settings, then reload.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.';
  if (name === 'NotReadableError') return 'The camera is in use by another app. Close it and try again.';
  return 'The camera couldn’t start. Reload the page and try again.';
}

export function useQrCamera(enabled: boolean, onDetect: (text: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [engine, setEngine] = useState<DecoderEngine | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let frame = 0;

    (async () => {
      setError('');
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(window.isSecureContext
          ? 'This browser can’t use the camera.'
          : 'The camera only works over https. Open the admin through its https address.');
        return;
      }
      try {
        const [{ detector, engine: kind }, media] = await Promise.all([
          createDetector(),
          navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          }),
        ]);
        stream = media;
        if (stopped) { media.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = media;
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        await video.play();
        const track = media.getVideoTracks()[0];
        trackRef.current = track;
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorchSupported(caps.torch === true);
        setEngine(kind);
        setRunning(true);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const tick = async () => {
          if (stopped) return;
          if (ctx && video.readyState >= 2 && video.videoWidth > 0) {
            const side = Math.round(Math.min(video.videoWidth, video.videoHeight) * 0.85);
            const size = Math.min(side, 720);
            if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
            ctx.drawImage(
              video,
              (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side,
              0, 0, size, size,
            );
            try {
              const codes = await detector.detect(canvas);
              const text = codes.find((c) => c.rawValue)?.rawValue;
              if (text && !stopped) onDetectRef.current(text);
            } catch {
              // A frame that can't be read; the next one usually can.
            }
          }
          frame = requestAnimationFrame(() => { void tick(); });
        };
        void tick();
      } catch (err) {
        if (!stopped) setError(cameraError(err));
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
      setRunning(false);
      setTorchOn(false);
    };
  }, [enabled]);

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }, [torchOn]);

  return { videoRef, error, running, engine, torchSupported, torchOn, toggleTorch };
}

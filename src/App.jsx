import React, { useEffect, useRef, useState } from 'react';
import { getHandDetector, getSegmenter, KPS } from './tracker.js';
import { EffectsRenderer } from './effects.js';
import { playBassDrop, playChargingHum, stopHum, resumeAudio } from './sound.js';

// Landmark indices (matching TF.js MediaPipe Hands keypoints)
const WRIST = KPS.WRIST;
const INDEX_MCP = KPS.INDEX_MCP, INDEX_PIP = KPS.INDEX_PIP, INDEX_TIP = KPS.INDEX_TIP;
const MIDDLE_MCP = KPS.MIDDLE_MCP, MIDDLE_PIP = KPS.MIDDLE_PIP, MIDDLE_TIP = KPS.MIDDLE_TIP;
const RING_PIP = KPS.RING_PIP, RING_TIP = KPS.RING_TIP;
const PINKY_PIP = KPS.PINKY_PIP, PINKY_TIP = KPS.PINKY_TIP;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function isExtended(lm, pip, tip) { return dist(lm[tip], lm[WRIST]) > dist(lm[pip], lm[WRIST]) * 1.08; }

function isDomainSeal(lm) {
  const ringFolded = !isExtended(lm, RING_PIP, RING_TIP);
  const pinkyFolded = !isExtended(lm, PINKY_PIP, PINKY_TIP);
  const indexUp = lm[INDEX_TIP].y < lm[INDEX_MCP].y;
  const middleUp = lm[MIDDLE_TIP].y < lm[MIDDLE_MCP].y;
  // Crossed: index tip on opposite side of middle tip relative to MCP bases
  const baseDir = lm[MIDDLE_MCP].x - lm[INDEX_MCP].x; // + in canonical hand
  const tipDir = lm[MIDDLE_TIP].x - lm[INDEX_TIP].x;
  const crossed = baseDir * tipDir < 0; // signs differ = crossed
  const tipsClose = Math.hypot(lm[INDEX_TIP].x - lm[MIDDLE_TIP].x, lm[INDEX_TIP].y - lm[MIDDLE_TIP].y) < 0.12;
  return ringFolded && pinkyFolded && indexUp && middleUp && (crossed || tipsClose);
}
const isOpenPalm = (lm) => isExtended(lm, INDEX_PIP, INDEX_TIP) && isExtended(lm, MIDDLE_PIP, MIDDLE_TIP) && isExtended(lm, RING_PIP, RING_TIP) && isExtended(lm, PINKY_PIP, PINKY_TIP);
const isPointing = (lm) => isExtended(lm, INDEX_PIP, INDEX_TIP) && !isExtended(lm, MIDDLE_PIP, MIDDLE_TIP) && !isExtended(lm, RING_PIP, RING_TIP) && !isExtended(lm, PINKY_PIP, PINKY_TIP);

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const matteRef = useRef(null);  // final user cutout (drawn over bg)
  const maskRef = useRef(null);   // raw binary mask from segmenter
  const workRef = useRef(null);   // downscaled working canvas for hand inference

  const effectsRef = useRef(null);
  const rafRef = useRef(null);
  const logRef = useRef([]);
  const logIdRef = useRef(0);

  const [phase, setPhase] = useState('idle'); // idle | loading | running | error
  const [loadMsg, setLoadMsg] = useState('Click start to begin');
  const [error, setError] = useState(null);
  const [tech, setTech] = useState('none');
  const [domainOn, setDomainOn] = useState(false);
  const [hollowOn, setHollowOn] = useState(false);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState({ cam: false, hands: false, mask: false });

  const state = useRef({
    w: 1280, h: 720,
    detector: null, segmenter: null, stream: null, cancelled: false,
    lastInfer: 0, lastSeg: 0,
    inferBusy: false, segBusy: false,
    handResults: null, segMask: null,
    smooth: { blue: 0, red: 0, domain: 0, lastPurpleT: 0, hum: null },
  });

  const log = (msg, type = 'info') => {
    const entry = { id: ++logIdRef.current, t: new Date().toLocaleTimeString(), msg, type };
    logRef.current = [...logRef.current.slice(-30), entry];
    setLogs([...logRef.current]);
    const fn = type === 'error' ? console.error : type === 'warn' ? console.warn : console.log;
    fn('[gojo]', msg);
  };

  useEffect(() => {
    state.current.cancelled = false;
    const onError = (e) => {
      const msg = (e.error && e.error.message) || e.message || String(e);
      log(`window error: ${msg}`, 'error');
    };
    const onRejection = (e) => {
      const reason = e.reason;
      const msg = (reason && reason.message) || String(reason);
      log(`unhandled promise rejection: ${msg}`, 'error');
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      state.current.cancelled = true;
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { state.current.stream && state.current.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
      try { state.current.detector && state.current.detector.cleanup && state.current.detector.cleanup(); } catch (e) {}
      try { state.current.segmenter && state.current.segmenter.cleanup && state.current.segmenter.cleanup(); } catch (e) {}
      stopHum();
    };
  }, []);

  const start = async () => {
    const S = state.current;
    try {
      resumeAudio();
      setError(null);
      setPhase('loading');
      log('Starting up...');

      // --- Camera ---
      setLoadMsg('Requesting webcam...');
      log('Requesting getUserMedia...');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('navigator.mediaDevices.getUserMedia is not available. This page must be served over HTTPS (Vercel provides this automatically) or localhost.');
      }
      S.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      log('Camera stream acquired');

      const video = videoRef.current;
      video.srcObject = S.stream;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      await new Promise((res, rej) => {
        video.onloadedmetadata = () => {
          video.play().then(res).catch(rej);
        };
      });
      // Wait for the first frame to be decodable (some devices take a tick)
      await new Promise(res => {
        const tick = () => (video.readyState >= 2 ? res() : requestAnimationFrame(tick));
        tick();
      });
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      S.w = w; S.h = h;
      log(`Video ready: ${w}x${h}`);

      canvasRef.current.width = w; canvasRef.current.height = h;
      matteRef.current.width = w; matteRef.current.height = h;
      maskRef.current.width = w; maskRef.current.height = h;
      // Create a downscaled working canvas for hand inference (faster)
      const work = document.createElement('canvas');
      work.width = Math.round(w * 0.5);
      work.height = Math.round(h * 0.5);
      workRef.current = work;

      effectsRef.current = new EffectsRenderer(canvasRef.current, video);
      effectsRef.current.setSize(w, h);
      setStatus(s => ({ ...s, cam: true }));

      // --- TF.js models ---
      setLoadMsg('Initializing TensorFlow.js...');
      log('Initializing TF.js backend');
      await import('@tensorflow/tfjs').then(async (tf) => {
        await tf.ready();
        log(`TF.js backend: ${tf.getBackend()}`);
      });

      setLoadMsg('Loading hand detection model (first time: ~15 MB)...');
      log('Loading @tensorflow-models/hand-pose-detection (MediaPipe Hands, TFJS runtime)...');
      const detector = await getHandDetector();
      S.detector = detector;
      setStatus(s => ({ ...s, hands: true }));
      log('Hand detector ready');

      setLoadMsg('Loading body segmentation model...');
      log('Loading @tensorflow-models/body-segmentation...');
      const segmenter = await getSegmenter();
      S.segmenter = segmenter;
      if (segmenter) {
        setStatus(s => ({ ...s, mask: true }));
        log('Segmenter ready');
      } else {
        log('Segmenter unavailable; using dimmed fallback in Domain.', 'warn');
      }

      setPhase('running');
      setLoadMsg('Running');
      log('Cursed techniques online.');
      loop();
    } catch (err) {
      console.error(err);
      let msg = err.message || String(err);
      if (err.name === 'NotAllowedError' || /denied|permission/i.test(msg)) {
        msg = 'Camera permission denied. Click the camera icon in your browser\'s address bar to allow access, then press Retry.';
      } else if (err.name === 'NotFoundError') {
        msg = 'No webcam found on this device.';
      } else if (err.name === 'NotReadableError') {
        msg = 'Camera is already in use by another app. Close other camera apps and retry.';
      } else if (/SharedArrayBuffer/i.test(msg)) {
        msg = 'SharedArrayBuffer is not available. This page needs COOP/COEP headers (set automatically on Vercel).';
      }
      setError(msg);
      setPhase('error');
      log(`ERROR: ${msg}`, 'error');
    }
  };

  const loop = () => {
    if (state.current.cancelled) return;
    rafRef.current = requestAnimationFrame(loop);

    const S = state.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const matte = matteRef.current;
    const fx = effectsRef.current;
    if (!video || !canvas || !fx) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    const mctx = matte.getContext('2d');
    const w = S.w, h = S.h;
    if (video.readyState < 2) return;

    const now = performance.now();
    const detector = S.detector;
    const segmenter = S.segmenter;
    const work = workRef.current;

    // --- Throttled inference ---
    if (detector && !S.inferBusy && now - S.lastInfer > 60) {
      S.inferBusy = true;
      S.lastInfer = now;
      (async () => {
        try {
          const wctx = work.getContext('2d', { willReadFrequently: true });
          wctx.drawImage(video, 0, 0, work.width, work.height);
          const predictions = await detector.estimateHands(work, { flipHorizontal: true });
          if (S.cancelled) return;
          // Convert predictions to mirror-normalized coords (x,y in 0..1 for mirrored frame)
          const hands = [];
          for (const p of predictions) {
            const scaleX = 1 / work.width;
            const scaleY = 1 / work.height;
            const lm = p.keypoints.map(pt => ({ x: pt.x * scaleX, y: pt.y * scaleY }));
            // TF.js handedness: p.handedness is 'Left'/'Right' from the viewer's perspective,
            // which (with flipHorizontal=true) already corresponds to the user's hand.
            const label = (p.handedness || 'Right');
            hands.push({ lm, label });
          }
          S.handResults = hands;
        } catch (e) {
          log(`hand inference error: ${e.message}`, 'warn');
        } finally {
          S.inferBusy = false;
        }
      })();
    }

    if (segmenter && !S.segBusy && now - S.lastSeg > 120) {
      S.segBusy = true;
      S.lastSeg = now;
      (async () => {
        try {
          const people = await segmenter.segmentPeople(video, { flipHorizontal: true });
          if (S.cancelled) return;
          const maskCanvas = maskRef.current;
          const mctx = maskCanvas.getContext('2d');
          mctx.save(); mctx.setTransform(1,0,0,1,0,0); mctx.clearRect(0,0,w,h);
          if (people && people.length > 0 && people[0].mask) {
            const img = await people[0].mask.toCanvasImageSource();
            mctx.drawImage(img, 0, 0, w, h);
            S.segMask = maskCanvas;
          } else {
            S.segMask = null;
          }
          mctx.restore();
        } catch (e) {
          S.segMask = null;
        } finally {
          S.segBusy = false;
        }
      })();
    }

    // ------- GESTURE DETECTION -------
    const handsDetected = S.handResults || [];
    let leftHand = null, rightHand = null;
    for (const hd of handsDetected) {
      if (hd.label === 'Left') leftHand = hd.lm;
      else rightHand = hd.lm;
    }

    let blueHere = false, redHere = false, domainHere = false;
    let bp = null, rp = null;
    for (const lm of handsDetected) {
      if (isDomainSeal(lm)) {
        domainHere = true;
        bp = rp = { x: (lm[INDEX_TIP].x + lm[MIDDLE_TIP].x) / 2 * w, y: (lm[INDEX_TIP].y + lm[MIDDLE_TIP].y) / 2 * h };
        break;
      }
    }
    if (!domainHere) {
      if (leftHand && isOpenPalm(leftHand)) {
        blueHere = true;
        bp = { x: (leftHand[MIDDLE_MCP].x + leftHand[WRIST].x) / 2 * w, y: (leftHand[MIDDLE_MCP].y + leftHand[WRIST].y) / 2 * h };
      }
      if (rightHand) {
        if (isPointing(rightHand)) {
          redHere = true; rp = { x: rightHand[INDEX_TIP].x * w, y: rightHand[INDEX_TIP].y * h };
        } else if (isOpenPalm(rightHand)) {
          redHere = true; rp = { x: rightHand[MIDDLE_MCP].x * w, y: rightHand[MIDDLE_MCP].y * h };
        }
      }
    }

    const sm = S.smooth;
    sm.blue = blueHere ? Math.min(20, sm.blue + 2) : Math.max(0, sm.blue - 2);
    sm.red = redHere ? Math.min(20, sm.red + 2) : Math.max(0, sm.red - 2);
    sm.domain = domainHere ? Math.min(30, sm.domain + 2) : Math.max(0, sm.domain - 2);

    const blue = sm.blue > 4, red = sm.red > 4, domain = sm.domain > 5;
    let purple = false;
    if (blue && red && bp && rp && !domain) {
      if (Math.hypot(bp.x - rp.x, bp.y - rp.y) < w * 0.34) purple = true;
    }

    if (domain && !domainOn) { setDomainOn(true); playBassDrop(); fx.triggerShake(20); }
    else if (!domain && domainOn) setDomainOn(false);

    // ------- RENDER -------
    fx.beginFrame(); // applies shake, clears

    // Background + user (mirrored)
    if (domain) {
      fx.drawDomainBackground();
      // User cutout
      ctx.save();
      ctx.translate(w, 0); ctx.scale(-1, 1);
      if (S.segMask && segmenter) {
        // matte canvas contains a white-person / black-background mask from segmentation.
        // Compose: matte over video via "source-in" on an offscreen, then draw result.
        const mctx = matte.getContext('2d');
        mctx.save(); mctx.setTransform(1,0,0,1,0,0);
        // The mask was drawn already by the seg task. Now composite video into matte.
        mctx.globalCompositeOperation = 'source-in';
        mctx.drawImage(video, 0, 0, w, h);
        mctx.globalCompositeOperation = 'source-over';
        mctx.restore();
        ctx.shadowColor = 'rgba(170,120,255,0.8)'; ctx.shadowBlur = 28;
        ctx.drawImage(matte, 0, 0, w, h); ctx.shadowBlur = 0;
        // Reset matte to pure mask for next frame
        mctx.save(); mctx.setTransform(1,0,0,1,0,0);
        mctx.clearRect(0,0,w,h);
        // (next seg result will overwrite it)
        mctx.restore();
      } else {
        ctx.filter = 'brightness(0.75) saturate(0.6)';
        ctx.drawImage(video, 0, 0, w, h);
        ctx.filter = 'none';
        ctx.fillStyle = 'rgba(25,0,55,0.6)'; ctx.fillRect(0,0,w,h);
      }
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = '#000'; ctx.fillRect(-40,-40,w+80,h+80);
      ctx.translate(w,0); ctx.scale(-1,1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();
    }

    // FX
    if (domain) {
      const p = bp || rp || { x: w/2, y: h/2 };
      fx.drawDomainAura(p.x, p.y);
      if (sm.hum !== 'domain') { playChargingHum('purple'); sm.hum = 'domain'; }
    } else if (purple) {
      const bx = (bp.x + rp.x)/2, by = (bp.y + rp.y)/2;
      fx.drawPurpleBeam(bx, by);
      if (now - sm.lastPurpleT > 600) { fx.spawnShockwave(bx,by,'#d896ff',w*0.95); playBassDrop(); sm.lastPurpleT = now; }
      if (!hollowOn) setHollowOn(true);
      if (sm.hum !== 'purple') { playChargingHum('purple'); sm.hum = 'purple'; }
    } else {
      if (hollowOn) setHollowOn(false);
      if (blue) { fx.drawBlueOrb(bp.x, bp.y); if (sm.hum !== 'blue') { playChargingHum('blue'); sm.hum='blue'; } }
      if (red) { fx.drawRedOrb(rp.x, rp.y); if (sm.hum !== 'red') { playChargingHum('red'); sm.hum='red'; } }
      if (!blue && !red) { if (sm.hum) { stopHum(); sm.hum=null; } }
    }

    fx.updateAndDrawParticles();
    fx.updateAndDrawLightnings();
    fx.updateAndDrawShockwaves();

    if (showLandmarks) {
      ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(34,211,238,0.8)'; ctx.lineWidth = 1.5;
      const CONN = [[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[0,1],[1,2],[2,3],[3,4]];
      for (const lm of handsDetected) {
        for (const [a,b] of CONN) { ctx.beginPath(); ctx.moveTo(lm[a].x*w,lm[a].y*h); ctx.lineTo(lm[b].x*w,lm[b].y*h); ctx.stroke(); }
        for (const p of lm) { ctx.beginPath(); ctx.arc(p.x*w,p.y*h,2.5,0,Math.PI*2); ctx.fill(); }
      }
      ctx.restore();
    }

    fx.endFrame();

    // Active technique label
    let t = 'none';
    if (domain) t = 'domain';
    else if (purple) t = 'purple';
    else if (blue && red) t = 'both';
    else if (blue) t = 'blue';
    else if (red) t = 'red';
    setTech(prev => prev === t ? prev : t);
  };

  const labels = {
    none: 'Standby · Make a gesture',
    blue: 'Cursed Technique Lapse · Blue (蒼)',
    red: 'Cursed Technique Reversal · Red (赫)',
    both: 'Blue + Red · colliding...',
    purple: 'Hollow Purple (虛式「茈」)',
    domain: 'Domain Expansion · Unlimited Void (領域展開 ・ 無量空処)',
  };

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden scanlines select-none">
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={matteRef} className="hidden" />
      <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full object-cover ${tech==='purple'?'animate-shake':''}`} />

      {/* Top HUD */}
      <div className="absolute top-0 left-0 right-0 p-3 md:p-5 flex justify-between items-start pointer-events-none z-20">
        <div className="pointer-events-auto">
          <h1 className="text-base md:text-2xl font-bold tracking-widest text-white/90" style={{fontFamily:'Orbitron, sans-serif'}}>
            呪術廻戦 · JUJUTSU KAISEN
          </h1>
          <p className="text-[10px] md:text-sm text-white/60 mt-0.5">Gojo Satoru · Cursed Technique Simulator</p>
        </div>
        <div className="pointer-events-auto text-right">
          <div className="text-[10px] md:text-xs text-white/60 tracking-widest uppercase">Active Technique</div>
          <div className={'mt-0.5 text-sm md:text-2xl font-bold tracking-wide transition-colors '+(
            tech==='blue'?'text-cyan-300':tech==='red'?'text-red-400':tech==='purple'?'text-purple-300':tech==='domain'?'text-purple-200':'text-white/80'
          )}>{labels[tech]}</div>
        </div>
      </div>

      {/* Status dots */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex gap-3 text-[10px] md:text-xs tracking-widest uppercase text-white/70">
        <Dot label="Cam" on={status.cam} />
        <Dot label="Hands" on={status.hands} />
        <Dot label="Mask" on={status.mask} />
      </div>

      {/* Bottom hints */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-2 z-20 pointer-events-none justify-center md:justify-start">
        <Hint color="cyan" jp="蒼" label="Left open palm" active={tech==='blue'||tech==='both'||tech==='purple'}/>
        <Hint color="red" jp="赫" label="Right point/palm" active={tech==='red'||tech==='both'||tech==='purple'}/>
        <Hint color="purple" jp="茈" label="Hands together → Purple" active={tech==='purple'}/>
        <Hint color="violet" jp="領" label="Cross fingers → Domain" active={tech==='domain'}/>
        <button onClick={()=>setShowLandmarks(v=>!v)} className="pointer-events-auto px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/20 text-white/80 text-xs backdrop-blur-md">
          {showLandmarks?'Hide Skeleton':'Show Skeleton'}
        </button>
        <button onClick={()=>setShowDebug(v=>!v)} className="pointer-events-auto px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/20 text-white/80 text-xs backdrop-blur-md">
          {showDebug?'Hide Debug':'Debug'}
        </button>
      </div>

      {/* Kanji overlays */}
      {domainOn && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
          <div className="domain-kanji text-[20vw] md:text-[14vw] font-black leading-none animate-pulseGlow select-none">無量空処</div>
          <div className="absolute top-[18%] jp-text text-white/80 text-lg md:text-4xl tracking-[0.4em]">領&nbsp;域&nbsp;展&nbsp;開</div>
        </div>
      )}
      {hollowOn && !domainOn && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10 animate-pulseGlow">
          <div className="hollow-kanji text-[12vw] md:text-[8vw] font-black leading-none select-none">虛式「茈」</div>
        </div>
      )}

      {/* Debug panel */}
      {showDebug && (
        <div className="absolute top-16 right-3 z-30 w-80 max-h-[60vh] overflow-auto bg-black/80 border border-white/20 rounded-lg p-3 text-[10px] font-mono text-white/80 backdrop-blur">
          <div className="text-white font-bold mb-1">Debug log</div>
          {logs.length === 0 && <div className="text-white/40">no logs</div>}
          {logs.map(e => (
            <div key={e.id} className={e.type==='error'?'text-red-400':e.type==='warn'?'text-yellow-300':'text-white/70'}>
              <span className="text-white/30">{e.t}</span> {e.msg}
            </div>
          ))}
        </div>
      )}

      {/* Camera-permission gate — covers the whole screen so any click fires access */}
      {phase === 'idle' && (
        <button
          onClick={start}
          className="absolute inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6 cursor-pointer border-0 focus:outline-none w-full h-full"
        >
          <div className="jp-text text-4xl md:text-6xl font-black domain-kanji mb-3 pointer-events-none">無量空処</div>
          <div className="flex items-center gap-2 mb-4 pointer-events-none">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse"/>
            <span className="text-white/80 tracking-widest text-sm uppercase">Camera Access Required</span>
          </div>
          <h2 className="text-2xl md:text-4xl font-bold text-white mb-3 pointer-events-none" style={{fontFamily:'Orbitron, sans-serif'}}>
            Click anywhere to enable your camera
          </h2>
          <p className="text-white/60 max-w-md mb-5 text-sm md:text-base pointer-events-none">
            Your browser will ask permission to use the webcam.
            All hand tracking runs locally in your browser — no video leaves your device.
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs md:text-sm text-white/60 max-w-md pointer-events-none text-left">
            <div>🖐️ <b className="text-cyan-300">Left palm</b> → Blue (蒼)</div>
            <div>☝️ <b className="text-red-400">Right point</b> → Red (赫)</div>
            <div>🤲 <b className="text-purple-300">Hands together</b> → Purple (茈)</div>
            <div>✌️ <b className="text-violet-200">Cross fingers</b> → Domain</div>
          </div>
          <div className="mt-6 px-8 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-cyan-500 text-white font-bold tracking-widest text-lg shadow-[0_0_40px_rgba(168,85,247,0.6)] pointer-events-none animate-pulse">
            🎥 CLICK TO START
          </div>
        </button>
      )}

      {phase === 'loading' && (
        <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center z-50 text-white">
          <div className="flex gap-3">
            <span className="w-3 h-3 rounded-full bg-purple-400 animate-ping"/>
            <span className="w-3 h-3 rounded-full bg-cyan-400 animate-ping [animation-delay:150ms]"/>
            <span className="w-3 h-3 rounded-full bg-red-400 animate-ping [animation-delay:300ms]"/>
          </div>
          <div className="mt-4 text-lg tracking-widest">{loadMsg}</div>
          <div className="mt-2 text-xs text-white/50">~12 MB models load on first run (cached after).</div>
        </div>
      )}

      {phase === 'error' && (
        <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center z-50 text-white p-6 text-center">
          <div className="text-2xl text-red-400 font-bold mb-2">Cursed Technique Failed</div>
          <div className="text-white/80 mb-4 text-sm md:text-base max-w-lg">{error}</div>
          <button onClick={start} className="mt-2 px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 transition">Retry</button>
        </div>
      )}
    </div>
  );
}

function Dot({ label, on }) {
  return (
    <div className="flex items-center gap-1.5 bg-black/40 px-2 py-0.5 rounded backdrop-blur">
      <span className={"w-2 h-2 rounded-full " + (on ? "bg-emerald-400 shadow-[0_0_10px_#34d399]" : "bg-white/30 animate-pulse")} />
      {label}
    </div>
  );
}
function Hint({ color, jp, label, active }) {
  const map = {
    cyan: 'border-cyan-400 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.6)]',
    red: 'border-red-500 text-red-200 shadow-[0_0_18px_rgba(239,68,68,0.6)]',
    purple: 'border-purple-500 text-purple-200 shadow-[0_0_22px_rgba(168,85,247,0.8)]',
    violet: 'border-violet-400 text-violet-100 shadow-[0_0_26px_rgba(167,139,250,0.8)]',
  };
  return (
    <div className={'pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-lg border backdrop-blur-md bg-black/40 text-xs md:text-sm transition '+(active?map[color]+' bg-white/5 scale-[1.03]':'border-white/15 text-white/60')}>
      <span className="jp-text text-base md:text-lg">{jp}</span><span>{label}</span>
    </div>
  );
}

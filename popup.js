/* popup.js  – dual-meter visualizer
   left : log-scaled frequency curve
   right: oscilloscope waveform (placeholder for Milestone 3)
   
   Milestone 1: Fixed audio echo, wired Start/Stop button, status display
   Milestone 2: Dynamic DPI scaling for crisp rendering on all displays */

(() => {
  /* --------------------- DOM refs ------------------------------------ */
  const errBox     = document.getElementById('err');
  const specCanvas = document.getElementById('spec');
  const waveCanvas = document.getElementById('wave');
  const toggleBtn  = document.getElementById('toggle');
  const statusEl   = document.getElementById('status');

  const specCtx = specCanvas.getContext('2d');
  const waveCtx = waveCanvas.getContext('2d');

  /* --------------------- canvas dimensions (CSS pixels) -------------- */
  /* These are updated by setupCanvas() and used for all drawing calculations */
  let specWidth = 0, specHeight = 0;
  let waveWidth = 0, waveHeight = 0;

  /* --------------------- DPI scaling --------------------------------- */
  /**
   * Returns the CSS dimensions for use in drawing calculations.
   * @param {HTMLCanvasElement} canvas
   * @returns {{ ctx: CanvasRenderingContext2D, width: number, height: number }}
   */
  function setupCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    return { ctx, width: rect.width, height: rect.height };
  }

  function initCanvases() {
    const spec = setupCanvas(specCanvas);
    const wave = setupCanvas(waveCanvas);
    
    specWidth = spec.width;
    specHeight = spec.height;
    waveWidth = wave.width;
    waveHeight = wave.height;
  }

  /* --------------------- state --------------------------------------- */
  let stream = null;
  let audioContext = null;
  let animationId = null;
  let isCapturing = false;

  /* --------------------- helpers ------------------------------------- */
  function setStatus(text) {
    statusEl.textContent = text;
  }

  function showError(msg) {
    errBox.hidden = false;
    errBox.textContent = msg;
    setStatus('Error');
  }

  function clearError() {
    errBox.hidden = true;
    errBox.textContent = '';
  }

  function clearCanvases() {
    specCtx.clearRect(0, 0, specWidth, specHeight);
    waveCtx.clearRect(0, 0, waveWidth, waveHeight);
  }

  function captureAudio() {
    return new Promise((resolve, reject) => {
      chrome.tabCapture.capture({ audio: true, video: false }, (s) => {
        const err = chrome.runtime.lastError;
        if (err || !s) {
          reject(err ?? new Error('Permission denied or no audio available'));
        } else {
          resolve(s);
        }
      });
    });
  }

  /* --------------------- start capture ------------------------------- */
  async function startCapture() {
    if (isCapturing) return;

    clearError();
    setStatus('Starting...');
    toggleBtn.disabled = true;

    try {
      stream = await captureAudio();
      audioContext = new AudioContext();
      await audioContext.resume();

      const src = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.6;

      /* AUDIO ROUTING: Connect analyser to destination */
      src.connect(analyser);
      analyser.connect(audioContext.destination);

      /* buffers */
      const freqData = new Float32Array(analyser.frequencyBinCount);
      const timeData = new Float32Array(analyser.fftSize);

      /* pre-compute log-x mapping (using CSS dimensions for DPI-independent drawing) */
      const BINS_PER_BUCKET = 8;
      const BUCKETS = freqData.length / BINS_PER_BUCKET;

      const logWidth = Math.log10(freqData.length);
      const logX = (bin) => (Math.log10(bin + 1) / logWidth) * specWidth;

      const dbRange = analyser.maxDecibels - analyser.minDecibels;
      const mapY = (db) => {
        const n = Math.min(1, Math.max(0, (db - analyser.minDecibels) / dbRange));
        return specHeight - n * specHeight;
      };

      /* ----------------- DRAW LOOP ---------------------------------- */
      function draw() {
        /* === 1. FREQUENCY CURVE (left canvas) ======================== */
        analyser.getFloatFrequencyData(freqData);
        specCtx.clearRect(0, 0, specWidth, specHeight);

        specCtx.beginPath();
        let sum = 0;
        for (let j = 0; j < BINS_PER_BUCKET; j++) sum += freqData[j];
        let avg = sum / BINS_PER_BUCKET;
        let px = 0, py = mapY(avg);
        specCtx.moveTo(px, py);

        for (let b = 1; b < BUCKETS; b++) {
          const start = b * BINS_PER_BUCKET;
          sum = 0;
          for (let j = 0; j < BINS_PER_BUCKET; j++) sum += freqData[start + j];
          avg = sum / BINS_PER_BUCKET;

          const cx = logX(start);
          const cy = mapY(avg);

          const midX = (px + cx) / 2;
          const midY = (py + cy) / 2;
          specCtx.quadraticCurveTo(px, py, midX, midY);

          px = cx;
          py = cy;
        }

        specCtx.lineTo(specWidth, specHeight);
        specCtx.lineTo(0, specHeight);
        specCtx.closePath();

        const grad = specCtx.createLinearGradient(0, 0, 0, specHeight);
        grad.addColorStop(0, 'rgba(0,255,255,0.8)');
        grad.addColorStop(1, 'rgba(0,0,128,0.1)');
        specCtx.fillStyle = grad;
        specCtx.fill();
        specCtx.strokeStyle = 'rgba(255,255,255,0.6)';
        specCtx.lineWidth = 1;
        specCtx.stroke();

        /* === 2. WAVEFORM (right canvas) - placeholder for Milestone 3 */
        analyser.getFloatTimeDomainData(timeData);
        
        // Basic oscilloscope display (will be enhanced in Milestone 3)
        waveCtx.clearRect(0, 0, waveWidth, waveHeight);
        waveCtx.beginPath();
        
        const sliceWidth = waveWidth / timeData.length;
        const mid = waveHeight / 2;
        let x = 0;
        
        for (let i = 0; i < timeData.length; i++) {
          const y = mid - timeData[i] * mid;
          if (i === 0) {
            waveCtx.moveTo(x, y);
          } else {
            waveCtx.lineTo(x, y);
          }
          x += sliceWidth;
        }
        
        waveCtx.strokeStyle = '#00ff7f';
        waveCtx.lineWidth = 1;
        waveCtx.stroke();

        animationId = requestAnimationFrame(draw);
      }

      draw();
      isCapturing = true;
      setStatus('Capturing...');
      toggleBtn.textContent = 'Stop';
      toggleBtn.disabled = false;

    } catch (e) {
      console.error('Capture failed:', e);
      showError(e?.message ?? 'Capture failed');
      toggleBtn.disabled = false;
      stopCapture();
    }
  }

  /* --------------------- stop capture -------------------------------- */
  function stopCapture() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }

    clearCanvases();
    isCapturing = false;
    setStatus('Stopped');
    toggleBtn.textContent = 'Start';
    toggleBtn.disabled = false;
  }

  /* --------------------- toggle button ------------------------------- */
  toggleBtn.addEventListener('click', () => {
    if (isCapturing) {
      stopCapture();
    } else {
      startCapture();
    }
  });

  /* --------------------- cleanup on popup close ---------------------- */
  window.addEventListener('unload', () => {
    stopCapture();
  });

  /* --------------------- handle window resize ------------------------ */
  window.addEventListener('resize', () => {
    initCanvases();
    if (!isCapturing) {
      clearCanvases();
    }
  });

  /* --------------------- initial state ------------------------------- */
  initCanvases();
  setStatus('Idle');
})();

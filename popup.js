/* popup.js – Main entry point for Sound Meters extension */

import { setupCanvas, clearCanvas } from './src/viz/canvas-utils.js';
import { createSpectrumRenderer } from './src/viz/spectrum.js';
import { createWaveformRenderer, WaveformMode } from './src/viz/waveform.js';
import { captureTabAudio, stopStream } from './src/audio/capture.js';
import { buildAudioGraph, destroyAudioGraph } from './src/audio/graph.js';
import { 
  updateToggleButton, 
  setStatus, 
  showError, 
  clearError,
  setupWaveformModeSelector 
} from './src/ui/controls.js';

/* --------------------- DOM refs ------------------------------------ */
const errBox = document.getElementById('err');
const specCanvas = document.getElementById('spec');
const waveCanvas = document.getElementById('wave');
const toggleBtn = document.getElementById('toggle');
const statusEl = document.getElementById('status');
const waveModeSelect = document.getElementById('waveMode');

const specCtx = specCanvas.getContext('2d');
const waveCtx = waveCanvas.getContext('2d');

/* --------------------- canvas dimensions (CSS pixels) -------------- */
let specWidth = 0, specHeight = 0;
let waveWidth = 0, waveHeight = 0;

/* --------------------- state --------------------------------------- */
let stream = null;
let audioContext = null;
let animationId = null;
let isCapturing = false;

let spectrumRenderer = null;
let waveformRenderer = null;

/* --------------------- canvas setup -------------------------------- */
function initCanvases() {
  const spec = setupCanvas(specCanvas);
  const wave = setupCanvas(waveCanvas);

  specWidth = spec.width;
  specHeight = spec.height;
  waveWidth = wave.width;
  waveHeight = wave.height;

  // Update renderers with new dimensions
  if (spectrumRenderer) {
    spectrumRenderer.resize(specWidth, specHeight);
  }
  if (waveformRenderer) {
    waveformRenderer.resize(waveWidth, waveHeight);
  }
}

function clearCanvases() {
  clearCanvas(specCtx, specWidth, specHeight);
  clearCanvas(waveCtx, waveWidth, waveHeight);
}

/* --------------------- start capture ------------------------------- */
async function startCapture() {
  if (isCapturing) return;

  clearError(errBox);
  setStatus(statusEl, 'Starting...');
  updateToggleButton(toggleBtn, false, true);

  try {
    stream = await captureTabAudio();
    const graph = await buildAudioGraph(stream);
    audioContext = graph.context;

    spectrumRenderer = createSpectrumRenderer(specCtx, graph.analyser);
    spectrumRenderer.resize(specWidth, specHeight);

    waveformRenderer = createWaveformRenderer(waveCtx, graph.analyser);
    waveformRenderer.resize(waveWidth, waveHeight);
    waveformRenderer.setMode(waveModeSelect.value);

    /* ----------------- DRAW LOOP ---------------------------------- */
    function draw() {
      spectrumRenderer.draw();
      waveformRenderer.draw();
      animationId = requestAnimationFrame(draw);
    }

    draw();
    isCapturing = true;
    setStatus(statusEl, 'Capturing...');
    updateToggleButton(toggleBtn, true, false);

  } catch (e) {
    console.error('Capture failed:', e);
    showError(errBox, statusEl, e?.message ?? 'Capture failed');
    updateToggleButton(toggleBtn, false, false);
    stopCapture();
  }
}

/* --------------------- stop capture -------------------------------- */
function stopCapture() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  stopStream(stream);
  stream = null;

  destroyAudioGraph(audioContext);
  audioContext = null;

  // Clean up renderers
  if (waveformRenderer) {
    waveformRenderer.clear();
  }
  spectrumRenderer = null;
  waveformRenderer = null;

  clearCanvases();
  isCapturing = false;
  setStatus(statusEl, 'Stopped');
  updateToggleButton(toggleBtn, false, false);
}

/* --------------------- event handlers ------------------------------ */
toggleBtn.addEventListener('click', () => {
  if (isCapturing) {
    stopCapture();
  } else {
    startCapture();
  }
});

// Waveform mode selector
setupWaveformModeSelector(waveModeSelect, (newMode) => {
  if (waveformRenderer) {
    waveformRenderer.setMode(newMode);
  }
}, WaveformMode.OSCILLOSCOPE);

// Handle window resize
window.addEventListener('resize', () => {
  initCanvases();
  if (!isCapturing) {
    clearCanvases();
  }
});

// Cleanup on popup close
window.addEventListener('unload', () => {
  stopCapture();
});

/* --------------------- initial state ------------------------------- */
initCanvases();
setStatus(statusEl, 'Idle');

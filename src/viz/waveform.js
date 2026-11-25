/* waveform.js – Waveform renderer with Oscilloscope and Scrolling modes
   Milestone 3: Full waveform display implementation */

export const WaveformMode = {
  OSCILLOSCOPE: 'oscilloscope',
  SCROLLING: 'scrolling'
};

/**
 * Creates a waveform renderer with multiple display modes.
 * @param {CanvasRenderingContext2D} ctx
 * @param {AnalyserNode} analyser
 * @returns {Object} Renderer with draw(), resize(), setMode() methods
 */
export function createWaveformRenderer(ctx, analyser) {
  const timeData = new Float32Array(analyser.fftSize);
  
  let width = 0;
  let height = 0;
  let mode = WaveformMode.OSCILLOSCOPE;
  
  // Scrolling mode state
  let scrollBuffer = null;
  let scrollPos = 0;
  
  /**
   * Find zero-crossing point for stable oscilloscope display.
   * Looks for positive-going zero crossing.
   * @returns {number} Sample index of trigger point
   */
  function findTriggerPoint() {
    const threshold = 0.02; // Minimum amplitude to trigger
    const searchLen = Math.floor(timeData.length / 4);
    
    for (let i = 1; i < searchLen; i++) {
      // Look for positive-going zero crossing with sufficient amplitude
      if (timeData[i - 1] < 0 && timeData[i] >= 0) {
        // Check if there's meaningful signal around this point
        const peakAhead = Math.max(...Array.from(timeData.slice(i, i + 50)).map(Math.abs));
        if (peakAhead > threshold) {
          return i;
        }
      }
    }
    return 0; // No trigger found, start from beginning
  }

  /**
   * Draw oscilloscope mode - full trace of waveform buffer.
   */
  function drawOscilloscope() {
    ctx.clearRect(0, 0, width, height);
    
    // Draw center line (zero reference)
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    
    // Find trigger point for stability
    const triggerIdx = findTriggerPoint();
    const samplesToShow = Math.min(timeData.length - triggerIdx, timeData.length * 0.75);
    
    // Draw waveform
    ctx.beginPath();
    const sliceWidth = width / samplesToShow;
    const mid = height / 2;
    const amplitude = mid * 0.9; // Leave some margin
    
    for (let i = 0; i < samplesToShow; i++) {
      const sampleIdx = triggerIdx + i;
      const x = i * sliceWidth;
      const y = mid - timeData[sampleIdx] * amplitude;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.strokeStyle = '#00ff7f';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  /**
   * Draw scrolling mode - waterfall-like history display.
   * New samples appear on right edge, old ones scroll left.
   */
  function drawScrolling() {
    // Initialize scroll buffer if needed
    if (!scrollBuffer || scrollBuffer.length !== width) {
      scrollBuffer = new Float32Array(width);
      scrollPos = 0;
    }
    
    // Calculate how many new samples to add based on time
    // We want roughly 1 second of history visible across the width
    const samplesPerPixel = analyser.context.sampleRate / width;
    const newSamples = Math.ceil(timeData.length / samplesPerPixel);
    
    // Shift buffer left and add new averaged samples
    const shiftAmount = Math.min(newSamples, width);
    scrollBuffer.copyWithin(0, shiftAmount);
    
    // Average samples into the new pixels on the right
    for (let i = 0; i < shiftAmount; i++) {
      const startSample = Math.floor((i / shiftAmount) * timeData.length);
      const endSample = Math.floor(((i + 1) / shiftAmount) * timeData.length);
      
      let sum = 0;
      let count = 0;
      for (let j = startSample; j < endSample && j < timeData.length; j++) {
        sum += timeData[j];
        count++;
      }
      
      const pixelIdx = width - shiftAmount + i;
      scrollBuffer[pixelIdx] = count > 0 ? sum / count : 0;
    }
    
    // Draw
    ctx.clearRect(0, 0, width, height);
    
    // Draw center line
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    
    // Draw scrolling waveform
    ctx.beginPath();
    const mid = height / 2;
    const amplitude = mid * 0.9;
    
    for (let x = 0; x < width; x++) {
      const y = mid - scrollBuffer[x] * amplitude;
      
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    // Gradient stroke for depth effect (older = dimmer)
    const grad = ctx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, 'rgba(0, 255, 127, 0.3)');
    grad.addColorStop(0.7, 'rgba(0, 255, 127, 0.8)');
    grad.addColorStop(1, 'rgba(0, 255, 127, 1)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  return {
    /**
     * Update dimensions after resize.
     * @param {number} w - CSS width
     * @param {number} h - CSS height
     */
    resize(w, h) {
      width = w;
      height = h;
      // Reset scroll buffer on resize
      scrollBuffer = null;
    },

    /**
     * Set the waveform display mode.
     * @param {string} newMode - WaveformMode.OSCILLOSCOPE or WaveformMode.SCROLLING
     */
    setMode(newMode) {
      if (newMode !== mode) {
        mode = newMode;
        scrollBuffer = null; // Reset buffer when switching modes
      }
    },

    /**
     * Get the current mode.
     * @returns {string}
     */
    getMode() {
      return mode;
    },

    /**
     * Draw the waveform based on current mode.
     */
    draw() {
      if (width === 0 || height === 0) return;
      
      analyser.getFloatTimeDomainData(timeData);
      
      if (mode === WaveformMode.OSCILLOSCOPE) {
        drawOscilloscope();
      } else {
        drawScrolling();
      }
    },

    /**
     * Clear the canvas and reset state.
     */
    clear() {
      ctx.clearRect(0, 0, width, height);
      scrollBuffer = null;
    }
  };
}

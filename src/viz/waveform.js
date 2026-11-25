/* waveform.js – Waveform renderer with Oscilloscope and Scrolling modes
   Milestone 3 + 3a: Full waveform display with pitch-stable low-frequency rendering */

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
  
  // Pitch tracking state (persists across frames for stability)
  let lastDetectedPeriod = 0;
  // Track fractional phase within cycle (0.0 to 1.0) - survives buffer advancement
  let lastTriggerPhaseFraction = 0;
  // For extremely stable low-frequency display, track which crossing index we used
  let lastCrossingRank = 0;
  
  // Fixed time window for oscilloscope display (in seconds)
  // This creates the effect where wavelength visually changes with frequency
  const OSCILLOSCOPE_TIME_WINDOW = 0.025; // 25ms - good balance for most frequencies
  
  /**
   * Detect the fundamental period using autocorrelation.
   * This finds the lag at which the signal best correlates with itself,
   * which corresponds to the pitch period.
   * 
   * Key improvement for low frequencies: We scan ALL candidate periods first,
   * then pick the best one, avoiding premature exit that can cause octave errors.
   * @returns {number} Detected period in samples, or 0 if no clear pitch
   */
  function detectPeriod() {
    const sampleRate = analyser.context.sampleRate;
    const minPeriod = Math.floor(sampleRate / 2000); // ~2000 Hz max
    const maxPeriod = Math.floor(sampleRate / 20);   // ~20 Hz min (handles low bass)
    const searchLen = Math.min(maxPeriod * 2, Math.floor(timeData.length / 2));
    
    // Calculate signal energy to check if there's meaningful audio
    let energy = 0;
    for (let i = 0; i < searchLen; i++) {
      energy += timeData[i] * timeData[i];
    }
    if (energy < 0.001 * searchLen) {
      return 0; // Signal too quiet
    }
    
    // Pre-compute autocorrelation values for all candidate periods
    const correlations = [];
    
    for (let period = minPeriod; period <= Math.min(maxPeriod, searchLen - 1); period++) {
      let correlation = 0;
      let norm1 = 0;
      let norm2 = 0;
      
      // Compare signal with itself shifted by 'period' samples
      const compareLen = searchLen - period;
      for (let i = 0; i < compareLen; i++) {
        correlation += timeData[i] * timeData[i + period];
        norm1 += timeData[i] * timeData[i];
        norm2 += timeData[i + period] * timeData[i + period];
      }
      
      // Normalize correlation to -1..1 range
      const normFactor = Math.sqrt(norm1 * norm2);
      if (normFactor > 0) {
        correlation /= normFactor;
      }
      
      correlations.push({ period, correlation });
    }
    
    // Find all local maxima (peaks) in the correlation function
    const peaks = [];
    for (let i = 2; i < correlations.length - 2; i++) {
      const curr = correlations[i].correlation;
      const prev1 = correlations[i - 1].correlation;
      const prev2 = correlations[i - 2].correlation;
      const next1 = correlations[i + 1].correlation;
      const next2 = correlations[i + 2].correlation;
      
      // Check if this is a local maximum
      if (curr > prev1 && curr > prev2 && curr > next1 && curr > next2 && curr > 0.5) {
        peaks.push(correlations[i]);
      }
    }
    
    if (peaks.length === 0) {
      return 0;
    }
    
    // For low frequencies, we want the FIRST strong peak (fundamental)
    // But we also check if peaks are harmonically related to avoid sub-octave errors
    
    // Sort peaks by period (ascending) to find fundamental
    peaks.sort((a, b) => a.period - b.period);
    
    // The first peak with correlation > 0.7 is likely the fundamental
    // But verify it's not a sub-harmonic by checking if there's a stronger peak at 2x
    let bestPeak = peaks[0];
    
    for (const peak of peaks) {
      if (peak.correlation > 0.7) {
        // Check if this could be a sub-harmonic (half the true period)
        // by looking for a peak at roughly 2x this period
        let hasStrongerHarmonic = false;
        for (const other of peaks) {
          const ratio = other.period / peak.period;
          // Is there a peak at ~2x with similar or better correlation?
          if (ratio > 1.8 && ratio < 2.2 && other.correlation > peak.correlation * 0.95) {
            // The 2x peak is similar strength - this might be sub-harmonic
            // Only reject if the 2x peak is actually stronger
            if (other.correlation > peak.correlation) {
              hasStrongerHarmonic = true;
              break;
            }
          }
        }
        
        if (!hasStrongerHarmonic) {
          bestPeak = peak;
          break;
        }
      }
    }
    
    // If we couldn't find a strong peak, use the one with highest correlation
    if (bestPeak.correlation < 0.5) {
      bestPeak = peaks.reduce((best, curr) => 
        curr.correlation > best.correlation ? curr : best, peaks[0]);
    }
    
    return bestPeak.period;
  }
  
  /**
   * Find zero-crossing point for stable oscilloscope display.
   * 
   * KEY FIX FOR LOW FREQUENCIES: Instead of tracking absolute buffer position
   * (which is meaningless across frames as the buffer slides forward in time),
   * we track the FRACTIONAL PHASE within the detected period (0.0 to 1.0).
   * This allows us to lock onto the same point in the waveform cycle.
   * 
   * @returns {number} Sample index (possibly fractional) of trigger point
   */
  function findTriggerPoint() {
    const threshold = 0.02; // Minimum amplitude to trigger
    
    // Detect the fundamental period
    let detectedPeriod = detectPeriod();
    
    // Apply temporal smoothing to period detection
    // Use VERY strong smoothing for low frequencies to prevent jitter
    if (detectedPeriod > 0 && lastDetectedPeriod > 0) {
      const ratio = detectedPeriod / lastDetectedPeriod;
      // Only smooth if periods are reasonably close (within 50% - wider tolerance for stability)
      if (ratio > 0.67 && ratio < 1.5) {
        // Adaptive smoothing: stronger for low frequencies
        // 30 Hz @ 44.1kHz = period ~1470, 80 Hz = ~551
        const smoothing = detectedPeriod > 800 ? 0.95 :  // < 55 Hz: very strong
                         detectedPeriod > 400 ? 0.92 :  // < 110 Hz: strong  
                         0.85;                          // higher frequencies
        detectedPeriod = smoothing * lastDetectedPeriod + (1 - smoothing) * detectedPeriod;
      }
    }
    
    if (detectedPeriod > 0) {
      lastDetectedPeriod = detectedPeriod;
    }
    
    // For low frequencies, search more of the buffer to find multiple crossings
    // This gives us options to pick the most phase-coherent one
    const searchLen = detectedPeriod > 0 
      ? Math.min(Math.ceil(detectedPeriod * 3), Math.floor(timeData.length / 2))
      : Math.floor(timeData.length / 4);
    
    // Find all positive-going zero crossings with their interpolated positions
    const crossings = [];
    
    for (let i = 1; i < searchLen; i++) {
      // Look for positive-going zero crossing
      if (timeData[i - 1] <= 0 && timeData[i] > 0) {
        // Linear interpolation to find exact zero crossing position
        const t = -timeData[i - 1] / (timeData[i] - timeData[i - 1]);
        const exactPos = (i - 1) + t;
        
        // Calculate slope at crossing (steeper = cleaner crossing)
        const slope = timeData[i] - timeData[i - 1];
        
        // Look ahead for peak amplitude (within one period if known)
        const lookAhead = detectedPeriod > 0 ? Math.floor(detectedPeriod / 2) : 50;
        let peakAhead = 0;
        for (let j = i; j < Math.min(i + lookAhead, timeData.length); j++) {
          peakAhead = Math.max(peakAhead, Math.abs(timeData[j]));
        }
        
        if (peakAhead > threshold) {
          // Calculate fractional phase within period (0.0 to 1.0)
          // This is key - we can compare phases across frames even as buffer slides
          const phaseFraction = detectedPeriod > 0 
            ? (exactPos % detectedPeriod) / detectedPeriod 
            : 0;
          
          crossings.push({
            index: i,
            exactPos: exactPos,
            slope: slope,
            peak: peakAhead,
            score: slope * peakAhead,
            phaseFraction: phaseFraction
          });
        }
      }
    }
    
    if (crossings.length === 0) {
      return 0;
    }
    
    // Sort by position to establish crossing rank (1st, 2nd, 3rd crossing in buffer)
    crossings.sort((a, b) => a.exactPos - b.exactPos);
    crossings.forEach((c, idx) => c.rank = idx);
    
    // STRATEGY: For low frequencies, prefer consistency over "best" crossing
    // This prevents the visual "doubling" where we alternate between crossings
    
    if (detectedPeriod > 400 && crossings.length > 1) {
      // LOW FREQUENCY PATH: Lock to same relative crossing rank when possible
      
      // Find the crossing closest to our previous rank
      let bestCrossing = crossings[0];
      
      // First try: exact rank match
      const sameRankCrossing = crossings.find(c => c.rank === lastCrossingRank);
      if (sameRankCrossing && sameRankCrossing.score > bestCrossing.score * 0.3) {
        bestCrossing = sameRankCrossing;
      } else {
        // Second try: find crossing with most similar phase fraction
        let bestPhaseMatch = Infinity;
        
        for (const crossing of crossings) {
          // Phase difference (handle wraparound)
          let phaseDiff = Math.abs(crossing.phaseFraction - lastTriggerPhaseFraction);
          phaseDiff = Math.min(phaseDiff, 1 - phaseDiff); // Handle wrap around
          
          // Combined score: prefer phase match but also consider signal quality
          // Lower is better
          const phaseWeight = 2.0; // Prioritize phase stability
          const combinedScore = phaseDiff * phaseWeight - crossing.score * 0.05;
          
          if (combinedScore < bestPhaseMatch) {
            bestPhaseMatch = combinedScore;
            bestCrossing = crossing;
          }
        }
      }
      
      lastCrossingRank = bestCrossing.rank;
      lastTriggerPhaseFraction = bestCrossing.phaseFraction;
      return bestCrossing.exactPos;
    }
    
    // HIGHER FREQUENCY PATH: Use best scoring crossing
    const bestCrossing = crossings.reduce((best, curr) => 
      curr.score > best.score ? curr : best, crossings[0]);
    
    lastCrossingRank = bestCrossing.rank;
    lastTriggerPhaseFraction = bestCrossing.phaseFraction;
    return bestCrossing.exactPos;
  }

  /**
   * Draw oscilloscope mode - full trace of waveform buffer.
   * Uses pitch detection for stable triggering, but displays a FIXED TIME WINDOW
   * so that wavelength visually changes with frequency (like MiniMeters).
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
    
    // Find trigger point (returns fractional sample index for sub-sample precision)
    const triggerPos = findTriggerPoint();
    
    // Use a FIXED TIME WINDOW - this makes wavelength visually change with frequency
    const sampleRate = analyser.context.sampleRate;
    const totalSamples = Math.floor(sampleRate * OSCILLOSCOPE_TIME_WINDOW);
    
    // Calculate how many samples we can actually show
    const triggerInt = Math.floor(triggerPos);
    const triggerFrac = triggerPos - triggerInt;
    const samplesToShow = Math.min(totalSamples, timeData.length - triggerInt - 2);
    
    if (samplesToShow <= 0) {
      return;
    }
    
    // Draw waveform with sub-sample interpolation
    ctx.beginPath();
    const sliceWidth = width / totalSamples;
    const mid = height / 2;
    const amplitude = mid * 0.9;
    
    for (let i = 0; i < samplesToShow; i++) {
      // Use linear interpolation for sub-sample accuracy
      const samplePos = triggerPos + i;
      const sampleInt = Math.floor(samplePos);
      const sampleFrac = samplePos - sampleInt;
      
      if (sampleInt + 1 >= timeData.length) break;
      
      // Linear interpolation between samples
      const value = timeData[sampleInt] * (1 - sampleFrac) + timeData[sampleInt + 1] * sampleFrac;
      
      const x = i * sliceWidth;
      const y = mid - value * amplitude;
      
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
      lastDetectedPeriod = 0;
      lastTriggerPhaseFraction = 0;
      lastCrossingRank = 0;
    }
  };
}

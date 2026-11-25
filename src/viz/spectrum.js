/* spectrum.js – Log-frequency spectrum analyzer renderer */

/**
 * Creates a spectrum analyzer renderer.
 * @param {CanvasRenderingContext2D} ctx
 * @param {AnalyserNode} analyser
 * @returns {Object} Renderer with draw() and resize() methods
 */
export function createSpectrumRenderer(ctx, analyser) {
  const freqData = new Float32Array(analyser.frequencyBinCount);
  
  const BINS_PER_BUCKET = 8;
  const BUCKETS = freqData.length / BINS_PER_BUCKET;

  let width = 0;
  let height = 0;
  let logWidth = Math.log10(freqData.length);

  const logX = (bin) => (Math.log10(bin + 1) / logWidth) * width;

  const dbRange = analyser.maxDecibels - analyser.minDecibels;
  const mapY = (db) => {
    const n = Math.min(1, Math.max(0, (db - analyser.minDecibels) / dbRange));
    return height - n * height;
  };

  return {
    /**
     * Update dimensions after resize.
     * @param {number} w - CSS width
     * @param {number} h - CSS height
     */
    resize(w, h) {
      width = w;
      height = h;
    },

    /**
     * Draw the spectrum curve.
     */
    draw() {
      if (width === 0 || height === 0) return;

      analyser.getFloatFrequencyData(freqData);
      ctx.clearRect(0, 0, width, height);

      ctx.beginPath();
      let sum = 0;
      for (let j = 0; j < BINS_PER_BUCKET; j++) sum += freqData[j];
      let avg = sum / BINS_PER_BUCKET;
      let px = 0, py = mapY(avg);
      ctx.moveTo(px, py);

      for (let b = 1; b < BUCKETS; b++) {
        const start = b * BINS_PER_BUCKET;
        sum = 0;
        for (let j = 0; j < BINS_PER_BUCKET; j++) sum += freqData[start + j];
        avg = sum / BINS_PER_BUCKET;

        const cx = logX(start);
        const cy = mapY(avg);

        const midX = (px + cx) / 2;
        const midY = (py + cy) / 2;
        ctx.quadraticCurveTo(px, py, midX, midY);

        px = cx;
        py = cy;
      }

      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, 'rgba(0,255,255,0.8)');
      grad.addColorStop(1, 'rgba(0,0,128,0.1)');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  };
}

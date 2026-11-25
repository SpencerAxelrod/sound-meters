/* canvas-utils.js – DPI scaling and canvas helpers */

/**
 * Sets up a canvas for high-DPI rendering.
 * Returns the CSS dimensions for use in drawing calculations.
 * @param {HTMLCanvasElement} canvas
 * @returns {{ ctx: CanvasRenderingContext2D, width: number, height: number }}
 */
export function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  return { ctx, width: rect.width, height: rect.height };
}

/**
 * Clears the entire canvas using CSS dimensions.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width - CSS width
 * @param {number} height - CSS height
 */
export function clearCanvas(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
}

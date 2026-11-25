/* controls.js – UI control handlers */

/**
 * Sets up the waveform mode selector.
 * @param {HTMLSelectElement} selector - The mode select element
 * @param {Function} onChange - Callback when mode changes
 * @param {string} initialMode - Initial mode value
 */
export function setupWaveformModeSelector(selector, onChange, initialMode) {
  selector.value = initialMode;
  
  selector.addEventListener('change', () => {
    onChange(selector.value);
  });
}

/**
 * Updates the toggle button state.
 * @param {HTMLButtonElement} button
 * @param {boolean} isCapturing
 * @param {boolean} disabled
 */
export function updateToggleButton(button, isCapturing, disabled = false) {
  button.textContent = isCapturing ? 'Stop' : 'Start';
  button.disabled = disabled;
}

/**
 * Updates the status display.
 * @param {HTMLElement} statusEl
 * @param {string} text
 */
export function setStatus(statusEl, text) {
  statusEl.textContent = text;
}

/**
 * Shows an error message.
 * @param {HTMLElement} errBox
 * @param {HTMLElement} statusEl
 * @param {string} message
 */
export function showError(errBox, statusEl, message) {
  errBox.hidden = false;
  errBox.textContent = message;
  setStatus(statusEl, 'Error');
}

/**
 * Clears the error display.
 * @param {HTMLElement} errBox
 */
export function clearError(errBox) {
  errBox.hidden = true;
  errBox.textContent = '';
}

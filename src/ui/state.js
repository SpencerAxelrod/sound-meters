/* state.js – Application state management */

/**
 * @typedef {Object} AppState
 * @property {boolean} isCapturing - Whether audio capture is active
 * @property {MediaStream|null} stream - The current media stream
 * @property {AudioContext|null} audioContext - The current audio context
 * @property {number|null} animationId - The current animation frame ID
 * @property {string} waveformMode - Current waveform display mode
 */

/**
 * Creates an application state manager.
 * @returns {Object} State manager with get/set methods
 */
export function createStateManager() {
  /** @type {AppState} */
  const state = {
    isCapturing: false,
    stream: null,
    audioContext: null,
    animationId: null,
    waveformMode: 'oscilloscope'
  };

  const listeners = new Set();

  return {
    /**
     * Get a state property.
     * @param {string} key
     * @returns {any}
     */
    get(key) {
      return state[key];
    },

    /**
     * Set a state property and notify listeners.
     * @param {string} key
     * @param {any} value
     */
    set(key, value) {
      const oldValue = state[key];
      state[key] = value;
      
      if (oldValue !== value) {
        listeners.forEach(fn => fn(key, value, oldValue));
      }
    },

    /**
     * Subscribe to state changes.
     * @param {Function} fn - Callback(key, newValue, oldValue)
     * @returns {Function} Unsubscribe function
     */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /**
     * Get all state (for debugging).
     * @returns {AppState}
     */
    getAll() {
      return { ...state };
    }
  };
}

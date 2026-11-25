/* capture.js – Tab audio capture management */

/**
 * Capture audio from the current tab.
 * @returns {Promise<MediaStream>} The captured media stream
 */
export function captureTabAudio() {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
      const err = chrome.runtime.lastError;
      if (err || !stream) {
        reject(err ?? new Error('Permission denied or no audio available'));
      } else {
        resolve(stream);
      }
    });
  });
}

/**
 * Stop all tracks in a media stream.
 * @param {MediaStream} stream
 */
export function stopStream(stream) {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
}

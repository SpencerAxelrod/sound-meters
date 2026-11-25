/* graph.js – Audio graph construction */

/**
 * @typedef {Object} AudioGraph
 * @property {AudioContext} context - The audio context
 * @property {MediaStreamAudioSourceNode} source - The media stream source
 * @property {AnalyserNode} analyser - The analyser node for FFT/time data
 */

/**
 * Build the audio processing graph from a media stream.
 * @param {MediaStream} stream - The captured media stream
 * @returns {Promise<AudioGraph>} The constructed audio graph
 */
export async function buildAudioGraph(stream) {
  const context = new AudioContext();
  await context.resume();

  const source = context.createMediaStreamSource(stream);
  
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.minDecibels = -90;
  analyser.maxDecibels = -10;
  analyser.smoothingTimeConstant = 0.6;

  // Connect: source -> analyser -> destination
  // tabCapture intercepts audio, so we must route to destination for playback
  source.connect(analyser);
  analyser.connect(context.destination);

  return { context, source, analyser };
}

/**
 * Tear down the audio graph, closing the context.
 * @param {AudioContext} context
 */
export async function destroyAudioGraph(context) {
  if (context) {
    try {
      await context.close();
    } catch (e) {
      // Ignore errors during cleanup
    }
  }
}

// Ambient declarations for the audio engines Phoebe Studio lazy-loads.
// The RNNoise sync build is plain emscripten glue with no shipped types;
// we cast it to the small surface we use in studioVoice.ts (denoise()).
declare module "@jitsi/rnnoise-wasm/dist/rnnoise-sync" {
  const createRNNWasmModuleSync: () => unknown;
  export default createRNNWasmModuleSync;
}

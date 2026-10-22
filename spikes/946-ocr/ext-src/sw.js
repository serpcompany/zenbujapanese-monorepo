self.addEventListener("install", () => self.skipWaiting());
self.probe = async () => ({
  wasm: typeof WebAssembly === "object",
  gpu: !!self.navigator?.gpu && !!(await self.navigator.gpu.requestAdapter().catch(() => null)),
  sab: typeof SharedArrayBuffer === "function",
  isolated: self.crossOriginIsolated === true,
  textDetector: typeof self.TextDetector === "function",
  languageModel: typeof self.LanguageModel === "function",
});

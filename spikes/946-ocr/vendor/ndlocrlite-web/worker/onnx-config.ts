import * as ort from "onnxruntime-web/webgpu";

export const ndlOrtOptions: { executionProviders: string[] } = { executionProviders: ["wasm"] };

export async function createSession(modelData: ArrayBuffer, options: Record<string, unknown> = {}) {
  return ort.InferenceSession.create(modelData, { graphOptimizationLevel: "all", ...options, ...ndlOrtOptions } as never);
}

export { ort };

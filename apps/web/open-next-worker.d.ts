declare module '*/.open-next/worker.js' {
  const openNextWorker: {
    fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response>
  }
  export default openNextWorker
}

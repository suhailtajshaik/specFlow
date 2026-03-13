import type { MiddlewareHandler } from 'hono'

interface TraceData {
  requestId: string
  method: string
  path: string
  startTime: number
  authTime?: number
  embedTime?: number
  retrieveTime?: number
  promptTime?: number
  inferenceTime?: number
  validationTime?: number
  endTime?: number
  error?: string
}

export const traceMiddleware: MiddlewareHandler = async (c, next) => {
  const trace: TraceData = {
    requestId: c.get('requestId') as string,
    method: c.req.method,
    path: c.req.path,
    startTime: Date.now(),
  }

  // Store trace in context
  c.set('trace', trace)

  try {
    await next()
    trace.endTime = Date.now()
    logTrace(trace)
  } catch (error) {
    trace.error = error instanceof Error ? error.message : String(error)
    trace.endTime = Date.now()
    logTrace(trace)
    throw error
  }
}

function logTrace(trace: TraceData) {
  const duration = trace.endTime ? trace.endTime - trace.startTime : 0
  
  const timings: Record<string, number> = {}
  if (trace.authTime) timings.auth = trace.authTime
  if (trace.embedTime) timings.embed = trace.embedTime
  if (trace.retrieveTime) timings.retrieve = trace.retrieveTime
  if (trace.promptTime) timings.prompt = trace.promptTime
  if (trace.inferenceTime) timings.inference = trace.inferenceTime
  if (trace.validationTime) timings.validation = trace.validationTime

  console.log(JSON.stringify({
    level: trace.error ? 'error' : 'info',
    requestId: trace.requestId,
    method: trace.method,
    path: trace.path,
    duration,
    timings,
    error: trace.error,
    timestamp: new Date().toISOString(),
  }))
}

export function updateTrace(c: any, step: string, duration: number) {
  const trace = c.get('trace') as TraceData | undefined
  if (!trace) return

  switch (step) {
    case 'auth':
      trace.authTime = duration
      break
    case 'embed':
      trace.embedTime = duration
      break
    case 'retrieve':
      trace.retrieveTime = duration
      break
    case 'prompt':
      trace.promptTime = duration
      break
    case 'inference':
      trace.inferenceTime = duration
      break
    case 'validation':
      trace.validationTime = duration
      break
  }
}
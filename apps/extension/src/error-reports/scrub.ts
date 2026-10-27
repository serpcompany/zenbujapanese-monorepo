import type { ErrorEvent, Exception, StackFrame } from '@sentry/browser'

const keptTags = ['part'] as const

const keptContexts = ['browser', 'os', 'runtime', 'device', 'trace'] as const

const keptHeaders = ['User-Agent'] as const

const textRules: [RegExp, string][] = [
  [/"[^"\n]*"/g, '<quoted>'],
  [/“[^“”\n]*”/g, '<quoted>'],
  [/「[^「」\n]*」/g, '<quoted>'],
  [/『[^『』\n]*』/g, '<quoted>'],
  [/\b[a-z][a-z\d+.-]{0,31}:\/\/[^\s"'<>()]+/gi, '<url>'],
  [/[々぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ\u{20000}-\u{3FFFF}]+/gu, '<japanese>']
]

const extensionUrl = /^chrome-extension:\/\//

export function scrubText(text: string): string {
  return textRules.reduce(
    (scrubbed, [rule, placeholder]) => scrubbed.replace(rule, placeholder),
    text
  )
}

function pick<V>(
  source: Record<string, V> | undefined,
  keys: readonly string[]
): Record<string, V> {
  return Object.fromEntries(Object.entries(source ?? {}).filter(([key]) => keys.includes(key)))
}

function scrubLocation(location: string | undefined): string | undefined {
  if (location === undefined || extensionUrl.test(location)) return location
  return '<page>'
}

function scrubFrame(frame: StackFrame): StackFrame {
  const { vars, pre_context, context_line, post_context, module_metadata, ...kept } = frame
  return {
    ...kept,
    filename: scrubLocation(frame.filename),
    abs_path: scrubLocation(frame.abs_path)
  }
}

function scrubException(exception: Exception): Exception {
  const { value, mechanism, stacktrace, ...kept } = exception
  const { data, ...keptMechanism } = mechanism ?? { type: 'generic' }
  return {
    ...kept,
    value: value === undefined ? undefined : scrubText(value),
    mechanism: mechanism && keptMechanism,
    stacktrace: stacktrace && { frames: stacktrace.frames?.map(scrubFrame) }
  }
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const {
    breadcrumbs,
    extra,
    user,
    server_name,
    transaction,
    request,
    tags,
    contexts,
    message,
    logentry,
    exception,
    debug_meta,
    ...kept
  } = event
  const headers = pick(request?.headers, keptHeaders)
  return {
    ...kept,
    message: message === undefined ? undefined : scrubText(message),
    logentry:
      logentry?.message === undefined ? undefined : { message: scrubText(logentry.message) },
    exception: exception && { values: exception.values?.map(scrubException) },
    request: Object.keys(headers).length > 0 ? { headers } : undefined,
    tags: pick(tags, keptTags),
    contexts: pick(contexts, keptContexts),
    debug_meta: debug_meta && {
      images: debug_meta.images?.filter(image =>
        extensionUrl.test('code_file' in image ? (image.code_file ?? '') : '')
      )
    }
  }
}

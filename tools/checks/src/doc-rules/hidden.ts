const toolMarkers = /^<!-- (BEGIN|END):nextjs-agent-rules -->$/

export function hiddenComments(prose: string): { line: number; text: string }[] {
  const found: { line: number; text: string }[] = []
  const withoutCode = prose.replace(/`[^`\n]*`/g, match => ' '.repeat(match.length))
  for (const match of withoutCode.matchAll(/<!--[\s\S]*?-->/g)) {
    if (toolMarkers.test(match[0])) continue
    const line = withoutCode.slice(0, match.index).split('\n').length
    found.push({ line, text: match[0].split('\n')[0].slice(0, 60) })
  }
  return found
}

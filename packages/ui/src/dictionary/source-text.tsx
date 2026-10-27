export function SourceText({ text, lang }: { text: string; lang?: string }) {
  return lang ? <span lang={lang}>{text}</span> : text
}

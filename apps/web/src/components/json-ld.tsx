function jsonThatCannotCloseItsScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonThatCannotCloseItsScript(data) }}
    />
  )
}

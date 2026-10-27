import { describe, expect, test } from 'vitest'
import { readXML } from './xml'

function events(document: string): string[] | null {
  const seen: string[] = []
  const readable = readXML(document, {
    opened: (name, attributes) => seen.push(`<${name}${JSON.stringify([...attributes])}`),
    closed: name => seen.push(`</${name}`),
    text: value => seen.push(value)
  })
  return readable ? seen : null
}

describe('readXML (what XMLParser read for YouTubeCaptionParsing)', () => {
  test('reports elements, attributes, and text with XML’s references resolved', () => {
    expect(
      events(
        '\ufeff<?xml version="1.0"?><!DOCTYPE t><!-- c --><t a="1 &amp; 2" b = \'&#x3c;\'>x &lt;&#26412;&gt;<u/><![CDATA[<y>]]></t>\n'
      )
    ).toEqual(['<t[["a","1 & 2"],["b","<"]]', 'x <本>', '<u[]', '</u', '<y>', '</t'])
  })

  test('turns tabs and line breaks in an attribute into spaces', () => {
    expect(events('<t a="1\n2\t3"></t>')).toEqual(['<t[["a","1 2 3"]]', '</t'])
  })

  test('refuses what isn’t well-formed', () => {
    const malformed = [
      '',
      '   ',
      'text',
      '<html><body>Our systems have detected unusual traffic',
      '<a></b>',
      '<a></a><b></b>',
      '<a>&nbsp;</a>',
      '<a>& b</a>',
      '<a>&#0;</a>',
      '<a>&#xD800;</a>',
      '<a b=1></a>',
      '<a b="1"c="2"></a>',
      '<a b="1" b="2"></a>',
      '<a b="<"></a>',
      '<a>]]></a>',
      '<a/>text',
      '<a/><![CDATA[x]]>',
      '<a><!-- open</a>',
      '<a></a ',
      '</a>',
      '<a></a/>',
      '<a></a b="1">',
      ' <?xml version="1.0"?><a/>',
      '<a/><!DOCTYPE a>',
      '<!a>'
    ]
    for (const document of malformed) expect(events(document), document).toBeNull()
  })

  test('accepts an empty root, space around it, and processing instructions', () => {
    expect(events(' <a/> ')).toEqual(['<a[]', '</a'])
    expect(events('<?xml-stylesheet href="s"?><a ></a >')).toEqual(['<a[]', '</a'])
  })
})

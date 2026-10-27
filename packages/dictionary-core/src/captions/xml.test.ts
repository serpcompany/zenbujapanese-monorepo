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

  test('refuses a control character as XMLParser does, written raw or as a reference', () => {
    const controlled = [
      '<a>\u0001</a>',
      '<a>&#1;</a>',
      '<a>&#x1;</a>',
      '<a b="\u0001"></a>',
      '<a b="&#x1;"></a>',
      '<a><!-- \u0001 --></a>',
      '<a><![CDATA[\u0001]]></a>',
      '<a>\u001f</a>',
      '<a>&#31;</a>',
      '<a>\ud800</a>',
      '<a>\uffff</a>',
      '<a>&#xFFFE;</a>',
      '<a>&#x110000;</a>'
    ]
    for (const document of controlled) expect(events(document), document).toBeNull()
  })

  test('reads the control characters XML allows: a tab and a line break, raw or as references', () => {
    expect(events('<a>1\t2&#9;3\n4&#xA;5&#13;</a>')).toEqual(['<a[]', '1\t2\t3\n4\n5\r', '</a'])
  })

  test('ends a comment at --!> as at -->', () => {
    expect(events('<a><!-- x --!>y<!-- z --></a>')).toEqual(['<a[]', 'y', '</a'])
  })

  test('reads a doctype’s internal subset', () => {
    expect(events('<!DOCTYPE a [<!ENTITY e "v">]><a/>')).toEqual(['<a[]', '</a'])
  })

  test('refuses an unclosed doctype of repeated brackets in linear time', () => {
    const started = performance.now()
    expect(events(`<!DOCTYPE[${']['.repeat(20_000)}`)).toBeNull()
    expect(performance.now() - started).toBeLessThan(1000)
  })

  test('accepts an empty root, space around it, and processing instructions', () => {
    expect(events(' <a/> ')).toEqual(['<a[]', '</a'])
    expect(events('<?xml-stylesheet href="s"?><a ></a >')).toEqual(['<a[]', '</a'])
  })
})

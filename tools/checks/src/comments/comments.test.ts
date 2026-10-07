import { describe, expect, test } from 'vitest'
import { commentsIn } from './find'

const texts = (language: Parameters<typeof commentsIn>[0], text: string, path = 'file') =>
  commentsIn(language, path, text).map(comment => comment.text)

describe('TypeScript', () => {
  test('finds line, block, JSDoc, trailing, and JSX comments', () => {
    const source = [
      '/** Documents the value. */',
      'const a = 1 // trailing',
      'const b = /* inline */ 2',
      'const view = <div>{/* in JSX */}</div>',
      '// at the end'
    ].join('\n')
    expect(texts('typescript', source, 'view.tsx')).toEqual([
      '/** Documents the value. */',
      '// trailing',
      '/* inline */',
      '/* in JSX */',
      '// at the end'
    ])
  })

  test('ignores comment markers inside strings, templates, regular expressions, and JSX text', () => {
    const source = [
      "const url = 'https://example.com/*'",
      'const template = `${url} // not a comment /* nor this */`',
      'const pattern = /\\/\\/+/g',
      'const view = <p>// shown on the page /* too */</p>',
      "const attribute = <a href='//cdn.example.com'>link</a>"
    ].join('\n')
    expect(texts('typescript', source, 'view.tsx')).toEqual([])
  })

  test('allows a shebang', () => {
    expect(texts('typescript', '#!/usr/bin/env node\nconsole.log(1)\n', 'run.mjs')).toEqual([])
  })

  test('finds tool directives, which are comments too', () => {
    const source = '// @ts-expect-error\nconst a: number = "x"\n// biome-ignore lint: reason\n'
    expect(texts('typescript', source, 'a.ts')).toHaveLength(2)
  })
})

describe('JSON', () => {
  test('finds comments outside strings only', () => {
    const source = '{\n  // a comment\n  "url": "https://example.com/*", /* block */\n  "a": 1\n}'
    expect(texts('json', source)).toEqual(['// a comment', '/* block */'])
  })
})

describe('Swift', () => {
  test('finds line, doc, nested block, and trailing comments', () => {
    const source = [
      '/// Documents the type.',
      'struct A {} // trailing',
      '/* outer /* nested */ still the comment */',
      'let b = 1'
    ].join('\n')
    expect(texts('swift', source)).toEqual([
      '/// Documents the type.',
      '// trailing',
      '/* outer /* nested */ still the comment */'
    ])
  })

  test('ignores markers in strings, multiline strings, raw strings, and interpolations', () => {
    const source = [
      'let url = "https://example.com/*"',
      'let raw = #"a "quoted" // part"#',
      'let nested = "value: \\("inner // text") done"',
      'let multiline = """',
      '  // inside the string',
      '  """',
      'let pattern = #/\\/\\//#',
      '#if DEBUG',
      '#endif'
    ].join('\n')
    expect(texts('swift', source)).toEqual([])
  })

  test('finds a comment inside an interpolation', () => {
    expect(texts('swift', 'let a = "\\(value /* why */)"')).toEqual(['/* why */'])
  })

  test("allows Package.swift's tools version only", () => {
    const source = '// swift-tools-version: 6.2\n// another\nimport PackageDescription\n'
    expect(texts('swift', source, 'Modules/Package.swift')).toEqual(['// another'])
    expect(texts('swift', source, 'Other.swift')).toHaveLength(2)
  })
})

describe('shell', () => {
  test('finds comments at the start of a word', () => {
    const source = '#!/usr/bin/env bash\n# heading\necho hi # trailing\n{ # grouped\n  true\n}\n'
    expect(texts('shell', source)).toEqual(['# heading', '# trailing', '# grouped'])
  })

  test('ignores # in parameters, quotes, substitutions, and heredocs', () => {
    const source = [
      'echo "$#" "${#items[@]}" "${path#./}" "${path##*/}"',
      "echo '# single' \"# double\" $'# ansi'",
      'value="$(printf "%s" "a # b")"',
      'echo $((16#ff)) a#b',
      'cat <<EOF',
      '# heredoc text',
      'EOF',
      "cat <<-'END'",
      '\t# more text',
      '\tEND',
      'grep -c x <<<"# here-string"'
    ].join('\n')
    expect(texts('shell', source)).toEqual([])
  })

  test('finds a comment inside a command substitution', () => {
    expect(texts('shell', 'value=$(\n  echo a # why\n)\n')).toEqual(['# why'])
  })
})

describe('YAML', () => {
  test("finds YAML comments and the shell comments in a workflow's run blocks", () => {
    const source = [
      '# heading',
      'on: push # trailing',
      'jobs:',
      '  a:',
      '    steps:',
      '      - run: |',
      '          echo "# not a comment"',
      '          # a shell comment',
      '          echo ${{ github.sha }}',
      "      - name: 'value # quoted'"
    ].join('\n')
    expect(texts('yaml', source, '.github/workflows/a.yml')).toEqual([
      '# heading',
      '# trailing',
      '# a shell comment'
    ])
    expect(texts('yaml', source, 'config.yml')).toEqual(['# heading', '# trailing'])
  })

  test("finds the shell comments in a git hook's run blocks", () => {
    const source = [
      'pre-push:',
      '  commands:',
      '    verify:',
      '      run: |',
      '        # a shell comment',
      '        pnpm verify'
    ].join('\n')
    expect(texts('yaml', source, 'lefthook.yml')).toEqual(['# a shell comment'])
  })

  test("reads a node step's run block as JavaScript", () => {
    const source = [
      'jobs:',
      '  a:',
      '    steps:',
      '      - shell: node {0}',
      '        run: |',
      "          const url = 'https://example.com/#anchor'",
      '          // a line comment',
      '          /* a block comment */',
      '          console.log(url)'
    ].join('\n')
    expect(texts('yaml', source, '.github/workflows/a.yml')).toEqual([
      '// a line comment',
      '/* a block comment */'
    ])
  })
})

describe('other languages', () => {
  test('TOML', () => {
    expect(texts('toml', 'a = "# text" # comment\n# line\n')).toEqual(['# comment', '# line'])
  })

  test('CSS', () => {
    expect(texts('css', 'a { content: "/* text */"; } /* comment */')).toEqual(['/* comment */'])
  })

  test('SQL', () => {
    expect(texts('sql', "SELECT '--' -- comment\n/* block */")).toEqual([
      '-- comment',
      '/* block */'
    ])
  })

  test('XML', () => {
    expect(texts('xml', '<a><![CDATA[<!-- data -->]]><!-- comment --></a>')).toEqual([
      '<!-- comment -->'
    ])
  })

  test('ignore files', () => {
    expect(texts('hash-lines', '# comment\nnode_modules/\n  # indented\n\\#literal\n')).toEqual([
      '# comment',
      '# indented'
    ])
  })

  test('Dockerfile', () => {
    expect(texts('dockerfile', '# syntax=docker/dockerfile:1\nRUN echo "#" # why\n')).toEqual([
      '# syntax=docker/dockerfile:1',
      '# why'
    ])
  })
})

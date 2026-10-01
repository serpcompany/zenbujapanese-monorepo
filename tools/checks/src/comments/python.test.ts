import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { pythonComments } from './python'

test('Python: finds comments, docstrings, and other string statements, but not a shebang', () => {
  const folder = mkdtempSync(join(tmpdir(), 'python-comments-'))
  writeFileSync(
    join(folder, 'a.py'),
    [
      '#!/usr/bin/env python3',
      '"""Module docstring."""',
      'import os  # noqa: F401',
      'URL = "https://example.com/#anchor"',
      'def run():',
      '    """Function docstring."""',
      '    # a comment',
      "    return f'{URL}#{1}'",
      ''
    ].join('\n')
  )
  const found = pythonComments(folder, ['a.py']).get('a.py')
  expect(found?.map(comment => [comment.line, comment.text])).toEqual([
    [3, '# noqa: F401'],
    [7, '# a comment'],
    [2, '"""Module docstring."""'],
    [6, '"""Function docstring."""']
  ])
})

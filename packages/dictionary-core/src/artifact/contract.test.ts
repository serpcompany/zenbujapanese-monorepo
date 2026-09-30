import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, test } from 'vitest'
import { answeredContract, dictionaryContract } from './contract'

const recordedShapes: Readonly<Record<number, string>> = {
  1: '0ba1a72450be2bf7'
}

const plainFlags =
  ts.TypeFlags.String |
  ts.TypeFlags.Number |
  ts.TypeFlags.BigInt |
  ts.TypeFlags.Null |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Unknown |
  ts.TypeFlags.Any |
  ts.TypeFlags.Never |
  ts.TypeFlags.BooleanLiteral

function describeType(checker: ts.TypeChecker, type: ts.Type, open: Set<ts.Type>): string {
  const describe = (inner: ts.Type) => describeType(checker, inner, open)
  if (type.flags & ts.TypeFlags.Boolean) return 'boolean'
  if (type.isUnion()) return type.types.map(describe).sort().join(' | ')
  if (type.isStringLiteral()) return JSON.stringify(type.value)
  if (type.isNumberLiteral()) return String(type.value)
  if (type.flags & plainFlags) return checker.typeToString(type)
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    const elements = checker.getTypeArguments(type as ts.TypeReference).map(describe)
    return checker.isArrayType(type) ? `${elements[0]}[]` : `[${elements.join(', ')}]`
  }
  if (open.has(type)) return `recursive ${checker.typeToString(type)}`
  open.add(type)
  const indexes = checker
    .getIndexInfosOfType(type)
    .map(info => `[${checker.typeToString(info.keyType)}]: ${describe(info.type)}`)
  const properties = checker
    .getPropertiesOfType(type)
    .map(property => {
      const optional = property.flags & ts.SymbolFlags.Optional ? '?' : ''
      return `${property.name}${optional}: ${describe(checker.getTypeOfSymbol(property))}`
    })
    .sort()
  open.delete(type)
  return `{ ${[...indexes, ...properties].join('; ')} }`
}

function contractShape(): string {
  const file = fileURLToPath(new URL('./contract.ts', import.meta.url))
  const program = ts.createProgram([file], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    resolveJsonModule: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    types: []
  })
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(file)
  const declaration = source?.statements
    .filter(ts.isInterfaceDeclaration)
    .find(statement => statement.name.text === 'DictionaryContract')
  if (!declaration) throw new Error('contract.ts declares no DictionaryContract')
  return describeType(checker, checker.getTypeAtLocation(declaration.name), new Set())
}

const shapeHash = (shape: string) => createHash('sha256').update(shape).digest('hex').slice(0, 16)

test('every response shape is recorded under the contract that answers it', () => {
  expect(
    recordedShapes[dictionaryContract],
    'A response shape the service answers with changed (DictionaryContract in src/artifact/contract.ts), so a site and a service deployed apart would misread each other. Raise dictionaryContract by one and record this shape under the new number; never change a recorded one (docs/agents/dictionary-core.md, Rules).'
  ).toBe(shapeHash(contractShape()))
})

test('the current contract is the newest one recorded', () => {
  expect(Math.max(...Object.keys(recordedShapes).map(Number))).toBe(dictionaryContract)
  expect(new Set(Object.values(recordedShapes)).size).toBe(Object.keys(recordedShapes).length)
})

test('a service that names no contract answers the first one', () => {
  expect(answeredContract(null)).toBe(1)
  expect(answeredContract(undefined)).toBe(1)
  expect(answeredContract('2')).toBe(2)
  expect(answeredContract(3)).toBe(3)
})

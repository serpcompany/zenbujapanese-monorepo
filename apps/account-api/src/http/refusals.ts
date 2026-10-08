import { z } from '@hono/zod-openapi'

export const json = <T>(schema: T, description: string) => ({
  content: { 'application/json': { schema } },
  description
})

export const errorObject = (codes: readonly string[]) =>
  z.object({
    code: z.string().openapi({ enum: [...codes] }),
    message: z.string()
  })

export type Meanings = Readonly<Record<string, string>>

export const meaningsText = (meanings: Meanings) =>
  Object.entries(meanings)
    .map(([code, meaning]) => `\`${code}\`: ${meaning}`)
    .join(' ')

export const refusalSchema = (meanings: Meanings) =>
  z.object({ error: errorObject(Object.keys(meanings)) })

export const refusal = (meanings: Meanings) => json(refusalSchema(meanings), meaningsText(meanings))

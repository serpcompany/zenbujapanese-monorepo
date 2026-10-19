import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import type { Scope } from '../domain/clients'
import type { PhotoFile } from '../domain/kept-store'
import { type PhotoFiles, photoLimits } from '../domain/photo-files'
import type { AccountEnv } from './env'
import { errorBody } from './errors'
import { requestsPerMinute, uploadsAtOnce } from './rate-limit'
import { json, refusal } from './refusals'
import { failed, needsOneOf, refuse, tooMany, unauthorized } from './route-answers'

const megabytes = photoLimits.bytes / 1024 / 1024
const imageTypes = 'JPEG, PNG, HEIC, HEIF, AVIF, GIF, WebP, TIFF, or BMP'

export const photoBodyLimit = photoLimits.bytes

const PhotoIdParameter = z.object({
  photoId: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .openapi({
      param: { name: 'photoId', in: 'path' },
      pattern: '^[0-9a-f]{64}$',
      description: "The SHA-256 of the photo's file, in 64 lowercase hex digits."
    })
})

const PhotoFileSchema = z
  .object({
    id: z.string().openapi({ description: "The SHA-256 of the file's bytes." }),
    contentType: z.string().openapi({
      description: 'The image type, read from the bytes themselves, such as `image/jpeg`.'
    }),
    byteSize: z.int().min(1).max(photoLimits.bytes),
    uploadedAt: z.iso.datetime()
  })
  .openapi('PhotoFile')

const binary = z.string().openapi({ type: 'string', format: 'binary' })

const unavailable = refusal({
  photos_unavailable:
    'This service keeps no photos here yet. Keep the photo on the device, and try again later.'
})

const uploadPhoto = createRoute({
  method: 'put',
  path: '/v1/photos/{photoId}',
  summary: "Upload a photo's file",
  description: `The file of a Media Library photo or the profile photo, before the sync change that names it (\`photo\`'s \`add\`, or \`profilePhoto\`'s \`set\`). The body is the file's bytes, at most ${megabytes} MB, ${imageTypes}; the service reads the type from the bytes, not from \`Content-Type\`, and keeps them as they are. Uploading a file the account holds changes nothing. A file no photo names 24 hours after its upload is deleted. An account holds at most ${photoLimits.photos.toLocaleString('en-US')} files, the profile photo's included.`,
  security: needsOneOf('photos:write', 'profile'),
  request: {
    params: PhotoIdParameter,
    body: {
      content: { 'image/*': { schema: binary } },
      required: true,
      description: "The file's bytes."
    }
  },
  responses: {
    200: json(PhotoFileSchema, 'The account already held this file.'),
    201: json(PhotoFileSchema, 'The file is kept.'),
    400: refusal({
      bad_request: '`photoId` is not 64 lowercase hex digits.',
      photo_digest_mismatch:
        "The bytes' SHA-256 isn't `photoId`: the upload was cut short or changed."
    }),
    401: unauthorized,
    403: refusal({
      insufficient_scope:
        "This app's access to the account doesn't include `photos:write` or `profile`."
    }),
    409: refusal({
      too_many_photos: `The account holds ${photoLimits.photos.toLocaleString('en-US')} files. Remove a photo first.`
    }),
    413: refusal({ too_large: `The file is over ${megabytes} MB.` }),
    415: refusal({ unsupported_photo: `The file isn't a ${imageTypes} image.` }),
    429: refusal({
      too_many_requests: `This account sent more than ${requestsPerMinute.photos} requests here from this app in the current minute, the app more than its limit from all its accounts together, or the service is taking ${uploadsAtOnce} uploads already. Wait the seconds \`Retry-After\` says.`
    }),
    500: failed,
    503: unavailable
  }
})

const downloadPhoto = createRoute({
  method: 'get',
  path: '/v1/photos/{photoId}',
  summary: "Download a photo's file",
  description:
    "The bytes uploaded, with their type. A file never changes under its ID, so the answer may be kept for good. An app with `photos:read` reads every file the account holds; one with only `profile` reads only the profile photo's.",
  security: needsOneOf('photos:read', 'profile'),
  request: { params: PhotoIdParameter },
  responses: {
    200: {
      content: { 'image/*': { schema: binary } },
      description: 'The file.',
      headers: {
        'Cache-Control': {
          description:
            '`private, max-age=31536000, immutable`: the file under this ID never changes.',
          schema: { type: 'string' }
        },
        ETag: { description: 'The photo ID, quoted.', schema: { type: 'string' } }
      }
    },
    400: refusal({ bad_request: '`photoId` is not 64 lowercase hex digits.' }),
    401: unauthorized,
    403: refusal({
      insufficient_scope:
        "This app's access to the account doesn't include `photos:read` or `profile`."
    }),
    404: refusal({
      not_found: "The account holds no file with that ID, or this app's scopes don't reach it."
    }),
    429: tooMany(requestsPerMinute.photos),
    500: failed,
    503: unavailable
  }
})

const fileJson = (file: PhotoFile) => ({
  id: file.id,
  contentType: file.contentType,
  byteSize: file.byteSize,
  uploadedAt: file.uploadedAt.toISOString()
})

const refused = (
  context: Context<AccountEnv>,
  status: 400 | 409 | 415 | 503,
  code: string,
  message: string
) => context.json(errorBody(code, message), status)

export function photoRoutes(app: OpenAPIHono<AccountEnv>, files: PhotoFiles) {
  app.openapi(uploadPhoto, async context => {
    const { photoId } = context.req.valid('param')
    const bytes = new Uint8Array(await context.req.arrayBuffer())
    const upload = await files.upload(context.get('userId'), photoId, bytes)
    if (upload.status === 'stored') return context.json(fileJson(upload.file), 201)
    if (upload.status === 'kept') return context.json(fileJson(upload.file), 200)
    if (upload.status === 'no_account') return refuse(context)
    if (upload.status === 'digest_mismatch') {
      return refused(
        context,
        400,
        'photo_digest_mismatch',
        "The bytes' SHA-256 isn't the photo ID."
      )
    }
    if (upload.status === 'unsupported') {
      return refused(context, 415, 'unsupported_photo', `Send a ${imageTypes} image.`)
    }
    if (upload.status === 'too_many') {
      return refused(context, 409, 'too_many_photos', 'The account holds as many photos as it can.')
    }
    return refused(context, 503, 'photos_unavailable', 'Photos are not kept here now.')
  })

  app.openapi(downloadPhoto, async context => {
    const { photoId } = context.req.valid('param')
    const scopes: ReadonlySet<Scope> = context.get('scopes')
    const found = await files.download(context.get('userId'), photoId, scopes)
    if (found.status === 'unavailable') {
      return refused(context, 503, 'photos_unavailable', 'Photos are not kept here now.')
    }
    if (found.status === 'no_account') return refuse(context)
    if (found.status === 'missing') {
      return context.json(errorBody('not_found', 'The account holds no such photo.'), 404)
    }
    return context.body(found.bytes, 200, {
      'Content-Type': found.file.contentType,
      'Cache-Control': 'private, max-age=31536000, immutable',
      ETag: `"${found.file.id}"`
    })
  })
}

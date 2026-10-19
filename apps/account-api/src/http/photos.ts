import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import type { Scope } from '../domain/clients'
import type { PhotoFile } from '../domain/kept-store'
import type { PhotoFiles } from '../domain/photo-files'
import { photoLimits } from '../domain/photo-limits'
import type { AccountEnv } from './env'
import { errorBody } from './errors'
import { atOnce, requestsPerMinute } from './rate-limit'
import { json, refusal } from './refusals'
import { failed, needsOneOf, refuse, unauthorized } from './route-answers'

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
  description: `The file of a Media Library photo or the profile photo, before the sync change that names it (\`photo\`'s \`add\`, or \`profilePhoto\`'s \`set\`). The body is the file's bytes, at most ${megabytes} MB, ${imageTypes}; the service reads the type from the bytes, not from \`Content-Type\`, and keeps them as they are. Uploading a file the account holds changes nothing, unless its storage lost it, which this puts back. A file no photo names 24 hours after its upload is deleted. An account holds at most ${photoLimits.photos.toLocaleString('en-US')} files, the profile photo's and an emptied photo's for its 30 days included. An app with only \`profile\` holds at most ${photoLimits.profileUploads} files it uploaded, the profile photo and the one replacing it, which may be ones the Media Library holds too; it's answered as though the library held nothing, \`201\` or \`409\`, so it learns nothing of the library, and may set only a file it uploaded as the profile photo.`,
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
      too_many_photos: `The account holds ${photoLimits.photos.toLocaleString('en-US')} files, or an app with only \`profile\` holds the ${photoLimits.profileUploads} it may. Keep the photo on the device; send it again once a photo is deleted, or set the profile photo to one of the two.`
    }),
    413: refusal({ too_large: `The file is over ${megabytes} MB.` }),
    415: refusal({ unsupported_photo: `The file isn't a ${imageTypes} image.` }),
    429: refusal({
      too_many_requests: `This account sent more than ${requestsPerMinute.photos} requests here from this app in the current minute, the app more than its limit from all its accounts together, or the service is taking ${atOnce.uploads.service} uploads at once, ${atOnce.uploads.account} from this account. Wait the seconds \`Retry-After\` says.`
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
    "The bytes uploaded, with their type, streamed. A file never changes under its ID, so the answer may be kept for good. An app with `photos:read` reads every file the account holds; one with only `profile` reads only the profile photo's.",
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
        ETag: { description: 'The photo ID, quoted.', schema: { type: 'string' } },
        'Content-Disposition': {
          description: '`attachment`, with the photo ID as its file name.',
          schema: { type: 'string' }
        },
        'X-Content-Type-Options': { description: '`nosniff`.', schema: { type: 'string' } }
      }
    },
    400: refusal({ bad_request: '`photoId` is not 64 lowercase hex digits.' }),
    401: unauthorized,
    403: refusal({
      insufficient_scope:
        "This app's access to the account doesn't include `photos:read` or `profile`."
    }),
    404: refusal({
      not_found:
        "The account holds no file with that ID, or this app's scopes don't reach it. Never delete a photo for it: if the account deleted it, the photo's `delete` comes down in sync.",
      photo_file_missing:
        "The account names the file, but its storage hasn't it, as after a restore. Upload it again if the device has it; otherwise try again later. Never delete the photo for it."
    }),
    429: refusal({
      too_many_requests: `This account sent more than ${requestsPerMinute.photos} requests here from this app in the current minute, the app more than its limit from all its accounts together, or the account or the service is sending as many files as it may at once. Wait the seconds \`Retry-After\` says.`
    }),
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

export type PhotoRoutesFiles = Pick<PhotoFiles, 'upload' | 'download'>

export function photoRoutes(app: OpenAPIHono<AccountEnv>, files: PhotoRoutesFiles) {
  app.openapi(uploadPhoto, async context => {
    const { photoId } = context.req.valid('param')
    const bytes = new Uint8Array(await context.req.arrayBuffer())
    const upload = await files.upload(context.get('userId'), photoId, bytes, context.get('scopes'))
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
    if (found.status === 'file_missing') {
      return context.json(
        errorBody('photo_file_missing', "The photo's file isn't in storage. Upload it again."),
        404
      )
    }
    const size = found.photo.size
    return context.body(found.photo.body, 200, {
      'Content-Type': found.file.contentType,
      'Cache-Control': 'private, max-age=31536000, immutable',
      ETag: `"${found.file.id}"`,
      'Content-Disposition': `attachment; filename="${found.file.id}"`,
      'X-Content-Type-Options': 'nosniff',
      ...(size === null ? {} : { 'Content-Length': String(size) })
    })
  })
}

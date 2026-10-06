export interface ErrorBody {
  error: { code: string; message: string }
}

export function errorBody(code: string, message: string): ErrorBody {
  return { error: { code, message } }
}

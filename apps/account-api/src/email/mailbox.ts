export interface Message {
  to: string
  subject: string
  text: string
}

export interface CapturedMessage extends Message {
  at: string
}

const kept = 50

export class DevMailbox {
  readonly #messages: CapturedMessage[] = []

  add(message: Message): void {
    this.#messages.unshift({ ...message, at: new Date().toISOString() })
    this.#messages.length = Math.min(this.#messages.length, kept)
  }

  messages(): readonly CapturedMessage[] {
    return this.#messages
  }
}

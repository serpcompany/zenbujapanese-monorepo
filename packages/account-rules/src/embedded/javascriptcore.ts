import { answer } from './answers'

Object.assign(globalThis, {
  zenbuAccountRules: {
    answer,
    answerJSON: (rule: string, argument: string) => JSON.stringify(answer(rule, argument))
  }
})

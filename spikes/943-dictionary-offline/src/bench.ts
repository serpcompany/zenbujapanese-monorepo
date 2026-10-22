export const words = [
  '食べる', '日本語', '勉強', 'で', '行く', '見る', 'する', '来る', '学校', '先生',
  '学生', '友達', '時間', '今日', '明日', '昨日', '電車', '会社', '仕事', '本',
  '水', '飲む', '話す', '聞く', '読む', '書く', '買う', '大きい', '小さい', '新しい',
  '古い', '高い', '安い', '美しい', '静か', '有名', '元気', '好き', '嫌い', '上手',
  '天気', '雨', '雪', '春', '夏', '家族', '子供', '猫', '犬', '東京',
  '世界', '経済', '政治', '問題', '考える', '分かる', '食べた', '行きました', 'が', 'ありがとう'
]

export const ask = async (type: string, arg?: unknown): Promise<any> => {
  const answer = await chrome.runtime.sendMessage({ target: 'dictionary', type, arg })
  if (answer?.error) throw new Error(answer.error)
  return answer?.value
}

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]

export function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const round = (n: number) => Math.round(n * 100) / 100
  return { n: sorted.length, median: round(percentile(sorted, 50)), p95: round(percentile(sorted, 95)), max: round(sorted[sorted.length - 1]), min: round(sorted[0]) }
}

export async function bench(list: string[] = words) {
  const roundTrip: number[] = []
  const inWorker: number[] = []
  const samples: unknown[] = []
  for (const word of list) {
    const start = performance.now()
    const answer = await ask('lookup', word)
    roundTrip.push(performance.now() - start)
    inWorker.push(answer.ms)
    samples.push({ word, first: answer.first, ms: Math.round(answer.ms * 100) / 100 })
  }
  return { roundTrip: summary(roundTrip), inWorker: summary(inWorker), samples }
}

const minuteLength = 60_000

function inMinutes(retryAt: number, now: number): string {
  const minutes = Math.max(1, Math.ceil((retryAt - now) / minuteLength))
  return minutes === 1 ? 'a minute' : `${minutes} minutes`
}

export const captionLabels = {
  noJapaneseCaptions: 'No Japanese Captions',
  rateLimited: (retryAt: number, now: number) =>
    `YouTube isn't sending captions to your network right now. Zenbu will try again in ${inMinutes(retryAt, now)}.`,
  tryAgain: 'Try again',
  failed: {
    unavailable: "YouTube didn't open this video.",
    unreachable: "Zenbu couldn't reach YouTube.",
    unprepared: "Zenbu couldn't get ready to ask YouTube.",
    refused: "YouTube didn't send this video's captions.",
    unreadable: "This video's captions couldn't be read."
  }
}

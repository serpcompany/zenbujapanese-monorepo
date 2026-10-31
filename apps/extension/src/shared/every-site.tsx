import { Button } from '@zenbu/ui/components/button'
import { useEffect, useState } from 'react'
import { labels } from './labels'

const everySite = ['http://*/*', 'https://*/*']

function useEverySite(): boolean | null {
  const [granted, setGranted] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    const read = () => {
      chrome.permissions.contains({ origins: everySite }).then(
        found => {
          if (live) setGranted(found)
        },
        () => undefined
      )
    }
    read()
    chrome.permissions.onAdded.addListener(read)
    chrome.permissions.onRemoved.addListener(read)
    return () => {
      live = false
      chrome.permissions.onAdded.removeListener(read)
      chrome.permissions.onRemoved.removeListener(read)
    }
  }, [])
  return granted
}

export function EverySite() {
  const granted = useEverySite()
  if (granted === null) return null
  if (granted) {
    return (
      <p className="text-sm text-muted-foreground" data-every-site="on">
        {labels.everySite.on}
      </p>
    )
  }
  return (
    <div className="flex flex-col items-start gap-3" data-every-site="off">
      <p className="text-sm text-muted-foreground">{labels.everySite.off}</p>
      <Button
        onClick={() => {
          chrome.permissions.request({ origins: everySite }).catch(() => undefined)
        }}
      >
        {labels.everySite.turnOn}
      </Button>
    </div>
  )
}

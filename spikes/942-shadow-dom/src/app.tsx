import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import { createRoot } from 'react-dom/client'
import { RubyText } from '@/components/dictionary/ruby-text'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const popupClass = 'rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10'

function App({ shadowPortal }: { shadowPortal: HTMLElement }) {
  return (
    <div id="wrap" className="p-4 font-sans text-foreground">
      <Card id="card">
        <CardHeader><CardTitle id="title">食べる</CardTitle></CardHeader>
        <CardContent>
          <RubyText segments={[{ text: '食', reading: 'た' }, { text: 'べる' }]} className="text-2xl" />
          <Badge id="badge">N5</Badge>
          <Button id="btn" variant="outline">Mark as Known</Button>
          <span id="shadowfont" style={{ fontFamily: 'SpikeGeistShadow, monospace' }}>Hamburgefonstiv</span>
          <span id="docfont" style={{ fontFamily: 'SpikeGeistDoc, monospace' }}>Hamburgefonstiv</span>
          <span id="mono" style={{ fontFamily: 'monospace' }}>Hamburgefonstiv</span>
        </CardContent>
      </Card>
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger render={<Button variant="outline" />}>Default portal</DropdownMenuTrigger>
        <DropdownMenuContent className="default-portal-popup"><DropdownMenuItem>Item</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>
      <MenuPrimitive.Root defaultOpen>
        <MenuPrimitive.Trigger render={<Button variant="outline" />}>Shadow portal</MenuPrimitive.Trigger>
        <MenuPrimitive.Portal container={shadowPortal}>
          <MenuPrimitive.Positioner className="isolate z-50">
            <MenuPrimitive.Popup id="shadow-popup" className={popupClass}>
              <MenuPrimitive.Item>Item</MenuPrimitive.Item>
            </MenuPrimitive.Popup>
          </MenuPrimitive.Positioner>
        </MenuPrimitive.Portal>
      </MenuPrimitive.Root>
    </div>
  )
}

const host = document.getElementById('host') as HTMLElement
const shadow = host.attachShadow({ mode: 'open' })
const style = document.createElement('style')
style.textContent = (window as unknown as { SPIKE_CSS: string }).SPIKE_CSS
shadow.append(style)
const mount = document.createElement('div')
const portal = document.createElement('div')
portal.id = 'portal'
shadow.append(mount, portal)
createRoot(mount).render(<App shadowPortal={portal} />)

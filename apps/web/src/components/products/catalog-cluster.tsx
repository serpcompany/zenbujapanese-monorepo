import Image from 'next/image'
import { productSymbols } from '@/components/products/product-symbols'
import { featuredApp, type ProductSymbol } from '@/lib/products/catalog'
import { site } from '@/lib/site'
import { cn } from '@/lib/utils'

type Tile =
  | { glyph: string; size: TileSize; solid?: true }
  | { symbol: ProductSymbol; size: TileSize }
  | { app: true; size: TileSize }

type TileSize = 'far' | 'near' | 'middle' | 'center'

const tileSizes: Record<TileSize, string> = {
  far: 'size-9 text-[15px] opacity-45 md:size-10 [&_svg]:size-4',
  near: 'size-11 text-lg opacity-85 [&_svg]:size-5',
  middle: 'size-14 text-2xl md:size-15',
  center: 'size-16 md:size-18'
}

const rows: readonly (readonly Tile[])[] = [
  [
    { glyph: 'あ', size: 'far' },
    { glyph: '漢', size: 'near' },
    { app: true, size: 'center' },
    { symbol: 'chart', size: 'near' },
    { symbol: 'file', size: 'far' }
  ],
  [
    { symbol: 'play', size: 'far' },
    { symbol: 'swap', size: 'near' },
    { glyph: site.mark, size: 'middle', solid: true },
    { glyph: 'N5', size: 'near' },
    { symbol: 'grid', size: 'far' }
  ]
]

const japaneseText = /[\u3040-\u9fff]/

const tileKey = (tile: Tile) =>
  'glyph' in tile ? tile.glyph : 'symbol' in tile ? tile.symbol : 'app'

function TileFace({ tile }: { tile: Tile }) {
  if ('app' in tile) {
    return (
      <Image
        src={featuredApp.icon}
        alt=""
        width={72}
        height={72}
        unoptimized
        className="size-full"
      />
    )
  }
  if ('glyph' in tile)
    return <span lang={japaneseText.test(tile.glyph) ? 'ja' : undefined}>{tile.glyph}</span>
  const Icon = productSymbols[tile.symbol]
  return <Icon />
}

export function CatalogCluster() {
  return (
    <div aria-hidden="true" className="mb-3 flex flex-col items-center gap-2.5">
      {rows.map(row => (
        <div key={row.map(tileKey).join()} className="flex items-center gap-3">
          {row.map(tile => (
            <span
              key={tileKey(tile)}
              className={cn(
                'grid place-items-center overflow-hidden rounded-[22.5%] bg-background font-medium text-foreground shadow-[0_8px_18px_-10px_oklch(0_0_0/0.3)] ring-1 ring-foreground/10',
                tileSizes[tile.size],
                'solid' in tile && tile.solid && 'bg-primary text-primary-foreground'
              )}
            >
              <TileFace tile={tile} />
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

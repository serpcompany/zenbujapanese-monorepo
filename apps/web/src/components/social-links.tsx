import {
  type Icon,
  IconBrandBluesky,
  IconBrandDiscord,
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandReddit,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutube
} from '@tabler/icons-react'
import { type SocialLink, site, socialLinks } from '@/lib/site'

const brandIcons: Record<SocialLink['id'], Icon> = {
  youtube: IconBrandYoutube,
  x: IconBrandX,
  instagram: IconBrandInstagram,
  tiktok: IconBrandTiktok,
  discord: IconBrandDiscord,
  reddit: IconBrandReddit,
  threads: IconBrandThreads,
  bluesky: IconBrandBluesky,
  linkedin: IconBrandLinkedin,
  facebook: IconBrandFacebook
}

export function SocialLinks() {
  return (
    <ul
      aria-label={`${site.name} elsewhere`}
      className="grid grid-cols-5 gap-1 border-t pt-5 md:flex md:flex-wrap md:gap-x-3"
    >
      {socialLinks.map(link => {
        const BrandIcon = brandIcons[link.id]
        return (
          <li key={link.id}>
            <a
              href={link.href}
              data-outside-link={link.id}
              aria-label={`${site.name} on ${link.name}`}
              title={link.name}
              className="flex h-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:size-9"
            >
              <BrandIcon aria-hidden="true" className="size-5" stroke={2} />
            </a>
          </li>
        )
      })}
    </ul>
  )
}

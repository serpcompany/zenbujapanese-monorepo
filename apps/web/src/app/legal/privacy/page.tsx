import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { pageMetadata } from '@/lib/metadata'
import { site } from '@/lib/site'

export const metadata = pageMetadata('/legal/privacy')

export default function PrivacyPage() {
  const email = <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>
  return (
    <PageShell title="Privacy Policy" updated="September 28, 2026">
      <p>
        This policy explains how we handle information in the {site.name} iPhone app and on
        zenbujapanese.com.
      </p>

      <h2>The short version</h2>
      <p>
        The app does not collect or track data. It has no advertising, analytics, third-party
        crash-reporting SDK, account, or cloud sync. The website uses privacy-friendly, cookieless
        analytics to count visits.
      </p>

      <h2>Information in the app</h2>
      <p>
        Recent searches, word notes, known words, and word lists are stored in the app's private
        storage on your device and are not sent to {site.name}. Images you choose for Image Search
        are processed on your device and discarded when you close them.
      </p>
      <p>
        Text recognition, translation, and pronunciation use Apple's Vision, Translation, and speech
        frameworks. Apple handles that data under its own terms and privacy practices.
      </p>

      <h2>Network features in the app</h2>
      <ul>
        <li>
          <strong>Player</strong> plays videos and runs video searches through YouTube. YouTube
          (Google) receives those requests under its own terms and privacy policy.
        </li>
        <li>
          <strong>Optional dictionaries</strong> you choose to download come from
          cdn.zenbujapanese.com. Our hosting provider, Cloudflare, processes routine request
          information such as your IP address to deliver the file.
        </li>
      </ul>

      <h2>Permissions</h2>
      <p>
        The app asks for camera access only when you choose to take a photo. Photos and files are
        chosen through Apple's system pickers, which share only the item you select. You can change
        permissions in iPhone Settings.
      </p>

      <h2>This website</h2>
      <p>
        Cloudflare hosts this website and processes routine request information, such as IP
        addresses and browser headers, to deliver and secure pages. We use Cloudflare Web Analytics,
        which counts visits without cookies or cross-site tracking. The website may load Google Tag
        Manager; if we add tags that use cookies, we will update this policy and ask for consent
        where the law requires it.
      </p>

      <h2>Support email</h2>
      <p>
        If you email {email}, we receive your address, message, and any attachments you send. We use
        them to respond, troubleshoot, and prevent abuse, and keep them only as long as reasonably
        necessary.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        You can delete searches, notes, known words, and lists inside the app. Uninstalling the app
        removes its remaining data from your device.
      </p>

      <h2>Children</h2>
      <p>{site.name} is a general-audience reference and is not directed to children under 13.</p>

      <h2>Changes and contact</h2>
      <p>
        We update this policy when the app or website changes how it handles information; the date
        above marks the current version. Questions go to {email}. See also the{' '}
        <Link href="/legal/terms">Terms of Use</Link>.
      </p>
    </PageShell>
  )
}

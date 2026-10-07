import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { pageMetadata } from '@/lib/metadata'
import { site } from '@/lib/site'

export const metadata = pageMetadata('/legal/privacy/')

export default function PrivacyPage() {
  const email = <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>
  return (
    <PageShell title="Privacy Policy" updated="October 8, 2026">
      <p>
        This policy explains how we handle information in the {site.name} iPhone app, in Tomodachi
        (by {site.name}) for iPhone and Mac, and on zenbujapanese.com.
      </p>

      <h2>The short version</h2>
      <p>
        The {site.name} app does not collect or track data. It has no advertising, analytics,
        third-party crash-reporting SDK, account, or cloud sync. Tomodachi does not collect or track
        data either: it has no account, advertising, or analytics, and syncs your progress only
        through your own iCloud. The website uses privacy-friendly, cookieless analytics to count
        visits.
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

      <h2 id="tomodachi">Tomodachi for iPhone and Mac</h2>
      <p>
        Tomodachi (by {site.name}) is our app for learning Japanese with a character, Tomo, on
        iPhone and Mac. Its App Store privacy label is "Data Not Collected".
      </p>
      <ul>
        <li>
          <strong>No account.</strong> Tomodachi has no account or sign-in.
        </li>
        <li>
          <strong>Your progress.</strong> Tomo, the words it learned, and your answers are saved on
          your device. When you're signed in to iCloud, Tomo and its words also sync between your
          devices through your own iCloud account, in Tomodachi's private CloudKit database. We run
          no server for Tomodachi and can't see this data. Apple stores it under its own terms and
          privacy practices.
        </li>
        <li>
          <strong>Notifications.</strong> Reminders are local notifications that the app schedules
          on your device. We send no marketing notifications, and Tomodachi has no tracking,
          advertising, or analytics.
        </li>
        <li>
          <strong>No microphone.</strong> Tomodachi doesn't use the microphone or speech
          recognition.
        </li>
        <li>
          <strong>On a Mac.</strong> Tomodachi opens when you log in only if you turn that on. You
          can turn it off in its Settings or in System Settings → General → Login Items.
        </li>
        <li>
          <strong>Deleting your data.</strong> "Start Tomo over" in Tomodachi's Settings takes Tomo
          back to level 1 and clears the words it learned, on every device that syncs through your
          iCloud. Deleting the app removes what it keeps on an iPhone, your answers included; on a
          Mac, also delete the folder{' '}
          <code className="wrap-anywhere">
            ~/Library/Application Support/com.zenbujapanese.tomodachi
          </code>
          . To delete the copy in iCloud, remove Tomodachi's data in Settings → Apple Account →
          iCloud, or in System Settings on a Mac.
        </li>
      </ul>

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
        <Link href="/legal/terms/">Terms of Use</Link>.
      </p>
    </PageShell>
  )
}

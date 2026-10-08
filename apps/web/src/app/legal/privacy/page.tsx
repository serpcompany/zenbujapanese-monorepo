import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { company } from '@/lib/company'
import { pageMetadata } from '@/lib/metadata'
import { site } from '@/lib/site'

export const metadata = pageMetadata('/legal/privacy/')

const whatWeKeep: [string, string][] = [
  [
    'Your account: your email, and a name, username, and profile picture link if you or the service you sign up with give one',
    'To sign you in and show your account'
  ],
  [
    'How you sign in: Apple, Google, or a code we email you, with your ID at Apple or Google',
    'To sign you in'
  ],
  [
    'Your sessions: each device or browser you sign in on, with its IP address and the app or browser and system it runs on',
    'To keep you signed in, and to keep the service secure'
  ],
  [
    'Your study data: known words and lists, and from the iPhone app, the 50 videos you most recently watched in Player and the Translate sentences you bookmark',
    'To keep your devices and apps in step'
  ],
  ['A record of each change you sync', 'So a change sent twice is applied once']
]

const howLongWeKeepIt: [string, string][] = [
  ['Your account and study data', 'Until you delete your account'],
  ['Sessions', 'Until you sign out, or 60 days after you last use one'],
  ['Sign-in codes', '10 minutes'],
  ['Request counts by IP address, to stop abuse', 'A day after the last request'],
  ['Records of each change you sync', '30 days, and then until the next change you sync'],
  ['Backups of the account database', '30 days'],
  ['Support email', 'As long as we need it to help you']
]

function PolicyTable({ head, rows }: { head: [string, string]; rows: [string, string][] }) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead>
        <tr className="border-b">
          {head.map(cell => (
            <th key={cell} scope="col" className="py-2 pr-4 font-medium">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([what, detail]) => (
          <tr key={what} className="border-b align-top">
            <td className="py-2 pr-4">{what}</td>
            <td className="py-2">{detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Mail() {
  return <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>
}

export default function PrivacyPage() {
  return (
    <PageShell title="Privacy Policy" updated="October 9, 2026">
      <p>
        This policy covers the {site.name} iPhone app, Tomodachi for iPhone and Mac,
        zenbujapanese.com, and your Zenbu account.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>The app works without an account, and keeps what you do in it on your device.</li>
        <li>
          If you create a Zenbu account, we keep your email, how you sign in, and the study data you
          sync, so your devices stay in step.
        </li>
        <li>
          We don't sell or share your personal information, and the app has no ads, analytics, or
          tracking.
        </li>
        <li>
          A few companies help us run the service, such as Cloudflare, which carries our traffic,
          and useSend, which sends our email.
        </li>
        <li>
          You can see, export, correct, or delete your data, and delete your account any time.
        </li>
      </ul>

      <h2>Who we are</h2>
      <p>
        {site.name} is provided by {company.name}, doing business as {site.name} ("we"),{' '}
        {company.street}, {company.city}, {company.country}. For anything about your data, email{' '}
        <Mail />, or call {company.phone}.
      </p>

      <h2>On your device</h2>
      <p>
        You never need an account. The app keeps your profile, searches, notes, known words, lists,
        watch history, photos, and Translate conversations in its private storage on your device,
        and sends us none of it unless you sign in to a Zenbu account, which syncs only what's
        listed below. It stays until you delete it in the app or uninstall the app, which doesn't
        delete a Zenbu account. Your device's own backups, such as iCloud Backup, can include it,
        under Apple's terms.
      </p>
      <p>
        Image Search, Translate, text recognition, and speech run on your device with Apple's
        frameworks. Translate uses the microphone only while a conversation or Listening is running,
        and hears whoever is speaking nearby, but keeps no audio and never sends a conversation to
        us. The app asks for the camera and microphone only when a feature needs them, and you can
        change that in iPhone Settings.
      </p>
      <p>
        Player plays and searches YouTube videos, and can show YouTube's caption translations, so
        YouTube (Google) receives those requests under its own privacy policy. Optional dictionaries
        you download are delivered by Cloudflare.
      </p>

      <h2>Your Zenbu account</h2>
      <p>
        While you're signed out, our apps send nothing to our account service. If you create or sign
        in to a Zenbu account where our apps or this website offer one, we keep:
      </p>
      <PolicyTable head={['What we keep', 'Why']} rows={whatWeKeep} />
      <p>
        When you remove a video, list, or bookmark, we keep only a record that it was removed, so
        your other devices follow. The profile in the app, notes, photos, searches, settings, and
        whole Translate conversations don't sync. A sentence you bookmark may be something someone
        else said, so only the sentences you bookmark leave your device. We'll update this policy
        before an app or this website syncs anything else.
      </p>
      <p>
        Our account service emails you only to send sign-in codes, to tell you when a way to sign in
        is added or removed, and to confirm that your account was deleted.
      </p>
      <p>
        Where this website offers sign-in, your account there lets you change your name and
        username, manage how you sign in, sign out, and delete your account. It doesn't read your
        study data yet, and we'll update this policy before it does. Signing in uses cookies only to
        sign you in and keep you signed in, and the website remembers your theme and that you're
        signed in.
      </p>

      <h2 id="tomodachi">Tomodachi</h2>
      <p>
        Tomodachi, our companion app, works without an account or sign-in. It saves your progress
        (Tomo, its words, and your answers) on your device and syncs it through your own iCloud, in
        your private CloudKit database, under Apple's terms. We run no server for Tomodachi and
        can't see your progress.
      </p>
      <p>
        Its reminders are notifications it schedules on your device, not push notifications from us.
        It has no ads, analytics, or tracking, and doesn't use the microphone or speech recognition.
        The Mac app works the same way, and opens when you log in only if you turn that on.
      </p>
      <p>
        If you link your Zenbu account to it, it can read your lists and known words, mark words
        Known, and delete your account when you ask, and it looks words up in our dictionary
        service, which doesn't keep what it sends. Before another app can use your account, we'll
        update this policy.
      </p>

      <h2>Who else handles your information</h2>
      <p>
        We don't sell or share your personal information. These companies handle it for us, under
        their own terms:
      </p>
      <ul>
        <li>
          <strong>Cloudflare</strong> hosts this website, delivers our downloads, carries requests
          to our servers, stores our backups, and forwards email sent to our support address. It
          processes routine request details, such as IP addresses.
        </li>
        <li>
          <strong>useSend</strong> sends our email, so it gets your email address and the messages
          we send you, and keeps copies of them.
        </li>
        <li>
          <strong>Lambda, Inc.</strong> (Lambda Labs), in the United States, provides the machines
          our account database runs on.
        </li>
        <li>
          <strong>Ahrefs</strong> counts visits to this website with Ahrefs Web Analytics, which
          uses no cookies.
        </li>
        <li>
          <strong>Google</strong> serves Google Tag Manager, which loads Ahrefs Web Analytics on
          this website, hosts our support mailbox, and signs you in if you choose Google.
        </li>
        <li>
          <strong>Apple</strong> signs you in if you choose Apple.
        </li>
        <li>
          <strong>YouTube</strong> receives your requests when you use Player.
        </li>
      </ul>
      <p>
        These companies may process information in the United States and other countries. If we add
        anything to Google Tag Manager that uses cookies, we'll update this policy and ask for
        consent where the law requires it.
      </p>

      <h2>How long we keep it</h2>
      <PolicyTable head={['What', 'How long']} rows={howLongWeKeepIt} />
      <p>Expired sessions, sign-in codes, and request counts are deleted within an hour.</p>

      <h2>Why we're allowed to use it</h2>
      <ul>
        <li>
          Your account, the study data you sync, and our emails to you: they're needed to provide
          the account you asked for.
        </li>
        <li>
          Sessions, request counts, backups, running this website and our downloads, and counting
          visits: our legitimate interest in keeping the service secure, reliable, and working well.
        </li>
        <li>Support email: our legitimate interest in answering you.</li>
      </ul>

      <h2>Your rights</h2>
      <ul>
        <li>
          <strong>See and export.</strong> Email <Mail /> for a copy of the data your account holds.
        </li>
        <li>
          <strong>Correct.</strong> Change your name and username on this website where it offers
          sign-in. For your email or anything else, email us and we'll correct it.
        </li>
        <li>
          <strong>Delete.</strong> Delete your account in any of our apps that lets you create one,
          or on this website wherever you can sign in to it. That deletes your account and the data
          you synced at once, and the backups that hold them within 30 days. Your devices keep their
          own data and keep working.
        </li>
        <li>
          <strong>Object or restrict.</strong> Ask us to stop or limit a use of your information.
        </li>
      </ul>
      <p>
        We won't treat you differently for using these rights. You can also complain to your data
        protection authority.
      </p>

      <h2>Children</h2>
      <p>
        {site.name} is a general-audience reference and is not directed to children under 13. If we
        learn that an account belongs to a child under 13, we delete it.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We update this policy when our apps, our services, or this website change how they handle
        information, and the date above marks the current version. Questions go to <Mail />. See
        also the <Link href="/legal/terms/">Terms of Use</Link>.
      </p>
    </PageShell>
  )
}

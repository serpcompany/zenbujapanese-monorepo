import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { pageMetadata } from '@/lib/metadata'
import { site } from '@/lib/site'

export const metadata = pageMetadata('/legal/privacy/')

export default function PrivacyPage() {
  const email = <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>
  return (
    <PageShell title="Privacy Policy" updated="October 7, 2026">
      <p>
        This policy explains how we handle information in the {site.name} iPhone app, on
        zenbujapanese.com, and in a Zenbu account, including when you link one to Tomodachi.
      </p>

      <h2>The short version</h2>
      <p>
        The app does not collect or track data. It has no advertising, analytics, or third-party
        crash-reporting SDK, and everything in it works on your device without an account. If you
        create or sign in to a Zenbu account where our apps or this website offer one, we keep your
        email, how you sign in, and the known words and lists you sync on our servers, so your apps
        can share them, and you can delete the account at any time. If you link it to Tomodachi, our
        companion app, Tomodachi can read your lists and known words, mark words Known, and delete
        the account when you ask it to. The website uses privacy-friendly, cookieless analytics to
        count visits, and, if you sign in on it, only the cookies signing in needs.
      </p>

      <h2>Information in the app</h2>
      <p>
        Your profile, recent searches, word notes, known words, word lists, and Media Library photos
        are stored in the app's private storage on your device and are not sent to {site.name},
        except what a Zenbu account syncs if you create or sign in to one (see below). Your device's
        own backups, such as iCloud Backup, can include them, under Apple's terms.
      </p>
      <p>
        Images you choose for Image Search are processed on your device. Opening a word from one
        keeps the image with that word in your Media Library, on your device; otherwise it is
        discarded when you close it.
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
          cdn.zenbujapanese.com. Cloudflare, which serves those files for us, processes routine
          request information such as your IP address to deliver the file.
        </li>
      </ul>
      <p>
        If you create or sign in to a Zenbu account, signing in and syncing also connect to our
        account service at api.zenbujapanese.com, through Cloudflare.
      </p>

      <h2>Permissions</h2>
      <p>
        The app asks for camera access only when you choose to take a photo. Photos and files are
        chosen through Apple's system pickers, which share only the item you select. You can change
        permissions in iPhone Settings.
      </p>

      <h2>Your Zenbu account</h2>
      <p>
        You'll never need a Zenbu account: everything in the app works without one, and while you're
        signed out, our apps send nothing to our account service. If you create or sign in to a
        Zenbu account, the account service keeps:
      </p>
      <ul>
        <li>
          <strong>Your account:</strong> a Zenbu user ID; your email and whether it's verified; a
          name and a username, both optional; the address of your profile picture, only if the
          service you sign up with sends one; and when the account was created and last changed,
          with its profile's version number.
        </li>
        <li>
          <strong>How you sign in:</strong> for each way you sign in (Apple, Google, or a code we
          email you), the provider and your account ID with it. We don't keep Apple's or Google's
          own sign-in tokens. If you hide your email with Sign in with Apple, we get Apple's relay
          address instead of yours.
        </li>
        <li>
          <strong>Where you're signed in:</strong> a session for each device or browser you sign in
          on, with its IP address and user agent (the name and version of the app or browser, and of
          its operating system).
        </li>
        <li>
          <strong>The study data you sync:</strong> your known words, meaning which words and kanji
          they are and whether each is known; your lists' names, their order, and the words in them;
          a record of each item's latest change, including a deletion, so your other devices follow
          it; and the result of each sync request, so that a retry is never applied twice.
        </li>
      </ul>
      <p>
        To sign you in, it also keeps an encrypted copy of each code we email you and one-time
        sign-in values, each for 10 minutes, and counts requests from each IP address for a few
        minutes to stop abuse. Word notes, photos, recent searches, and settings aren't synced: they
        stay on your device. We'll update this policy before an app syncs anything else.
      </p>
      <p>
        We use this information only to sign you in, keep your apps in step, email you about signing
        in, and keep the service secure. We email you from {email}, through Cloudflare, only to send
        sign-in codes and to tell you when a way to sign in is added to or removed from your
        account. The account service's logs record each request's method, route, status, and timing,
        never your email, your profile, a sign-in code or link, or a token.
      </p>

      <h2>Tomodachi</h2>
      <p>
        Tomodachi, our companion app for Mac and iPhone, works without an account, and keeps its own
        study progress in your iCloud account, which Apple runs, not on our servers. This policy
        covers what Tomodachi does with a Zenbu account. If you link yours to Tomodachi, it signs in
        as described above and can only:
      </p>
      <ul>
        <li>read your lists;</li>
        <li>read your known words;</li>
        <li>mark words Known, but never clear a Known mark;</li>
        <li>delete your account when you ask it to, after you sign in to it again;</li>
        <li>
          fetch word cards from our dictionary service, and send it answers you type to split them
          into words.
        </li>
      </ul>
      <p>
        The dictionary service uses what Tomodachi sends only to answer it: none of it is added to
        your account, and the service's logs don't record it. Before another app lets you sign in to
        your account, we'll update this policy to say what it can do.
      </p>

      <h2>Your account on this website</h2>
      <p>
        Once zenbujapanese.com offers sign-in, you can create or sign in to your Zenbu account there
        with a code we email you, and with Apple or Google where its sign-in page offers them.
        Signed in, the website uses your account only to:
      </p>
      <ul>
        <li>show your email, and show and change your name and username;</li>
        <li>show how you sign in, and add or remove a way to sign in;</li>
        <li>sign you out of this browser;</li>
        <li>delete your account.</li>
      </ul>
      <p>
        It doesn't read or change your known words or lists yet; we'll update this policy before it
        does. Its account pages connect from your browser to our account service at
        api.zenbujapanese.com only when you open your account page or start to sign in. Pointing at
        or tabbing to a Sign in with Apple button gets it ready: your browser loads Apple's Sign in
        with Apple script from Apple and asks our account service for a one-time sign-in value.
        Choosing Apple opens Apple's window; if you choose Google, your browser goes to Google and
        comes back through our account service. Each handles that under its own terms and privacy
        policy.
      </p>

      <h2>Where account data is kept</h2>
      <p>
        Your account and the data you sync are kept in a database on our API servers. Requests to
        them pass through Cloudflare. The database is backed up each night to private Cloudflare R2
        storage, and each backup is deleted after 30 days. These companies process account data for
        us:
      </p>
      <ul>
        <li>
          <strong>Cloudflare</strong>, which carries traffic to our servers, sends our email, and
          stores the backups;
        </li>
        <li>
          <strong>the company that hosts our API servers</strong>, where the database runs.
        </li>
      </ul>
      <p>
        If you sign in with Apple or Google, that company signs you in under its own terms and
        privacy policy, and sends us only what's listed above.
      </p>

      <h2>This website</h2>
      <p>
        Cloudflare hosts this website and processes routine request information, such as IP
        addresses and browser headers, to deliver and secure pages. We use Cloudflare Web Analytics,
        which counts visits without cookies or cross-site tracking. The website may load Google Tag
        Manager; if we add tags that use cookies, we will update this policy and ask for consent
        where the law requires it.
      </p>
      <p>
        Signing in on this website sets only the cookies signing in needs. Our account service sets
        them for api.zenbujapanese.com, so your browser sends them only there, and the website's
        pages can't read them:
      </p>
      <ul>
        <li>
          <strong>__Secure-zenbu.session_token</strong> keeps you signed in. It holds your session's
          signed ID, and lasts 60 days from the last time you use it, or until you sign out or
          delete your account.
        </li>
        <li>
          <strong>__Secure-zenbu.state</strong>, only while you sign in with Google, ties Google's
          answer to your browser. It lasts 5 minutes, and goes when you come back.
        </li>
      </ul>
      <p>
        The website also keeps a note in your browser's local storage that you signed in, so its
        footer links to your account. It holds nothing about you, is never sent to us, and goes when
        you sign out. And while you confirm it's you with Google, it keeps in that tab's session
        storage which account you started from and your earlier session's ID, so that when you come
        back it can sign that earlier session out; it goes then, or when you come back without
        signing in.
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
        removes its remaining data from your device, but doesn't delete a Zenbu account.
      </p>
      <p>If you have a Zenbu account, we keep:</p>
      <ul>
        <li>your account and the data you sync until you delete the account;</li>
        <li>
          each session until you sign out of it or delete the account; a session stops working 60
          days after it was last used, and is deleted within an hour of that;
        </li>
        <li>
          sign-in codes and one-time sign-in values for 10 minutes, deleted within an hour of that,
          and request counts for a day after their last request;
        </li>
        <li>
          each sync request's result for 30 days, and until the next change you sync after that;
        </li>
        <li>each night's backup for 30 days.</li>
      </ul>
      <p>
        You can delete your account wherever you can create one: in our apps that offer accounts, or
        on this website once it offers sign-in. Deleting it removes your account, its ways to sign
        in, and the data you synced from our database at once, and the backups that still hold them
        are deleted within 30 days. Each device keeps its own data and keeps working signed out.
      </p>
      <p>To get a copy of the data your account holds, email {email}.</p>

      <h2>Children</h2>
      <p>{site.name} is a general-audience reference and is not directed to children under 13.</p>

      <h2>Changes and contact</h2>
      <p>
        We update this policy when our apps, the account service, or the website change how they
        handle information; the date above marks the current version. Questions go to {email}. See
        also the <Link href="/legal/terms/">Terms of Use</Link>.
      </p>
    </PageShell>
  )
}

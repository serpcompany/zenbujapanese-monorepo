import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { pageMetadata } from '@/lib/metadata'
import { site } from '@/lib/site'

export const metadata = pageMetadata('/legal/terms/')

export default function TermsPage() {
  return (
    <PageShell title="Terms of Use" updated="September 28, 2026">
      <p>
        These terms apply to the {site.name} iPhone app and zenbujapanese.com (the "Service"),
        provided by TSMC LLC, doing business as {site.name} ("we"). By using the Service you agree
        to them. If you do not agree, do not use the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        {site.name} is a Japanese learning reference: a dictionary, text reader, and translator.
        Definitions, readings, frequency information, and translations may be incomplete or wrong.
        Do not rely on them where accuracy matters, such as legal, medical, or safety decisions.
      </p>

      <h2>2. Using the Service</h2>
      <p>Use the Service only for lawful purposes. Do not:</p>
      <ul>
        <li>interfere with or disrupt the Service, or try to gain unauthorized access to it;</li>
        <li>
          scrape or copy the website in bulk with automated tools beyond what robots.txt allows;
        </li>
        <li>use the Service to infringe anyone's intellectual property or other rights.</li>
      </ul>

      <h2>3. Third-party content and data</h2>
      <p>
        The Service includes data from third parties under their own licenses, such as the JMdict
        dictionary (Creative Commons Attribution-ShareAlike). Those licenses govern that data. Video
        features use YouTube, whose terms apply to that content.
      </p>

      <h2>4. Our content</h2>
      <p>
        Apart from third-party data under its own license, the Service's software, design, and text
        belong to {site.name} and may not be copied or redistributed without permission.
      </p>

      <h2>5. The iPhone app</h2>
      <p>
        The app is licensed, not sold, under Apple's standard Licensed Application End User License
        Agreement, alongside these terms. Apple is not responsible for the app or its support.
      </p>

      <h2>6. Disclaimer</h2>
      <p>
        THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS
        OR IMPLIED. WE DO NOT WARRANT THAT IT WILL BE UNINTERRUPTED, ERROR-FREE, OR ACCURATE.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        TO THE EXTENT THE LAW ALLOWS, ZENBU JAPANESE AND ITS OFFICERS, EMPLOYEES, AND AGENTS ARE NOT
        LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING
        FROM YOUR USE OF THE SERVICE.
      </p>

      <h2>8. Changes and termination</h2>
      <p>
        We may change, suspend, or discontinue the Service, and may update these terms by posting a
        new version here with a new date. We may suspend access for anyone who breaks these terms.
      </p>

      <h2>9. Governing law</h2>
      <p>
        These terms are governed by the laws of the State of Wyoming, United States, without regard
        to conflict-of-law principles.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions go to <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>. See also
        the <Link href="/legal/privacy/">Privacy Policy</Link>.
      </p>
    </PageShell>
  )
}

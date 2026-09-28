import { PageShell } from '@/components/page-shell'
import { pageMetadata } from '@/lib/metadata'
import { site } from '@/lib/site'

export const metadata = pageMetadata('/legal/dmca/')

const dmcaEmail = 'dmca@zenbujapanese.com'

export default function DmcaPage() {
  return (
    <PageShell title="DMCA Copyright Policy" updated="September 28, 2026">
      <p>
        {site.name} respects the intellectual property rights of others. Under the Digital
        Millennium Copyright Act ("DMCA"), we respond promptly to properly reported claims of
        copyright infringement on the Service.
      </p>

      <h2>1. Designated Copyright Agent</h2>
      <address className="not-italic">
        {site.name}
        <br />
        TSMC LLC
        <br />
        1095 Sugarview Drive STE 500
        <br />
        Sheridan, WY 82801
        <br />
        Phone: 323-628-8306
        <br />
        Email: <a href={`mailto:${dmcaEmail}`}>{dmcaEmail}</a>
      </address>

      <h2>2. Filing a notice</h2>
      <p>Under 17 U.S.C. § 512(c)(3), a notice must include:</p>
      <ul>
        <li>a physical or electronic signature of the copyright owner or an authorized agent;</li>
        <li>identification of the copyrighted work claimed to be infringed;</li>
        <li>identification of the infringing material and its URL or location on the Service;</li>
        <li>your contact information: address, telephone number, and email;</li>
        <li>
          a statement that you believe in good faith that the use is not authorized by the owner,
          its agent, or the law; and
        </li>
        <li>
          a statement, under penalty of perjury, that the notice is accurate and that you are the
          owner or authorized to act for the owner.
        </li>
      </ul>
      <p>
        Under 17 U.S.C. § 512(f), knowingly misrepresenting that material is infringing can make you
        liable for damages.
      </p>

      <h2>3. Counter-notification</h2>
      <p>
        If you believe material was removed by mistake or misidentification, send the agent a
        counter-notification that includes your signature; identification of the removed material
        and where it appeared; a statement under penalty of perjury that you believe in good faith
        it was removed by mistake; and your name, address, telephone number, and consent to the
        jurisdiction of the federal district court for your address (or, outside the United States,
        any judicial district where {site.name} may be found). We may restore the material 10 to 14
        business days after forwarding it, unless the complainant tells us they have filed a court
        action.
      </p>

      <h2>4. Repeat infringers</h2>
      <p>We may end access for users who repeatedly infringe copyrights.</p>
    </PageShell>
  )
}

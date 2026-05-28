// Public-facing Terms of Use. Linked from the registration form, the
// settings page, and the App Store listing — must render for logged-out
// users, so this page doesn't use <Layout> or useAuth.
//
// Apple Review Guideline 1.2 requires apps with user-generated content
// to (a) present an EULA to users and (b) make the no-tolerance policy
// for objectionable content unambiguous. Section 5 ("Community Standards
// and Acceptable Use") is the load-bearing piece for that requirement;
// Section 9 ("Additional Terms for Apple App Store Users") is the Apple
// Licensed Application Schedule that Apple requires every custom iOS
// EULA to incorporate. If you rewrite, keep both sections intact.

const LAST_UPDATED = "May 28, 2026";
const CONTACT_EMAIL = "invites@withphoebe.app";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2
        className="text-xl font-semibold mb-3"
        style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed" style={{ color: "#C8D4C0" }}>
        {children}
      </div>
    </section>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-base font-semibold mt-4 mb-1"
      style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
    >
      {children}
    </h3>
  );
}

function MailLink() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="underline" style={{ color: "#8FAF96" }}>
      {CONTACT_EMAIL}
    </a>
  );
}

// Body extracted so the registration screen can render the same content
// in a modal. Apple Review needs the EULA visible *before* a UGC account
// is created — opening it in a modal preserves the user's typed
// registration state, which routing away to /terms would have wiped.
export function TermsBody() {
  return (
    <>
      <h1
        className="text-3xl font-bold mb-1"
        style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
      >
        Terms of Use
      </h1>
      <p className="text-xs mb-8" style={{ color: "rgba(143,175,150,0.75)" }}>
        Last updated {LAST_UPDATED}
      </p>

        <div className="mb-8 space-y-3 text-sm leading-relaxed" style={{ color: "#C8D4C0" }}>
          <p>
            Welcome to Phoebe. These Terms of Use (the "Terms") are an agreement between you and Jeremy Cannon, an
            individual sole proprietor doing business as Phoebe ("Phoebe," "we," "us," or "our"), and they govern
            your use of the Phoebe mobile and web application, including any related services we offer (together,
            the "Service"). Phoebe is a private, invite-only app for small faith communities to share prayer life
            together.
          </p>
          <p>
            Please read these Terms carefully. They include an arbitration agreement and a class-action waiver in
            Section 14 that affect how disputes between you and us are resolved.
          </p>
        </div>

        <Section title="1. Acceptance of these Terms">
          <p>
            By creating an account, downloading, installing, or using Phoebe, you agree to these Terms and to our
            Privacy Policy. If you don't agree, don't use the Service. If you're using Phoebe on behalf of a
            community, group, or organization, you represent that you have authority to accept these Terms on its
            behalf.
          </p>
        </Section>

        <Section title="2. Eligibility">
          <p>
            You must be at least 13 years old to use Phoebe. We don't allow children under 13 to create accounts or
            use the Service, and we don't knowingly collect information from anyone under 13. If you are between
            13 and the age of majority where you live, you may use Phoebe only with the consent and supervision of
            a parent or legal guardian who accepts these Terms on your behalf.
          </p>
          <p>
            Phoebe is invite-only. You need a valid invite token or a community invite link from someone already in
            a Phoebe community to register an account.
          </p>
        </Section>

        <Section title="3. Your Account">
          <p>You're responsible for:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Providing accurate registration information (including a real email address and display name) and
              keeping that information current.
            </li>
            <li>
              Keeping your password confidential. Don't share your credentials with anyone, and don't let anyone
              else use your account.
            </li>
            <li>
              Everything that happens under your account. If you think someone's accessed your account without
              permission, tell us right away at <MailLink />.
            </li>
          </ul>
          <p>
            You may have only one account at a time, and you may not transfer your account to anyone else.
          </p>
        </Section>

        <Section title="4. License to Use Phoebe">
          <p>
            Subject to your compliance with these Terms, we grant you a personal, non-exclusive, non-transferable,
            non-sublicensable, revocable, limited license to download, install, and use Phoebe on devices you own
            or control, solely for your own personal, non-commercial use as part of your faith community.
          </p>
          <p>You don't get any other rights. In particular, you may not:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Copy, modify, translate, reverse engineer, decompile, or disassemble the Service, except to the
              extent applicable law expressly permits despite this limitation.
            </li>
            <li>
              Rent, lease, lend, sell, redistribute, sublicense, or otherwise commercialize the Service or any
              part of it.
            </li>
            <li>Use the Service to build a competing product, scrape it, or extract its data in bulk.</li>
            <li>Remove or alter any copyright, trademark, or other proprietary notices.</li>
            <li>Use the Service in any way not expressly permitted by these Terms.</li>
          </ul>
          <p>
            Phoebe and all related logos, content we provide, and software are owned by Jeremy Cannon or his
            licensors and are protected by copyright, trademark, and other laws.
          </p>
        </Section>

        <Section title="5. Community Standards and Acceptable Use">
          <p>
            Phoebe exists to support prayer and care between members of a small faith community. We have{" "}
            <strong>zero tolerance</strong> for objectionable content and abusive behavior on the Service.
          </p>
          <p>You agree not to post, send, or share — and not to use Phoebe to facilitate — any of the following:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Content that sexualizes, exploits, or endangers minors in any way. This is an absolute prohibition
              and any violation will be reported to the appropriate authorities.
            </li>
            <li>Pornography or sexually explicit content of any kind.</li>
            <li>
              Hate speech, or content that attacks or demeans people based on race, ethnicity, national origin,
              religion, disability, gender, gender identity, sexual orientation, age, or any other protected
              characteristic.
            </li>
            <li>Harassment, bullying, stalking, threats, or intimidation of any person.</li>
            <li>
              Graphic violence or content that promotes, glorifies, or instructs others in violence.
            </li>
            <li>
              Content that promotes, encourages, or instructs others in self-harm, suicide, or eating disorders.
            </li>
            <li>Discriminatory content of any kind.</li>
            <li>
              Spam, scams, phishing, pyramid schemes, fundraising schemes, or unsolicited advertising or
              promotional material.
            </li>
            <li>
              Impersonation of any other person — including other Phoebe users, religious leaders, or public
              figures — or misrepresentation of your affiliation with any person or organization.
            </li>
            <li>Content that infringes anyone's intellectual property, privacy, publicity, or other rights.</li>
            <li>
              Content that's illegal where you are or where the recipient is, or that promotes illegal activity.
            </li>
            <li>
              Malware, viruses, or anything that interferes with the normal operation of the Service or any
              user's device.
            </li>
            <li>Attempts to bypass our security, rate limits, invite system, or moderation tools.</li>
          </ul>
          <p>
            Violations may result in immediate suspension or termination of your account, removal of your content,
            and where appropriate, referral to law enforcement. Our decisions on these matters are final.
          </p>
        </Section>

        <Section title="6. Your Content">
          <p>
            "Your Content" means everything you submit to or through Phoebe — prayer requests, Lectio Divina
            reflections, letters, one-to-one messages, group reflections and comments, podcast recommendations,
            prayers you record for another member, intentions, practice notes, RSVPs, your display name and
            profile photo, and anything else you create on the Service.
          </p>
          <p>
            <strong>You keep ownership of Your Content.</strong> You grant us a limited, non-exclusive,
            royalty-free, worldwide license to store, host, reproduce, display, and transmit Your Content solely as
            needed to operate, maintain, secure, and provide the Service to you and the community members you've
            shared it with. This license ends when you delete the content or your account, except for content
            that's already been shared with another user (their copy may persist) and except to the extent we're
            required to keep records by law.
          </p>
          <p>
            We <strong>do not</strong> use Your Content to train AI or machine-learning models. We don't sell Your
            Content. We don't share it with advertisers. We don't share it outside the practices, traditions,
            circles, and one-to-one letter recipients you've shared it with, except as described in our Privacy
            Policy (for example, with the small set of infrastructure vendors needed to run the Service).
          </p>
          <p>
            You're responsible for Your Content. You represent that you have all the rights needed to share it on
            Phoebe and that sharing it doesn't violate these Terms or any law.
          </p>
          <p>
            We don't pre-screen Your Content, but we may review, refuse, or remove it at any time if we reasonably
            believe it violates these Terms.
          </p>
        </Section>

        <Section title="7. Reporting and Blocking">
          <p>Phoebe gives you two tools to handle problems with other users or content:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Report.</strong> Every user, prayer request, prayer word, and letter has a Report option. Use
              it to flag content or behavior that violates these Terms. Our admin reviews reports within 24 hours
              and takes action where appropriate, which can include removing content, warning a user, or
              terminating an account.
            </li>
            <li>
              <strong>Mute.</strong> You can silently mute another user at any time. Muting hides their content
              from you without notifying them.
            </li>
          </ul>
          <p>
            For anything urgent, or anything you'd rather not file in the app, email <MailLink />.
          </p>
        </Section>

        <Section title="8. Termination">
          <p>
            <strong>You may terminate at any time.</strong> Go to Settings → Delete account and confirm by typing
            your account email. Deletion is immediate and permanent: your account and all user-owned content are
            removed right away and cannot be recovered, and we revoke any Google authorization we still hold. If
            you'd like a copy first, export your data as JSON (Settings → Export my data) before you delete.
          </p>
          <p>
            <strong>We may terminate or suspend your account</strong> at any time, with or without notice, if:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>You violate these Terms;</li>
            <li>
              We believe your conduct creates risk or legal exposure for us, other users, or the Service;
            </li>
            <li>
              We're required to do so by law or by a regulator, court, or law-enforcement request;
            </li>
            <li>
              Your account has been inactive for an extended period (currently 12 months); or
            </li>
            <li>We discontinue the Service.</li>
          </ul>
          <p>
            Sections that by their nature should survive termination — including User Content licenses already
            exercised, Disclaimer of Warranties, Limitation of Liability, Indemnification, Governing Law, and
            Miscellaneous — survive.
          </p>
        </Section>

        <Section title="9. Additional Terms for Apple App Store Users">
          <p>
            If you downloaded Phoebe from the Apple App Store, the following additional terms apply. To the extent
            they conflict with anything else in these Terms, this Section controls for the iOS app:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Parties.</strong> These Terms are between you and Jeremy Cannon only, not with Apple Inc.
              ("Apple"). Apple is not responsible for Phoebe or its content.
            </li>
            <li>
              <strong>Scope of license.</strong> The license we grant you in Section 4 is limited to a
              non-transferable license to use Phoebe on any Apple-branded products you own or control, as permitted
              by the Usage Rules in the Apple Media Services Terms and Conditions, except that Phoebe may also be
              accessed and used by other accounts associated with you via Family Sharing or volume purchasing.
            </li>
            <li>
              <strong>Maintenance and support.</strong> We — not Apple — are solely responsible for providing any
              maintenance and support for Phoebe. Apple has no obligation whatsoever to furnish any maintenance or
              support services for Phoebe.
            </li>
            <li>
              <strong>Warranty.</strong> We — not Apple — are responsible for any product warranties, whether
              express or implied by law, to the extent they aren't effectively disclaimed. If Phoebe fails to
              conform to any applicable warranty, you may notify Apple, and Apple will refund the purchase price
              for the app to you (which is zero, because Phoebe is free). To the maximum extent permitted by
              applicable law, Apple has no other warranty obligation whatsoever with respect to Phoebe.
            </li>
            <li>
              <strong>Product claims.</strong> We — not Apple — are responsible for addressing any claims by you
              or any third party relating to Phoebe or your possession or use of Phoebe, including: (i) product
              liability claims; (ii) any claim that Phoebe fails to conform to any applicable legal or regulatory
              requirement; and (iii) claims arising under consumer protection, privacy, or similar legislation.
            </li>
            <li>
              <strong>Intellectual property.</strong> If a third party claims that Phoebe or your possession and
              use of Phoebe infringes that third party's intellectual property rights, we — not Apple — will be
              solely responsible for the investigation, defense, settlement, and discharge of any such claim.
            </li>
            <li>
              <strong>Legal compliance.</strong> You represent and warrant that (i) you are not located in a
              country that is subject to a U.S. Government embargo or designated by the U.S. Government as a
              "terrorist supporting" country, and (ii) you are not listed on any U.S. Government list of
              prohibited or restricted parties.
            </li>
            <li>
              <strong>Third-party terms.</strong> You must comply with any applicable third-party terms of
              agreement when using Phoebe (for example, your wireless data service agreement).
            </li>
            <li>
              <strong>Third-party beneficiary.</strong> You and we acknowledge and agree that Apple and Apple's
              subsidiaries are third-party beneficiaries of these Terms, and that upon your acceptance of these
              Terms, Apple will have the right (and will be deemed to have accepted the right) to enforce these
              Terms against you as a third-party beneficiary.
            </li>
          </ul>
        </Section>

        <Section title="10. Disclaimer of Warranties">
          <p>
            PHOEBE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITH ALL FAULTS AND WITHOUT WARRANTY OF ANY KIND. TO
            THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, WE DISCLAIM ALL WARRANTIES, WHETHER EXPRESS, IMPLIED,
            STATUTORY, OR OTHERWISE, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
            TITLE, QUIET ENJOYMENT, NON-INFRINGEMENT, AND ANY WARRANTIES ARISING OUT OF COURSE OF DEALING OR USAGE
            OF TRADE.
          </p>
          <p>
            WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, ERROR-FREE, FREE OF VIRUSES OR
            HARMFUL COMPONENTS, ACCURATE, RELIABLE, OR AVAILABLE AT ANY PARTICULAR TIME OR LOCATION; THAT
            NOTIFICATIONS WILL BE DELIVERED ON TIME OR AT ALL; OR THAT THE SERVICE WILL MEET YOUR REQUIREMENTS.
            YOUR USE OF THE SERVICE IS AT YOUR SOLE RISK.
          </p>
          <p>
            Some jurisdictions don't allow the exclusion of certain warranties, so some of the above exclusions
            may not apply to you.
          </p>
        </Section>

        <Section title="11. Limitation of Liability">
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT WILL JEREMY CANNON OR ANY OF HIS
            AFFILIATES, AGENTS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
            EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUES, DATA, GOODWILL, OR OTHER
            INTANGIBLE LOSSES, ARISING OUT OF OR RELATING TO THESE TERMS OR YOUR USE OF (OR INABILITY TO USE) THE
            SERVICE, REGARDLESS OF THE LEGAL THEORY AND EVEN IF WE'VE BEEN ADVISED OF THE POSSIBILITY OF SUCH
            DAMAGES.
          </p>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, OUR TOTAL AGGREGATE LIABILITY TO YOU FOR ALL CLAIMS
            ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE
            AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM (WHICH IS ZERO,
            BECAUSE PHOEBE IS FREE) AND (B) FIFTY U.S. DOLLARS (US$50) — WHICHEVER IS LOWER.
          </p>
          <p>
            Some jurisdictions don't allow the limitation or exclusion of liability for incidental or
            consequential damages, so some of the above may not apply to you. In those jurisdictions, our
            liability is limited to the smallest amount permitted by law.
          </p>
        </Section>

        <Section title="12. Indemnification">
          <p>
            You agree to defend, indemnify, and hold harmless Jeremy Cannon and his affiliates, agents, and
            licensors from and against any claims, liabilities, damages, losses, and expenses (including
            reasonable attorneys' fees) arising out of or in any way connected with:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Your Content;</li>
            <li>Your use of the Service;</li>
            <li>Your breach of these Terms; or</li>
            <li>Your violation of any law or the rights of any third party.</li>
          </ul>
          <p>
            We reserve the right to assume the exclusive defense and control of any matter otherwise subject to
            indemnification by you, in which case you'll cooperate with us in asserting any available defenses.
          </p>
        </Section>

        <Section title="13. Copyright Complaints (DMCA)">
          <p>
            We respect the intellectual property rights of others and ask you to do the same. If you believe
            content on Phoebe infringes your copyright, send a written notice to our designated agent at{" "}
            <MailLink /> with the subject line "DMCA Notice."
          </p>
          <p>Under 17 U.S.C. § 512(c)(3), a valid notice must include:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              A physical or electronic signature of the owner (or person authorized to act on behalf of the
              owner) of the copyright that's allegedly infringed;
            </li>
            <li>
              Identification of the copyrighted work claimed to have been infringed (or, if multiple works, a
              representative list);
            </li>
            <li>
              Identification of the material that's claimed to be infringing or to be the subject of infringing
              activity, with enough detail for us to locate it;
            </li>
            <li>Your contact information — address, telephone number, and email;</li>
            <li>
              A statement that you have a good-faith belief that the use of the material in the manner complained
              of is not authorized by the copyright owner, its agent, or the law; and
            </li>
            <li>
              A statement, made under penalty of perjury, that the information in the notice is accurate and that
              you are the copyright owner or authorized to act on the owner's behalf.
            </li>
          </ul>
          <p>
            We may remove or disable access to material claimed to be infringing and will, in appropriate
            circumstances, terminate repeat infringers' accounts. If you believe material was removed in error,
            you can submit a counter-notice meeting the requirements of 17 U.S.C. § 512(g).
          </p>
        </Section>

        <Section title="14. Governing Law and Disputes">
          <p>
            These Terms are governed by the laws of the Commonwealth of Virginia, without regard to its
            conflict-of-laws rules. The federal and state courts located in the City of Richmond, Virginia have
            exclusive jurisdiction for any matter not subject to arbitration.
          </p>
          <SubHeading>Informal resolution first</SubHeading>
          <p>
            Before starting an arbitration or filing a lawsuit, you agree to try to resolve any dispute informally
            first. Send a written notice describing the dispute to <MailLink />. We'll do the same with you. If we
            haven't resolved the dispute within 60 days after the notice is received, either of us may proceed
            under this Section.
          </p>
          <SubHeading>Binding arbitration</SubHeading>
          <p>
            You and we agree that any dispute, claim, or controversy arising out of or relating to these Terms or
            the Service that isn't resolved informally will be resolved by binding individual arbitration
            administered by JAMS under its Streamlined Arbitration Rules then in effect. The arbitration will be
            conducted in the English language, and judgment on the award may be entered in any court of competent
            jurisdiction. The arbitrator — not any federal, state, or local court — has exclusive authority to
            resolve any dispute relating to the interpretation, applicability, enforceability, or formation of
            this arbitration agreement, including any claim that all or part of it is void or voidable.
          </p>
          <SubHeading>Class-action waiver</SubHeading>
          <p>
            YOU AND WE AGREE THAT EACH MAY BRING CLAIMS AGAINST THE OTHER ONLY IN AN INDIVIDUAL CAPACITY, AND NOT
            AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, COLLECTIVE, OR REPRESENTATIVE PROCEEDING. The
            arbitrator may not consolidate more than one person's claims and may not preside over any form of
            representative or class proceeding.
          </p>
          <SubHeading>Carve-outs</SubHeading>
          <p>
            Either of us may bring an individual action in small-claims court for disputes within that court's
            jurisdiction, and either of us may seek injunctive or other equitable relief in court for actual or
            threatened infringement, misappropriation, or violation of intellectual property rights.
          </p>
          <SubHeading>If any of this is unenforceable where you live</SubHeading>
          <p>
            Some U.S. states and some jurisdictions outside the United States (including the European Union) give
            consumers rights that can't be waived. Nothing in these Terms is intended to limit those rights. To
            the extent any part of this Section 14 is unenforceable in your jurisdiction, that part doesn't apply
            to you, and the rest of these Terms continues in effect.
          </p>
        </Section>

        <Section title="15. Changes to These Terms">
          <p>
            We may update these Terms from time to time. When we do, we'll change the "Last updated" date at the
            top, and for material changes we'll surface a notice in the app before the changes take effect. If
            you keep using Phoebe after the changes take effect, that means you accept the updated Terms. If you
            don't accept them, you can stop using the Service and delete your account.
          </p>
        </Section>

        <Section title="16. Miscellaneous">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Entire agreement.</strong> These Terms, together with our Privacy Policy and any other
              policies we reference, are the entire agreement between you and us about the Service and replace
              any earlier agreements on that subject.
            </li>
            <li>
              <strong>Severability.</strong> If any part of these Terms is held to be invalid or unenforceable,
              the rest remains in full effect.
            </li>
            <li>
              <strong>No waiver.</strong> Our failure to enforce any right or provision of these Terms isn't a
              waiver of that right or provision.
            </li>
            <li>
              <strong>Assignment.</strong> You may not assign or transfer these Terms or any rights under them
              without our prior written consent. We may assign these Terms or any rights under them to any
              successor in interest of any business associated with the Service, without notice.
            </li>
            <li>
              <strong>Force majeure.</strong> We aren't liable for any delay or failure to perform caused by
              events beyond our reasonable control, including acts of God, natural disasters, war, terrorism,
              riots, embargoes, acts of civil or military authorities, fires, floods, accidents, pandemics,
              strikes, or shortages of transportation facilities, fuel, energy, labor, or materials.
            </li>
            <li>
              <strong>Survival.</strong> Provisions that by their nature should survive termination of these
              Terms will survive — for example, Sections 6 (licenses already granted), 10, 11, 12, 13, 14, and 16.
            </li>
            <li>
              <strong>Headings.</strong> Section headings are for convenience only and don't affect
              interpretation.
            </li>
            <li>
              <strong>Relationship.</strong> Nothing in these Terms creates any agency, partnership, joint
              venture, or employment relationship between you and us.
            </li>
          </ul>
        </Section>

        <Section title="17. Third-Party Content and Links">
          <p>
            Phoebe surfaces content from other people and organizations — for example, daily-office and
            contemplative podcasts, the Washington National Cathedral's livestream, daily reflections and
            Scripture readings, and links to other websites and meeting tools. That content and those sites are
            owned and operated by third parties, not by us. We don't create, control, endorse, or guarantee
            third-party content, and we're not responsible for it or for the practices of the sites it lives on.
            When you play, view, or open it, your use may be subject to that third party's own terms and privacy
            policy, and your device may connect to them directly (our Privacy Policy explains what that
            involves). You access third-party content at your own discretion.
          </p>
        </Section>

        <Section title="18. Contact">
          <p>
            For legal notices, policy questions, copyright complaints, or anything else about these Terms, email{" "}
            <MailLink />.
          </p>
        </Section>
    </>
  );
}

export default function TermsPage() {
  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "#091A10", color: "#F0EDE6", fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      <div className="max-w-2xl mx-auto px-5 py-10 pb-24">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else window.location.href = "/";
          }}
          className="text-sm mb-6 inline-flex items-center gap-1"
          style={{ color: "#8FAF96" }}
        >
          ← Back
        </button>
        <TermsBody />
      </div>
    </div>
  );
}

// Public-facing Terms of Use. Linked from the registration form, the
// settings page, and the App Store listing — must render for logged-out
// users, so this page doesn't use <Layout> or useAuth.
//
// Rewritten July 27, 2026 against the current codebase — replaces the
// prior version, which described Phoebe as invite-only and promised a
// Mute feature that does not exist.
//
// Apple Review Guideline 1.2 requires apps with user-generated content
// to (a) present an EULA to users and (b) make the no-tolerance policy
// for objectionable content unambiguous. Section 5 ("Community Standards
// and Acceptable Use") is the load-bearing piece for that requirement;
// Section 9 ("Apple App Store additional terms") is the Apple Licensed
// Application Schedule that Apple requires every custom iOS EULA to
// incorporate. If you rewrite, keep both sections intact.

const LAST_UPDATED = "July 27, 2026";
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

      <p className="text-sm leading-relaxed mb-4" style={{ color: "#C8D4C0" }}>
        Welcome to Phoebe. These Terms of Use (the "Terms") are an
        agreement between you and Jeremy Cannon, an individual sole
        proprietor doing business as Phoebe ("Phoebe," "we," "us," or
        "our"), and they govern your use of the Phoebe mobile and web
        application, including any related services we offer (together,
        the "Service"). Phoebe is an app for keeping a daily practice of
        Christian prayer, on your own or alongside a small community.
      </p>
      <p className="text-sm leading-relaxed mb-8" style={{ color: "#C8D4C0" }}>
        Please read these Terms carefully. They include an arbitration
        agreement and a class-action waiver in Section 14 that affect how
        disputes between you and us are resolved.
      </p>

      <Section title="1. Acceptance of these Terms">
        <p>
          By creating an account, using Phoebe as a guest, downloading,
          installing, or otherwise using the Service, you agree to these
          Terms and to our Privacy Policy. If you don't agree, don't use
          the Service. If you're using Phoebe on behalf of a community,
          parish, or organization, you represent that you have authority
          to accept these Terms on its behalf.
        </p>
      </Section>

      <Section title="2. Eligibility and how you get access">
        <p>
          You must be at least 13 years old to use Phoebe. We don't allow
          children under 13 to create accounts or use the Service, and we
          don't knowingly collect information from anyone under 13. If you
          are between 13 and the age of majority where you live, you may
          use Phoebe only with the consent and supervision of a parent or
          legal guardian who accepts these Terms on your behalf.
        </p>
        <p>
          There is more than one way to use Phoebe. You can create an
          account through open signup on the web or in the app. You can
          use Phoebe as a guest, without creating an account at all. Or
          you can arrive through an invite link that another user sends
          you, either to join their group or simply to try the app — an
          invite link is one path in among several, not a requirement.
          Phoebe is not an invite-only app, and no invitation is needed to
          register.
        </p>
      </Section>

      <Section title="3. Your account, and using Phoebe as a guest">
        <p>
          If you register, you're responsible for the accuracy of the
          information you give us, for keeping your password confidential,
          and for everything that happens under your account. Tell us
          promptly at <MailLink /> if you believe someone else has gained
          access to it. You may not share your account, sell it, or
          transfer it to anyone else.
        </p>
        <p>
          <strong>Guest use.</strong> You can use Phoebe's core prayer
          practices as a guest, without an account. A guest session
          belongs to the device you're using rather than to you: it can't
          be signed into from another device, we can't recover it if you
          clear your device storage or delete the app, and we have no way
          to verify that a guest session belongs to any particular person.
          Guest data is stored on your device, not on our servers, so
          there is nothing for us to restore. If you want your practice
          history to persist across devices, or to survive a lost phone,
          create an account. These Terms apply in full to guest use.
        </p>
        <p>
          Group participation, push notification reminders, and
          server-synced history require an account, because each of them
          depends on us knowing who you are across sessions and devices.
        </p>
      </Section>

      <Section title="4. License to use Phoebe">
        <p>
          We grant you a personal, limited, non-exclusive,
          non-transferable, revocable license to use the Service for your
          own personal, non-commercial devotional and community use, in
          accordance with these Terms. We reserve all rights not expressly
          granted here. You may not copy, modify, reverse engineer,
          decompile, scrape, resell, or create derivative works from the
          Service or any part of it, or attempt to gain unauthorized
          access to our systems or another user's account. Phoebe's name,
          logo, design, and software are ours or our licensors'.
        </p>
        <p>
          Phoebe is free. There are no subscriptions, in-app purchases, or
          fees of any kind, and we don't process payments. If that ever
          changes, we'll say so clearly before it applies to you.
        </p>
      </Section>

      <Section title="5. Community standards and acceptable use">
        <p>
          Phoebe exists to help people pray together. Some conduct is
          incompatible with that, and with the safety of the people here.
          You agree not to use the Service to:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Harass, threaten, stalk, bully, defame, or intimidate anyone.
          </li>
          <li>
            Post or share content that sexualizes minors in any way, or
            that constitutes child sexual abuse material. We report this
            to the appropriate authorities and permanently ban the account
            without warning.
          </li>
          <li>
            Post sexually explicit content, graphic violence, or content
            that promotes self-harm, suicide, or disordered eating.
          </li>
          <li>
            Post hate speech, or content that attacks or demeans people on
            the basis of race, ethnicity, national origin, religion,
            disability, sex, gender identity, sexual orientation, or age.
          </li>
          <li>
            Impersonate another person, misrepresent your affiliation with
            a parish, diocese, or organization, or falsely present
            yourself as clergy.
          </li>
          <li>
            Use the Service to solicit, advertise, spam, recruit for a
            commercial venture, or conduct any commercial activity.
          </li>
          <li>
            Post content you don't have the right to post, including
            copyrighted text, liturgy, music, or images belonging to
            someone else.
          </li>
          <li>
            Attempt to identify, deanonymize, or compile information about
            other users, including followers of a group whose identities
            the app deliberately keeps private from anyone other than that
            group's admins.
          </li>
          <li>
            Interfere with the Service's operation, security, or
            availability, or use it to distribute malware.
          </li>
          <li>Break the law, or help someone else break it.</li>
        </ul>
        <p>
          If you're an admin of a group, you're also responsible for the
          content you post to it and for how you use the visibility that
          role gives you over your group's followers and members.
        </p>
        <p>
          We may remove content or suspend accounts that violate these
          standards. We're a very small operation and we don't
          pre-moderate content, so we rely on reports from users to know
          when something is wrong.
        </p>
      </Section>

      <Section title="6. Your content">
        <p>
          Everything you create in Phoebe belongs to you. That includes
          your prayer list, your notes and reflections, the custom
          practices you define, weekly plans and uploaded files if you're
          a group leader, standing intercessions, opportunities you post,
          and rule-of-life requests you send.
        </p>
        <p>
          You grant us a limited license to store, reproduce, and display
          your content solely for the purpose of operating the Service and
          delivering it to the people you've directed it to. We don't use
          your content to train machine learning models, we don't sell it,
          we don't publish it, and we don't share it outside the groups and
          recipients you've shared it with. Your personal content is
          private to you unless you take a specific action to share it.
        </p>
        <p>
          You're responsible for your content, including having the right
          to post it. If you delete your content or your account, we remove
          it as described in the Privacy Policy — with the narrow exception
          of content you posted to a group as its admin, which may remain
          with that group so its shared record isn't broken by one person
          leaving.
        </p>
      </Section>

      <Section title="7. Reporting">
        <p>
          If you see content or behavior that violates Section 5, report
          it. There is a report control in the app, and you can always
          write to us directly at <MailLink />. A report tells us what was
          reported, who reported it, and what the content was, so we can
          look at it in context.
        </p>
        <p>
          We review reports and act on them ourselves — there's no
          automated moderation system standing between you and a person.
          Depending on what we find, we may remove content, warn a user,
          remove someone from a group, or suspend or terminate an account.
          Reports of content sexualizing minors are acted on immediately.
        </p>
        <p>
          If you feel unsafe around a specific person in a group, you can
          also leave that group at any time, and you can ask us to remove
          you from it if you'd rather we handle it. Tell us and we will.
        </p>
      </Section>

      <Section title="8. Termination">
        <p>
          You can stop using Phoebe whenever you like, and you can delete
          your account from Settings at any time. Deletion is permanent and
          immediate.
        </p>
        <p>
          We may suspend or terminate your access if you violate these
          Terms, if we're required to by law, or if we discontinue the
          Service. Where the circumstances allow it, we'll give you notice
          and a chance to export your data first; where a violation is
          serious enough — anything involving minors, threats, or the
          safety of other users — we may act immediately and without
          notice. Sections 6, 10, 11, 12, 14, and 16 survive termination.
        </p>
      </Section>

      <Section title="9. Apple App Store additional terms">
        <p>
          These terms apply if you obtained Phoebe from the Apple App
          Store. They form the Licensed Application End User License
          Agreement between you and us, not between you and Apple.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Acknowledgement.</strong> You and we acknowledge that
            these Terms are concluded between you and us only, and not
            with Apple. Apple is not responsible for Phoebe or its
            content.
          </li>
          <li>
            <strong>Scope of license.</strong> The license granted to you
            for Phoebe is a non-transferable license to use the app on any
            Apple-branded product that you own or control, as permitted by
            the Usage Rules in the Apple Media Services Terms and
            Conditions.
          </li>
          <li>
            <strong>Maintenance and support.</strong> We are solely
            responsible for providing any maintenance and support services
            for Phoebe. Apple has no obligation to furnish any maintenance
            or support services.
          </li>
          <li>
            <strong>Warranty.</strong> We are solely responsible for any
            product warranties, whether express or implied by law, to the
            extent not effectively disclaimed. If Phoebe fails to conform
            to any applicable warranty, you may notify Apple, and Apple
            will refund the purchase price (if any) to you. To the maximum
            extent permitted by applicable law, Apple has no other
            warranty obligation whatsoever with respect to Phoebe.
          </li>
          <li>
            <strong>Product claims.</strong> We, not Apple, are
            responsible for addressing any claims relating to Phoebe,
            including product liability claims, any claim that Phoebe
            fails to conform to a legal or regulatory requirement, and
            claims arising under consumer protection or similar
            legislation.
          </li>
          <li>
            <strong>Intellectual property claims.</strong> In the event of
            any third-party claim that Phoebe infringes that third party's
            intellectual property rights, we, not Apple, are solely
            responsible for the investigation, defense, settlement, and
            discharge of that claim.
          </li>
          <li>
            <strong>Legal compliance.</strong> You represent and warrant
            that you are not located in a country subject to a U.S.
            Government embargo or designated as a "terrorist supporting"
            country, and that you are not listed on any U.S. Government
            list of prohibited or restricted parties.
          </li>
          <li>
            <strong>Third-party beneficiary.</strong> Apple and its
            subsidiaries are third-party beneficiaries of these Terms, and
            upon your acceptance, Apple has the right (and is deemed to
            have accepted the right) to enforce these Terms against you as
            a third-party beneficiary.
          </li>
        </ul>
      </Section>

      <Section title="10. Disclaimer of warranties">
        <p>
          Phoebe is provided "as is" and "as available," without
          warranties of any kind, whether express, implied, or statutory.
          To the fullest extent permitted by law, we disclaim all implied
          warranties, including merchantability, fitness for a particular
          purpose, title, and non-infringement. We don't warrant that the
          Service will be uninterrupted, timely, secure, or error-free,
          that reminders or notifications will always be delivered, or
          that any content will be accurate or available.
        </p>
        <p>
          Phoebe is a devotional tool, not a substitute for pastoral care,
          medical care, or mental health care. Content in the app,
          including material from partner organizations, is offered for
          reflection and is not professional advice. If you are in crisis,
          please contact a qualified professional or an emergency service
          in your area.
        </p>
        <p>
          Some jurisdictions don't allow the exclusion of certain
          warranties, so parts of this section may not apply to you.
        </p>
      </Section>

      <Section title="11. Limitation of liability">
        <p>
          To the fullest extent permitted by law, we will not be liable
          for any indirect, incidental, special, consequential, exemplary,
          or punitive damages, or for any loss of data, goodwill, or
          profits, arising out of or relating to your use of the Service —
          even if we've been advised of the possibility.
        </p>
        <p>
          Our total liability for all claims relating to the Service will
          not exceed one hundred U.S. dollars ($100) or the amount you
          have paid us in the twelve months before the claim, whichever is
          greater. Phoebe is free, so in most cases this will be $100.
        </p>
        <p>
          Some jurisdictions don't allow these limitations, so parts of
          this section may not apply to you. Nothing here limits liability
          for fraud, gross negligence, or anything else that can't be
          limited by law.
        </p>
      </Section>

      <Section title="12. Indemnification">
        <p>
          You agree to indemnify and hold harmless Jeremy Cannon, doing
          business as Phoebe, from any claims, damages, losses,
          liabilities, and expenses (including reasonable legal fees)
          arising out of your use of the Service, your content, or your
          violation of these Terms or of anyone else's rights.
        </p>
      </Section>

      <Section title="13. Copyright and DMCA">
        <p>
          We respect copyright, and Phoebe carries a lot of content that
          belongs to other people — liturgy, devotional writing, music,
          and podcasts among it. If you believe content in Phoebe
          infringes your copyright, send a notice to <MailLink /> including:
          your contact information; a description of the work you say is
          infringed; a description of the material in Phoebe you're
          objecting to and where to find it; a statement that you have a
          good-faith belief the use isn't authorized; a statement that the
          information in your notice is accurate and, under penalty of
          perjury, that you're the owner or authorized to act for the
          owner; and your physical or electronic signature.
        </p>
        <p>
          We'll remove or disable access to material we determine is
          infringing, and we may terminate accounts of repeat infringers.
          If your content was removed and you believe that was a mistake,
          you can send a counter-notice to the same address with
          equivalent detail.
        </p>
      </Section>

      <Section title="14. Governing law, arbitration, and class-action waiver">
        <p>
          These Terms are governed by the laws of the Commonwealth of
          Virginia, without regard to its conflict-of-laws rules, except
          that the Federal Arbitration Act governs the arbitration
          provisions below.
        </p>
        <p>
          <strong>Talk to us first.</strong> If you have a dispute, please
          email <MailLink /> and describe it. Most problems can be
          resolved this way, and both of us agree to try for at least 60
          days before starting a formal proceeding.
        </p>
        <p>
          <strong>Arbitration.</strong> If we can't resolve it informally,
          you and we agree that any dispute arising out of or relating to
          these Terms or the Service will be resolved by binding
          individual arbitration administered by the American Arbitration
          Association under its Consumer Arbitration Rules, rather than in
          court. The arbitration will take place in the Commonwealth of
          Virginia or, at your election, by telephone, video, or document
          submission. An arbitrator can award the same individual relief a
          court could.
        </p>
        <p>
          <strong>Exceptions.</strong> Either of us may bring a claim in
          small claims court if it qualifies, and either of us may seek
          injunctive relief in court to stop unauthorized use or misuse of
          the Service or infringement of intellectual property.
        </p>
        <p>
          <strong>Class-action waiver.</strong> You and we agree to bring
          claims only in an individual capacity, and not as a plaintiff or
          class member in any class, collective, consolidated, or
          representative proceeding. The arbitrator may not consolidate
          more than one person's claims. If this waiver is found
          unenforceable as to a particular claim, that claim proceeds in
          court rather than in arbitration.
        </p>
        <p>
          <strong>Your right to opt out.</strong> You can reject this
          arbitration agreement by emailing <MailLink /> within 30 days of
          first accepting these Terms, with your name and a statement that
          you're opting out of arbitration. Opting out costs you nothing
          and changes nothing else about your use of Phoebe.
        </p>
        <p>
          If you live outside the United States, nothing here deprives you
          of the protections of the mandatory consumer law of the country
          where you live, or of your right to bring proceedings in your
          local courts where that law gives you that right.
        </p>
      </Section>

      <Section title="15. Changes to these Terms">
        <p>
          We may update these Terms as Phoebe changes, and the date at the
          top will always reflect the last revision. If a change is
          material, we'll notify you in the app before it takes effect
          rather than relying on you to notice. Continuing to use Phoebe
          after a change takes effect means you accept the updated Terms.
          If you don't accept them, stop using the Service and delete your
          account.
        </p>
      </Section>

      <Section title="16. Miscellaneous">
        <p>
          These Terms, together with the Privacy Policy, are the entire
          agreement between you and us about the Service. If any provision
          is held unenforceable, the rest stays in effect. Our failure to
          enforce a provision isn't a waiver of it. You may not assign
          these Terms; we may assign them in connection with a transfer of
          the Service, in which case we'll tell you. Nothing in these
          Terms creates a partnership, employment, or agency relationship
          between us. We aren't liable for failures caused by events
          outside our reasonable control.
        </p>
      </Section>

      <Section title="17. Third-party content and links">
        <p>
          Phoebe embeds and links to content from other organizations,
          including podcasts, daily reflections, scripture and lectionary
          sources, a cathedral livestream, and meeting links a group adds.
          We don't control that content, we don't endorse everything in
          it, and we're not responsible for it. Each of those
          organizations has its own terms and privacy policy, which govern
          your use of their content once you're there. Where a group adds
          a meeting or calendar link, that link is the group's, not ours.
        </p>
        <p>
          Where a group schedules a gathering, Google delivers the
          calendar invite to attendees on the group's behalf; our Privacy
          Policy explains what that involves.
        </p>
      </Section>

      <Section title="18. Contact">
        <p>
          For legal notices, policy questions, copyright complaints, or
          anything else about these Terms, email <MailLink />.
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

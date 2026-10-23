import { ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { YStack, XStack, Text, Button } from 'tamagui'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useThemeColors } from '@/theme/useThemeColors'
import { useAuthStore } from '@/stores/authStore'
import { useBackTo } from '@/lib/useBackTo'
import { ORG_NAME, SUPPORT_EMAIL, ORG_MAILING_ADDRESS } from '@/lib/orgInfo'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useThemeColors()
  return (
    <YStack gap="$2" marginBottom="$5">
      <Text color={c.text} fontSize={16} fontWeight="700">
        {title}
      </Text>
      {children}
    </YStack>
  )
}

function Body({ children }: { children: React.ReactNode }) {
  const c = useThemeColors()
  return (
    <Text color={c.text} fontSize={14} lineHeight={22}>
      {children}
    </Text>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  const c = useThemeColors()
  return (
    <XStack gap="$2" paddingLeft="$2">
      <Text color={c.textMuted} fontSize={14}>
        •
      </Text>
      <Text color={c.text} fontSize={14} lineHeight={22} flex={1}>
        {children}
      </Text>
    </XStack>
  )
}

export default function PrivacyPolicyScreen() {
  const router = useRouter()
  const c = useThemeColors()
  const signedIn = useAuthStore((s) => !!s.fbUser)
  // Opened from Settings when signed in, from the login screen when not.
  const goBack = useBackTo(signedIn ? '/(app)/settings' : '/(auth)/login')

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <XStack paddingHorizontal="$4" paddingVertical="$3" alignItems="center" gap="$3">
        <Button
          size="$4"
          variant="outlined"
          onPress={goBack}
          minHeight={44}
          paddingHorizontal="$4"
          cursor="pointer"
        >
          ← Back
        </Button>
        <Text color={c.text} fontSize={18} fontWeight="700" flex={1}>
          Privacy Policy
        </Text>
      </XStack>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <YStack gap="$2" marginBottom="$6">
          <Text color={c.text} fontSize={22} fontWeight="800">
            Privacy Policy
          </Text>
          <Text color={c.textMuted} fontSize={13}>
            Effective date: October 23, 2026
          </Text>
          <Body>
            This Privacy Policy explains how The Well of Iowa (“we,” “us,” or “our”) collects, uses,
            and protects information when you use the Mission Portal app (“App”). By using the App
            you agree to the practices described here.
          </Body>
        </YStack>

        <Section title="1. Information We Collect">
          <Body>We collect the following categories of information:</Body>
          <YStack gap="$1.5" marginTop="$1">
            <Bullet>
              <Text fontWeight="700">Account information</Text> — your email address, display name,
              and password (stored as a secure hash by Firebase Authentication; we never see the
              plaintext).
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Profile data</Text> — an optional profile photo and any
              information you choose to add during onboarding.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Location preference</Text> — if you opt in, a city, state, and
              approximate radius you provide so we can surface nearby events. Precise GPS
              coordinates are only stored if your device shares them to geocode an address you
              enter; we do not track your live location.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Phone number</Text> — only if you choose to give one when
              asking to join our texting list for event and church-meeting updates. It is optional,
              it is never required to use the App, and nothing else in the App uses it. See section
              6 for exactly what happens to it.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Device &amp; push-notification tokens</Text> — a push token
              tied to your device (iOS, Android, or web) so we can deliver notifications. Tokens are
              rotated automatically by the platform.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Activity &amp; content</Text> — events you create or RSVP to,
              messages you send, assignments you complete, availability responses, security incident
              reports, worship set lists, planning board items, inventory adjustments,
              announcements, and requests to meet with our leadership (who you asked to meet, when
              you are free, and your message).
            </Bullet>
            <Bullet>
              <Text fontWeight="700">What you ask Miriam</Text> — the words you say or type to
              Miriam, the App&rsquo;s assistant. Section 7 explains where they go and what is kept.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Your voice, turned into words</Text> — when you tap 🎤 or use
              &ldquo;Hey Miriam,&rdquo; your device&rsquo;s speech recognition turns what you say
              into text. The App works with that text only; it does not record or keep audio.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Usage metadata</Text> — account creation timestamp and last
              login time, used for account management and security.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Crash &amp; error reports</Text> — anonymized diagnostic data
              captured automatically by Sentry when the App encounters an error, including device
              type, OS version, and a stack trace. No personal content from your session is
              included.
            </Bullet>
          </YStack>
        </Section>

        <Section title="2. How We Use Your Information">
          <YStack gap="$1.5">
            <Bullet>Authenticate your identity and secure your account.</Bullet>
            <Bullet>
              Provide core App features: events, team coordination, messaging, worship planning,
              inventory, operations, and announcements.
            </Bullet>
            <Bullet>
              Send push notifications and email digests you subscribe to (weekly and/or monthly);
              you can change these preferences at any time in Profile &amp; Settings.
            </Bullet>
            <Bullet>
              Display upcoming events near your stated location (only when you have opted in to
              share location).
            </Bullet>
            <Bullet>
              Allow admins to manage team membership, roles, and assignments within the
              organization.
            </Bullet>
            <Bullet>
              Pass your name and phone number to our Connections Coordinator, once a day, if you
              asked to join the texting list — so a person can add you to the church&apos;s
              messaging service. The App itself never sends texts.
            </Bullet>
            <Bullet>Answer what you ask Miriam, and carry out what you ask her to do.</Bullet>
            <Bullet>Diagnose and fix app crashes and bugs using anonymized error reports.</Bullet>
            <Bullet>
              Maintain an audit trail of administrative actions for organizational accountability.
            </Bullet>
          </YStack>
        </Section>

        <Section title="3. How We Share Your Information">
          <Body>
            We do not sell, rent, or trade your personal information. We share data only in these
            limited circumstances:
          </Body>
          <YStack gap="$1.5" marginTop="$1">
            <Bullet>
              <Text fontWeight="700">Within the organization</Text> — admins and other team members
              with appropriate roles can see your display name, profile photo, availability,
              assignments, and messages in rooms you share. Security staff can see incident reports.
              If you asked to join the texting list, the Connections Coordinator and admins can see
              the phone number you gave; other members cannot. A request to meet is seen by the
              leaders you asked to meet and by admins, with your name and the email on your account.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Service providers</Text> — we use Google Firebase
              (authentication, database, cloud functions, and hosting), Sentry (crash reporting),
              and Expo (push-notification infrastructure). Each provider processes only the data
              necessary to deliver their service and is bound by their own privacy policies and
              Google’s/Sentry’s data-processing terms.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Anthropic (Claude), an AI provider</Text> — some requests a
              team member makes of Miriam are answered with Anthropic&rsquo;s AI model, Claude. What
              is sent, and when, is set out in section 7. Requests from public accounts are never
              sent to Anthropic.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Lookup services</Text> — to answer some questions the App looks
              things up with outside services: Wikipedia, for general questions put to Miriam; the
              US National Weather Service and Open-Meteo, for forecasts and weather alerts; and
              Mapbox, to find the city you give for nearby events. They are sent the words of the
              question, a place, or a city and state — not your name, email or account. Section 10
              lists them all.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Legal requirements</Text> — if required by law, court order, or
              to protect the rights and safety of our members.
            </Bullet>
          </YStack>
        </Section>

        <Section title="4. Data Retention">
          <Body>
            Account data is retained for as long as your account is active. If you request account
            deletion, your profile and personal data are queued for removal; admins are notified and
            complete the deletion within a reasonable time. Content you contributed (messages, event
            records, security reports) may be retained in anonymized or de-identified form for
            organizational record-keeping where required. Push tokens are removed when you sign out
            or delete your account. What is kept about requests to Miriam, and for how long, is in
            section 7.
          </Body>
        </Section>

        <Section title="5. Security">
          <Body>
            Passwords are never stored in plaintext — they are managed exclusively by Firebase
            Authentication. All data in transit is encrypted via TLS. Access to Firestore data is
            controlled by security rules that enforce role-based permissions. We use Sentry with
            data scrubbing to avoid capturing sensitive information in crash reports. No security
            system is perfect; please use a strong, unique password and enable device lock.
          </Body>
        </Section>

        <Section title="6. Notifications, Email Digests &amp; the Texting List">
          <Body>
            The App may send push notifications and email digests for events, assignments,
            announcements, and other team activity. You control which notifications you receive in
            Profile &amp; Settings → Notifications. You can unsubscribe from email digests at any
            time by toggling them off in settings or clicking “Unsubscribe” in any digest email.
          </Body>
          <Body>
            The texting list is separate from the App and works differently, so it is worth being
            precise about it. If you ask to join it during sign-up, you may give a phone number. The
            App never sends you a text. What it does is store your name and number and show them,
            once a day, to a single member of our leadership team — the Connections Coordinator —
            whose job is to add you to the messaging service the church actually sends texts from.
          </Body>
          <YStack gap="$1.5" marginTop="$1">
            <Bullet>
              Giving a number is optional. Skipping it changes nothing else about your account.
            </Bullet>
            <Bullet>
              Your number is visible to the Connections Coordinator and to App administrators. It is
              not shown to other members, and it is not published anywhere in the App.
            </Bullet>
            <Bullet>
              We do not sell phone numbers, share them with advertisers, or use them for anything
              other than the event and church-meeting texts you asked for.
            </Bullet>
            <Bullet>
              You can leave the texting list at any time by replying{' '}
              <Text fontWeight="700">STOP</Text> to any message we send. That stops the texts and
              does not affect your App account.
            </Bullet>
            <Bullet>
              If you are already on the list, asking again does not subscribe you twice or cause
              duplicate messages.
            </Bullet>
            <Bullet>
              To have your number removed from the App itself, ask an admin or delete your account —
              see section 9. Note that leaving the App does not by itself remove you from the
              church&apos;s messaging service; reply STOP to do that.
            </Bullet>
          </YStack>
          <Body>Message and data rates may apply to texts, according to your mobile plan.</Body>
        </Section>

        <Section title="7. Miriam, the In-App Assistant">
          <Body>
            Miriam answers questions and carries out requests you make by voice or by typing. Each
            request is handled in one of three places, and goes no further than it needs to:
          </Body>
          <YStack gap="$1.5" marginTop="$1">
            <Bullet>
              <Text fontWeight="700">On your device</Text> — many requests (opening a screen,
              reminders, songs, simple questions about events) are worked out by the App on your
              phone or computer, from what it already has.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">On our servers, by Miriam&rsquo;s own model</Text> — a small
              language model that runs on our Firebase servers. Nothing is sent to any AI company.
              Requests from public accounts are only ever answered on the device or here.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">By Anthropic&rsquo;s Claude</Text> — for team accounts only,
              when a request needs more than Miriam can do herself. We send Anthropic what you said
              or typed, the last few turns of that conversation, and the information from the App
              needed to answer it — for example the events, tasks, messages or names it looks up —
              never more than your own account is allowed to see. Anthropic processes it to produce
              the answer under its commercial terms, which do not allow it to train its models on
              this data. Its privacy policy is at anthropic.com/legal/privacy.
            </Bullet>
          </YStack>
          <Body>
            When Miriam answers a general question about the world, she looks it up on Wikipedia,
            sending the words of the question and nothing about you. Asked about the weather in a
            place, she sends that place&rsquo;s name and location to Open-Meteo for its forecast.
          </Body>
          <Body>What is kept:</Body>
          <YStack gap="$1.5" marginTop="$1">
            <Bullet>
              The words of questions asked, with the kind of account that asked (team member, guest
              or public) — never who — so admins can see what people ask most. Kept about 13 months,
              then deleted.
            </Bullet>
            <Bullet>
              A record of how each request was handled and whether it worked, with neither the words
              nor who asked. Kept about 13 months, then deleted.
            </Bullet>
            <Bullet>
              The wording of some requests, without who asked, as examples that help Miriam answer
              more of them herself. Admins can review and remove them.
            </Bullet>
            <Bullet>
              The conversation itself is remembered on your device only, so you can follow up; it is
              forgotten after 10 minutes without a new request.
            </Bullet>
          </YStack>
          <Body>
            Before Miriam changes anything for you — sending a message, signing you up, updating a
            task — she shows you what she will do and waits for you to confirm. Reminders you ask
            her for are set straight away. Miriam can be wrong; check anything important in the App
            itself.
          </Body>
        </Section>

        <Section title="8. Children's Privacy">
          <Body>
            The App is intended for people aged 13 and older. We do not knowingly collect personal
            information from children under 13. If you believe a child under 13 has created an
            account, please contact an admin to have it removed.
          </Body>
        </Section>

        <Section title="9. Your Rights">
          <Body>
            Depending on your jurisdiction you may have rights to access, correct, or request
            deletion of your personal data. To exercise these rights, contact an admin through the
            App or reach out to us at the contact information below. We will respond within 30 days.
          </Body>
        </Section>

        <Section title="10. Third-Party Services">
          <Body>
            The App integrates with the following third-party services, each governed by its own
            privacy policy:
          </Body>
          <YStack gap="$1.5" marginTop="$1">
            <Bullet>Google Firebase — firebase.google.com/support/privacy</Bullet>
            <Bullet>Sentry — sentry.io/privacy</Bullet>
            <Bullet>Expo — expo.dev/privacy</Bullet>
            <Bullet>YouTube (Google) — policies.google.com/privacy</Bullet>
            <Bullet>
              Anthropic (Claude, for some of Miriam&rsquo;s answers to team members) —
              anthropic.com/legal/privacy
            </Bullet>
            <Bullet>
              Wikipedia (Wikimedia Foundation, for Miriam&rsquo;s general answers) —
              foundation.wikimedia.org/wiki/Policy:Privacy_policy
            </Bullet>
            <Bullet>
              US National Weather Service (forecasts and weather alerts) — weather.gov/privacy
            </Bullet>
            <Bullet>
              Open-Meteo (forecasts, and finding places by name) — open-meteo.com/en/terms
            </Bullet>
            <Bullet>
              Mapbox (finding the city you give for nearby events) — mapbox.com/legal/privacy
            </Bullet>
            <Bullet>
              Speech recognition by your device&rsquo;s maker — Apple (apple.com/legal/privacy) on
              iPhone and iPad, Google (policies.google.com/privacy) on Android and in Chrome
            </Bullet>
            <Bullet>
              Meta (Facebook), when an admin connects the church&rsquo;s Facebook Page so the App
              can show its posts — facebook.com/privacy/policy
            </Bullet>
            <Bullet>
              Resend (delivering email, when the App sends any) — resend.com/legal/privacy-policy
            </Bullet>
          </YStack>
          <Body>
            Your device&rsquo;s speech recognition may process the sound of your voice on the device
            or on its maker&rsquo;s servers, depending on the device and its settings; the App
            receives only the words.
          </Body>
          <Body>
            The Content section and the live stream box show videos through YouTube&rsquo;s embedded
            player. Video thumbnails are loaded from YouTube&rsquo;s servers, so simply viewing
            those screens tells YouTube your device&rsquo;s IP address and browser or app details.
            Opening a video shares more with YouTube, which it uses to play the video and for its
            own purposes, described in Google&rsquo;s Privacy Policy. We do not send YouTube your
            name, email address, or anything else from your portal account, and we receive nothing
            back about what you watch. Your use of the embedded player is also subject to the
            YouTube Terms of Service at youtube.com/t/terms.
          </Body>
          <Body>
            Some pictures, such as the book covers on Our Story and the Elim Store, load from the
            church&rsquo;s website host, Squarespace (squarespace.com/privacy), which sees your
            device&rsquo;s IP address the same way. Links to give, to shop at the Elim Store, or to
            get directions open outside the App — in your browser or in apps such as Tithe.ly,
            Venmo, Cash App or Maps — and what you do there is covered by those services&rsquo; own
            policies.
          </Body>
        </Section>

        <Section title="11. Changes to This Policy">
          <Body>
            We may update this Privacy Policy from time to time. When we do, we will update the
            effective date at the top of this page and, for material changes, notify active users
            through an in-app announcement.
          </Body>
        </Section>

        <Section title="12. Contact Us">
          <Body>
            Questions or concerns about this Privacy Policy, or a request to access or delete your
            data, can be sent to:
          </Body>
          <YStack gap="$1.5" marginTop="$1">
            <Bullet>{ORG_NAME}</Bullet>
            {SUPPORT_EMAIL ? <Bullet>{SUPPORT_EMAIL}</Bullet> : null}
            {ORG_MAILING_ADDRESS ? <Bullet>{ORG_MAILING_ADDRESS}</Bullet> : null}
          </YStack>
          <Body>
            You can also delete your account and its data yourself at any time from Profile &amp;
            Settings → Delete account.
          </Body>
        </Section>

        <Section title="13. Terms of Use">
          <Body>
            Your use of the App is also governed by our Terms of Use, which set out the rules for
            content posted in the App and how to report content you find objectionable.
          </Body>
          <Button
            size="$3"
            variant="outlined"
            alignSelf="flex-start"
            marginTop="$2"
            onPress={() => router.push('/(auth)/terms')}
          >
            Read the Terms of Use
          </Button>
        </Section>
      </ScrollView>
    </SafeAreaView>
  )
}

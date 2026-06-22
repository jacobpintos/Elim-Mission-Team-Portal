import { ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { YStack, XStack, Text, Button } from 'tamagui'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useThemeColors } from '@/theme/useThemeColors'

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
      <Text color={c.textMuted} fontSize={14}>•</Text>
      <Text color={c.text} fontSize={14} lineHeight={22} flex={1}>
        {children}
      </Text>
    </XStack>
  )
}

export default function PrivacyPolicyScreen() {
  const router = useRouter()
  const c = useThemeColors()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <XStack paddingHorizontal="$4" paddingVertical="$3" alignItems="center" gap="$3">
        <Button size="$3" variant="outlined" onPress={() => router.back()}>
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
            Effective date: June 22, 2026
          </Text>
          <Body>
            This Privacy Policy explains how Elim Mission Team (“we,” “us,” or “our”) collects,
            uses, and protects information when you use the Mission Portal app (“App”). By using the
            App you agree to the practices described here.
          </Body>
        </YStack>

        <Section title="1. Information We Collect">
          <Body>We collect the following categories of information:</Body>
          <YStack gap="$1.5" marginTop="$1">
            <Bullet>
              <Text fontWeight="700">Account information</Text> — your email address, display
              name, and password (stored as a secure hash by Firebase Authentication; we never see
              the plaintext).
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Profile data</Text> — an optional profile photo and any
              information you choose to add during onboarding.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Location preference</Text> — if you opt in, a city, state,
              and approximate radius you provide so we can surface nearby events. Precise GPS
              coordinates are only stored if your device shares them to geocode an address you
              enter; we do not track your live location.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Device &amp; push-notification tokens</Text> — a push token
              tied to your device (iOS, Android, or web) so we can deliver notifications. Tokens
              are rotated automatically by the platform.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Activity &amp; content</Text> — events you create or RSVP
              to, messages you send, assignments you complete, availability responses, security
              incident reports, worship set lists, planning board items, inventory adjustments,
              and announcements.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Usage metadata</Text> — account creation timestamp and last
              login time, used for account management and security.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Crash &amp; error reports</Text> — anonymized diagnostic
              data captured automatically by Sentry when the App encounters an error, including
              device type, OS version, and a stack trace. No personal content from your session
              is included.
            </Bullet>
          </YStack>
        </Section>

        <Section title="2. How We Use Your Information">
          <YStack gap="$1.5">
            <Bullet>Authenticate your identity and secure your account.</Bullet>
            <Bullet>Provide core App features: events, team coordination, messaging, worship planning, inventory, operations, and announcements.</Bullet>
            <Bullet>Send push notifications and email digests you subscribe to (weekly and/or monthly); you can change these preferences at any time in Profile &amp; Settings.</Bullet>
            <Bullet>Display upcoming events near your stated location (only when you have opted in to share location).</Bullet>
            <Bullet>Allow admins to manage team membership, roles, and assignments within the organization.</Bullet>
            <Bullet>Diagnose and fix app crashes and bugs using anonymized error reports.</Bullet>
            <Bullet>Maintain an audit trail of administrative actions for organizational accountability.</Bullet>
          </YStack>
        </Section>

        <Section title="3. How We Share Your Information">
          <Body>
            We do not sell, rent, or trade your personal information. We share data only in these
            limited circumstances:
          </Body>
          <YStack gap="$1.5" marginTop="$1">
            <Bullet>
              <Text fontWeight="700">Within the organization</Text> — admins and other team
              members with appropriate roles can see your display name, profile photo, availability,
              assignments, and messages in rooms you share. Security staff can see incident
              reports.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Service providers</Text> — we use Google Firebase (authentication, database, cloud functions, and hosting), Sentry (crash reporting), and Expo (push-notification infrastructure). Each provider processes only the data necessary to deliver their service and is bound by their own privacy policies and Google’s/Sentry’s data-processing terms.
            </Bullet>
            <Bullet>
              <Text fontWeight="700">Legal requirements</Text> — if required by law, court order,
              or to protect the rights and safety of our members.
            </Bullet>
          </YStack>
        </Section>

        <Section title="4. Data Retention">
          <Body>
            Account data is retained for as long as your account is active. If you request account
            deletion, your profile and personal data are queued for removal; admins are notified and
            complete the deletion within a reasonable time. Content you contributed (messages,
            event records, security reports) may be retained in anonymized or de-identified form
            for organizational record-keeping where required. Push tokens are removed when you sign
            out or delete your account.
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

        <Section title="6. Notifications &amp; Email Digests">
          <Body>
            The App may send push notifications and email digests for events, assignments,
            announcements, and other team activity. You control which notifications you receive
            in Profile &amp; Settings → Notifications. You can unsubscribe from email digests
            at any time by toggling them off in settings or clicking “Unsubscribe” in any digest
            email.
          </Body>
        </Section>

        <Section title="7. Children's Privacy">
          <Body>
            The App is intended for team members and volunteers aged 13 and older. We do not
            knowingly collect personal information from children under 13. If you believe a child
            under 13 has created an account, please contact an admin to have it removed.
          </Body>
        </Section>

        <Section title="8. Your Rights">
          <Body>
            Depending on your jurisdiction you may have rights to access, correct, or request
            deletion of your personal data. To exercise these rights, contact an admin through
            the App or reach out to us at the contact information below. We will respond within
            30 days.
          </Body>
        </Section>

        <Section title="9. Third-Party Services">
          <Body>
            The App integrates with the following third-party services, each governed by its own
            privacy policy:
          </Body>
          <YStack gap="$1.5" marginTop="$1">
            <Bullet>Google Firebase — firebase.google.com/support/privacy</Bullet>
            <Bullet>Sentry — sentry.io/privacy</Bullet>
            <Bullet>Expo — expo.dev/privacy</Bullet>
          </YStack>
        </Section>

        <Section title="10. Changes to This Policy">
          <Body>
            We may update this Privacy Policy from time to time. When we do, we will update the
            effective date at the top of this page and, for material changes, notify active users
            through an in-app announcement.
          </Body>
        </Section>

        <Section title="11. Contact Us">
          <Body>
            Questions or concerns about this Privacy Policy? Contact the Mission Portal admin
            team through the App or at the organization contact on file.
          </Body>
        </Section>
      </ScrollView>
    </SafeAreaView>
  )
}

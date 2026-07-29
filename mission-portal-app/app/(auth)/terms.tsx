import { ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { YStack, XStack, Text, Button } from 'tamagui'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useThemeColors } from '@/theme/useThemeColors'
import { ORG_NAME, SUPPORT_EMAIL, ORG_MAILING_ADDRESS, MODERATION_SLA_HOURS } from '@/lib/orgInfo'

export const TERMS_VERSION = '2026-07-29'

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

export default function TermsScreen() {
  const router = useRouter()
  const c = useThemeColors()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <XStack paddingHorizontal="$4" paddingVertical="$3" alignItems="center" gap="$3">
        <Button size="$3" variant="outlined" onPress={() => router.back()}>
          ← Back
        </Button>
        <Text color={c.text} fontSize={18} fontWeight="700" flex={1}>
          Terms of Use
        </Text>
      </XStack>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <YStack gap="$2" marginBottom="$6">
          <Text color={c.text} fontSize={22} fontWeight="800">
            Terms of Use
          </Text>
          <Text color={c.textMuted} fontSize={13}>
            Effective date: July 29, 2026
          </Text>
          <Body>
            These Terms of Use (“Terms”) are an agreement between you and {ORG_NAME} (“we,” “us,” or
            “our”) governing your use of the Mission Portal app (“App”). By creating an account or
            using the App you agree to these Terms. If you do not agree, do not use the App.
          </Body>
        </YStack>

        <Section title="1. Who may use the App">
          <Body>
            You must be at least 13 years old to create an account. Accounts are for the individual
            named on them; do not share your credentials. Access to team features is granted by an
            administrator and may be changed or revoked at any time.
          </Body>
        </Section>

        <Section title="2. Your content">
          <Body>
            The App lets you post messages, images, reports and other material (“Your Content”). You
            keep ownership of Your Content. By posting it you grant us permission to store and
            display it inside the App so it can be shown to the people you sent it to.
          </Body>
          <Body>
            You are responsible for Your Content and for making sure you have the right to post it.
          </Body>
        </Section>

        <Section title="3. Zero tolerance for objectionable content and abusive behaviour">
          <Body>
            There is no tolerance for objectionable content or abusive users. You agree not to post,
            send, upload or share anything that:
          </Body>
          <YStack gap="$1.5" marginTop="$1">
            <Bullet>Harasses, bullies, threatens, defames or intimidates another person</Bullet>
            <Bullet>Is hateful toward or degrades a person or group</Bullet>
            <Bullet>Is sexually explicit, obscene, or sexualises a minor in any way</Bullet>
            <Bullet>Depicts or encourages violence, self-harm, or illegal activity</Bullet>
            <Bullet>Is spam, a scam, or an attempt to phish or defraud another user</Bullet>
            <Bullet>Infringes anyone’s copyright, trademark, privacy or other rights</Bullet>
            <Bullet>Shares another person’s private information without their consent</Bullet>
            <Bullet>Impersonates another person or misrepresents your affiliation</Bullet>
          </YStack>
        </Section>

        <Section title="4. Reporting and blocking">
          <Body>
            Every message in the App can be reported. Open the message, choose “Report message,” and
            tell us what is wrong with it. You can also block any user from the same menu — blocking
            hides that person’s messages from you everywhere in the App.
          </Body>
          <Body>
            We review every report we receive and act on it within {MODERATION_SLA_HOURS} hours.
            Acting on a report can mean removing the content, warning the user, or removing the user
            from the App permanently. Reported content is hidden from you as soon as you report it.
          </Body>
        </Section>

        <Section title="5. Suspension and termination">
          <Body>
            We may suspend or terminate your account at any time if you break these Terms, and we
            may remove any content that breaks them without notice. You can delete your own account
            at any time from Profile &amp; Settings → Delete account.
          </Body>
        </Section>

        <Section title="6. Privacy">
          <Body>
            Our Privacy Policy explains what we collect and why. It forms part of these Terms.
          </Body>
        </Section>

        <Section title="7. Disclaimers and limitation of liability">
          <Body>
            The App is provided “as is,” without warranties of any kind. To the fullest extent
            permitted by law, {ORG_NAME} is not liable for indirect, incidental or consequential
            damages arising from your use of the App. Nothing in these Terms limits liability that
            cannot be limited by law.
          </Body>
        </Section>

        <Section title="8. Changes to these Terms">
          <Body>
            We may update these Terms. When we make material changes we will update the effective
            date above and notify active users in the App. Continuing to use the App after a change
            means you accept the updated Terms.
          </Body>
        </Section>

        <Section title="9. Contact">
          <Body>
            Questions about these Terms, or a report you want to escalate, can be sent to:
          </Body>
          <YStack gap="$1.5" marginTop="$1">
            <Bullet>{ORG_NAME}</Bullet>
            {SUPPORT_EMAIL ? <Bullet>{SUPPORT_EMAIL}</Bullet> : null}
            {ORG_MAILING_ADDRESS ? <Bullet>{ORG_MAILING_ADDRESS}</Bullet> : null}
          </YStack>
        </Section>
      </ScrollView>
    </SafeAreaView>
  )
}

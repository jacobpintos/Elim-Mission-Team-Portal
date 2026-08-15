import { XStack, Text, Checkbox, Label } from 'tamagui'
import { PUBLIC_SURFACE_ENABLED } from '@/lib/featureFlags'

export const ALL_ROLES = [
  'admin',
  'security',
  'worship',
  'regular',
  'intern',
  'guest',
  'public',
] as const

export type AppRole = (typeof ALL_ROLES)[number]

/**
 * Roles an admin can hand out.
 *
 * `public` is withheld while the public-facing section is hidden: it would
 * grant an account no tabs at all. Existing public profiles keep the role —
 * this only stops new ones being created.
 */
export const ASSIGNABLE_ROLES = ALL_ROLES.filter((r) => r !== 'public' || PUBLIC_SURFACE_ENABLED)

interface RoleCheckboxesProps {
  selected: string[]
  onChange: (roles: string[]) => void
}

export function RoleCheckboxes({ selected, onChange }: RoleCheckboxesProps) {
  const toggle = (role: string) => {
    if (selected.includes(role)) onChange(selected.filter((r) => r !== role))
    else onChange([...selected, role])
  }

  // A withheld role still shows on an account that already holds it —
  // otherwise editing a legacy public profile presents every box unchecked
  // and offers no way to take the role off.
  const shown = ALL_ROLES.filter(
    (r) => (ASSIGNABLE_ROLES as readonly string[]).includes(r) || selected.includes(r)
  )

  return (
    <XStack flexWrap="wrap" gap="$2">
      {shown.map((role) => (
        <XStack key={role} alignItems="center" gap="$2" width="45%">
          <Checkbox
            id={`role-${role}`}
            checked={selected.includes(role)}
            onCheckedChange={() => toggle(role)}
            size="$3"
          >
            <Checkbox.Indicator>
              <Text>✓</Text>
            </Checkbox.Indicator>
          </Checkbox>
          <Label htmlFor={`role-${role}`} fontSize="$3">
            {role.charAt(0).toUpperCase() + role.slice(1)}
          </Label>
        </XStack>
      ))}
    </XStack>
  )
}

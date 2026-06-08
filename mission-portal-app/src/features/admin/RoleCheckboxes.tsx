import { XStack, Text, Checkbox, Label } from 'tamagui'

export const ALL_ROLES = [
  'admin',
  'security',
  'merch',
  'worship',
  'regular',
  'intern',
  'public',
] as const

export type AppRole = (typeof ALL_ROLES)[number]

interface RoleCheckboxesProps {
  selected: string[]
  onChange: (roles: string[]) => void
}

export function RoleCheckboxes({ selected, onChange }: RoleCheckboxesProps) {
  const toggle = (role: string) => {
    if (selected.includes(role)) onChange(selected.filter((r) => r !== role))
    else onChange([...selected, role])
  }

  return (
    <XStack flexWrap="wrap" gap="$2">
      {ALL_ROLES.map((role) => (
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

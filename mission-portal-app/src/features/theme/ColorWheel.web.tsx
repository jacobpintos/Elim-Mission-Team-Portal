import { HexColorPicker } from 'react-colorful'

interface Props {
  color: string
  onChange: (hex: string) => void
}

export function ColorWheel({ color, onChange }: Props) {
  return (
    <HexColorPicker
      color={color}
      onChange={onChange}
      style={{ width: '100%', height: 220, touchAction: 'none' }}
    />
  )
}

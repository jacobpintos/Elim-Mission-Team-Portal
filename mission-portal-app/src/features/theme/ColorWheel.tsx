// Native placeholder — react-colorful uses CSS and DOM APIs not available on native.
// The modal falls back to the H/S/L numeric controls on native.
interface Props {
  color: string
  onChange: (hex: string) => void
}

export function ColorWheel(_props: Props) {
  return null
}

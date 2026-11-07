import type { InputHTMLAttributes } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'value'> & {
  value: string
  onChange: (event: { target: { value: string } }) => void
  decimals?: number
}

export function DecimalInput({ onChange, decimals = 2, min: _min, step: _step, ...props }: Props) {
  const draftPattern = new RegExp(`^\\d{0,16}(?:\\.\\d{0,${decimals}})?$`)
  return <input {...props} type="text" inputMode="decimal"
    pattern={`[0-9]+([.][0-9]{1,${decimals}})?`}
    onChange={(event) => {
      const value = event.target.value
      if (value === '' || draftPattern.test(value)) {
        const normalized = value.replace(/^0+(?=\d)/, '').replace(/^\./, '0.')
        onChange({ target: { value: normalized } })
      }
    }} />
}

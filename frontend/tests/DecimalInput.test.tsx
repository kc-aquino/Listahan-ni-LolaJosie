import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DecimalInput } from '../src/components/atoms/DecimalInput'

test('numeric fields reject letters, signs, exponents, symbols and excess decimals', () => {
  const accepted: string[] = []
  const input = DecimalInput({ value: '', onChange: (event) => accepted.push(event.target.value) })
  for (const value of ['-10', '+1', '1e3', 'abc', '₱12', '1.234', '1..2', '2,000']) {
    input.props.onChange({ target: { value } })
  }
  assert.deepEqual(accepted, [])
  for (const value of ['', '0', '10', '10.25', '.5', '001']) input.props.onChange({ target: { value } })
  assert.deepEqual(accepted, ['', '0', '10', '10.25', '0.5', '1'])
})
test('quantity fields allow three decimal places', () => {
  const accepted: string[] = []
  const input = DecimalInput({ value: '', decimals: 3, onChange: (event) => accepted.push(event.target.value) })
  input.props.onChange({ target: { value: '0.001' } })
  input.props.onChange({ target: { value: '0.0001' } })
  assert.deepEqual(accepted, ['0.001'])
})

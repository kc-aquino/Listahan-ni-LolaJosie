import type { InputHTMLAttributes } from 'react'
import { formatDate } from '../../lib/date'
import { Icon } from './Icon'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & { type?: 'date' | 'month'; value: string }
export function DateInput({ type = 'date', value, className = '', ...props }: Props) {
  return <div className={`relative flex items-center gap-3 ${className} focus-within:outline-2 focus-within:outline-primary focus-within:outline-offset-2`}>
    <span className="min-w-0 flex-1">{formatDate(value, type === 'month') || (type === 'month' ? 'Month, year' : 'Month dd, yyyy')}</span>
    <Icon name="calendar" className="size-5 shrink-0" />
    <input {...props} type={type} value={value} className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      onClick={(event) => { try { event.currentTarget.showPicker() } catch { /* Native picker remains available. */ } }} />
  </div>
}

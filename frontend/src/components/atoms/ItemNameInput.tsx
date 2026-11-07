import { useId, useState } from 'react'

type Item = { itemName: string; unitPrice: string }
type Props = { value: string; items: Item[]; label: string; onChange: (name: string, price?: string) => void }

export function ItemNameInput({ value, items, label, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const id = useId()
  const matches = items.filter((item) => item.itemName.toLowerCase().includes(value.trim().toLowerCase()))
  const [showAll, setShowAll] = useState(false)
  const options = showAll ? items : matches
  const choose = (item: Item) => { onChange(item.itemName, item.unitPrice); setOpen(false); setActive(-1) }
  return <div className="relative" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }}>
    <div className="flex">
      <input className="input input-bordered w-full rounded-r-none" required maxLength={120} autoComplete="off"
        role="combobox" aria-label={label} aria-expanded={open} aria-controls={id} aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        value={value} onFocus={() => { setOpen(true); setShowAll(false) }}
        onChange={(event) => { onChange(event.target.value); setShowAll(false); setOpen(true); setActive(-1) }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); setOpen(false) }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true)
            setActive((current) => options.length ? (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length : -1)
          }
          if (event.key === 'Enter' && open && active >= 0 && options[active]) { event.preventDefault(); choose(options[active]) }
        }} />
      <button type="button" className="btn btn-outline rounded-l-none px-4" aria-label={label} aria-expanded={open}
        aria-controls={id} onClick={() => { setShowAll(true); setOpen(!open); setActive(-1) }}>▾</button>
    </div>
    {open && options.length > 0 && <ul id={id} role="listbox" aria-label={label}
      className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-lg">
      {options.map((item, index) => <li key={item.itemName} id={`${id}-${index}`} role="option" aria-selected={active === index}>
        <button type="button" tabIndex={-1} className={`w-full rounded-lg px-3 py-2 text-left break-words hover:bg-base-200 ${active === index ? 'bg-base-200' : ''}`}
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}>{item.itemName}</button>
      </li>)}
    </ul>}
  </div>
}

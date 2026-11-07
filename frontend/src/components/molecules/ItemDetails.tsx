import { useLanguage } from '../../app/LanguageProvider'

type Item = { itemName: string; quantity: string; unitPrice: string }
export function ItemDetails({ items }: { items: Item[] }) {
  const { translate } = useLanguage()
  return <ul className="grid gap-3">
    {items.map((item, index) => <li key={index} className="rounded-box border border-base-300 p-3">
      <p className="break-words font-semibold">{item.itemName}</p>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-base-content/65">{translate('quantity')}</dt><dd>{item.quantity}</dd></div>
        <div><dt className="text-base-content/65">{translate('unitPrice')}</dt><dd>₱ {item.unitPrice}</dd></div>
      </dl>
    </li>)}
  </ul>
}

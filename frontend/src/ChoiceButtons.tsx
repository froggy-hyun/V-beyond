import type { ReactNode } from 'react'

export function ChoiceButtons<T extends string>({ label, value, choices, visibleChoices, enabledChoices, onSelect, icon }: {
  label: string
  value: string
  choices: Record<T, string>
  visibleChoices?: readonly T[]
  enabledChoices?: readonly T[]
  onSelect: (value: T) => void
  icon: (value: T) => ReactNode
}) {
  return <fieldset className="icon-choices"><legend>{label}</legend>
    <div>{(visibleChoices ?? Object.keys(choices) as T[]).map(key => <button key={key} type="button"
      disabled={enabledChoices != null && !enabledChoices.includes(key)} aria-pressed={value === key}
      onClick={() => onSelect(key)}>{icon(key)}<span>{choices[key]}</span></button>)}</div>
  </fieldset>
}

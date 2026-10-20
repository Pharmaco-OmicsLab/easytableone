import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface ChoiceOption<T extends string> { value: T; label: string; description?: string; tag?: string; note?: ReactNode; }
export function ChoiceGroup<T extends string>({ name, question, hint, value, options, onChange }: {
  name: string; question: string; hint?: string; value: T; options: ChoiceOption<T>[]; onChange: (value: T) => void;
}) {
  const questionId = `${name}-question`;
  const groupRef = useRef<HTMLFieldSetElement>(null);
  const handleKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;
    const currentIndex = options.findIndex((option) => option.value === value);
    const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
    const next = options[(currentIndex + (forward ? 1 : options.length - 1)) % options.length];
    event.preventDefault();
    onChange(next.value);
    groupRef.current?.querySelector<HTMLInputElement>(`input[value="${next.value}"]`)?.focus();
  };
  return <fieldset ref={groupRef} onKeyDown={handleKeyDown} className="space-y-2" role="radiogroup" aria-labelledby={questionId}>
    <legend id={questionId} className="text-sm font-semibold text-gray-900">{question}</legend>
    {hint && <p className="text-xs text-gray-600">{hint}</p>}
    <div className="grid gap-2 sm:grid-cols-2">{options.map((option) => <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 focus-within:ring-2 focus-within:ring-blue-500 ${value === option.value ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
      <input className="sr-only" type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
      <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border ${value === option.value ? "border-blue-600" : "border-gray-400"}`}>{value === option.value && <span className="h-2 w-2 rounded-full bg-blue-600" />}</span>
      <span className="min-w-0"><span className="block text-sm font-semibold text-gray-900">{option.label}</span>{option.tag && <span className="mt-1 inline-block rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">{option.tag}</span>}{option.description && <span className="mt-1 block text-xs text-gray-600">{option.description}</span>}{option.note}</span>
    </label>)}</div>
  </fieldset>;
}

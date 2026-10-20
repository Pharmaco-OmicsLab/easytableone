import { useEffect, useRef, useState } from "react";
export default function HelpMenu({ onTutorial, onFaq, onAbout }: { onTutorial: () => void; onFaq: () => void; onAbout: () => void }) {
  const [open, setOpen] = useState(false); const buttonRef = useRef<HTMLButtonElement>(null); const menuRef = useRef<HTMLDivElement>(null);
  const actions = [onTutorial, onFaq, onAbout];
  useEffect(() => { if (open) menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);
  const keyDown = (event: React.KeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); buttonRef.current?.focus(); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus(); }
    if (event.key === "Home") { event.preventDefault(); items[0]?.focus(); }
    if (event.key === "End") { event.preventDefault(); items.at(-1)?.focus(); }
  };
  return <div className="relative"><button ref={buttonRef} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Help</button>
    {open && <div ref={menuRef} role="menu" onKeyDown={keyDown} className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-gray-200 bg-white p-1 shadow-xl">{["Tutorial", "FAQ", "About & privacy"].map((label, i) => <button id={["global-tutorial-button", "global-faq-button", "global-about-button"][i]} key={label} type="button" role="menuitem" aria-label={i === 0 ? "Open tutorial" : i === 1 ? "Open FAQ" : "About EasyTableOne"} onClick={() => { setOpen(false); actions[i](); }} className="block min-h-9 w-full rounded-lg px-3 text-left text-sm text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{label}</button>)}</div>}
  </div>;
}

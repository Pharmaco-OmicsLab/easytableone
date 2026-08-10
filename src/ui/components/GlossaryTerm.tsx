import { useEffect, useId, useState } from "react";
import { GLOSSARY, type GlossaryTermKey } from "./glossary";

interface GlossaryTermProps {
  term: GlossaryTermKey;
}

export default function GlossaryTerm({ term }: GlossaryTermProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <span className="relative inline-flex">
      <span
        role="button"
        tabIndex={0}
        className="decoration-dotted underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-sm"
        aria-describedby={id}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(event) => {
          event.preventDefault();
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((value) => !value);
          }
        }}
      >
        {term}
      </span>
      <span
        id={id}
        role="tooltip"
        className={`absolute left-0 top-full z-50 mt-2 w-64 rounded border border-gray-200 bg-white p-3 text-left text-xs font-normal leading-relaxed text-gray-700 shadow-lg ${open ? "block" : "sr-only"}`}
      >
        {GLOSSARY[term]}
      </span>
    </span>
  );
}

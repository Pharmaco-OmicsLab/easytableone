import { useCallback, useMemo, useRef, useState } from "react";
import { useStore } from "../../store";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { FAQ_CATEGORIES, FAQ_ITEMS, type FaqCategory, type FaqItem } from "./faqContent";

const summaryClass = "cursor-pointer select-none bg-gray-50 px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-100";
const bodyClass = "space-y-4 px-5 py-4 text-sm text-gray-700";

function groupItems(items: FaqItem[]) {
  return FAQ_CATEGORIES.map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);
}

export default function FaqModal() {
  const { faqOpen, setFaqOpen } = useStore();
  const modalRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<FaqCategory | "All">("All");

  const close = useCallback(() => setFaqOpen(false), [setFaqOpen]);
  useFocusTrap(modalRef, faqOpen, close);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return FAQ_ITEMS.filter((item) => {
      const categoryMatches = activeCategory === "All" || item.category === activeCategory;
      const queryMatches = normalizedQuery === "" || item.search.includes(normalizedQuery);
      return categoryMatches && queryMatches;
    });
  }, [activeCategory, query]);

  const groupedItems = useMemo(() => groupItems(filteredItems), [filteredItems]);

  if (!faqOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="faq-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div ref={modalRef} tabIndex={-1} className="relative mx-4 max-h-[80vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-8 shadow-xl">
        <button
          id="faq-close-button"
          type="button"
          onClick={close}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          aria-label="Close FAQ"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 id="faq-modal-title" className="text-2xl font-bold text-gray-900">
          Frequently asked questions
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          Answers about how EasyTableOne works, your data, the statistics, and troubleshooting. Search or browse by topic.
        </p>

        <div className="mt-6 flex flex-col gap-6 md:flex-row">
          <aside className="w-full flex-shrink-0 md:w-72">
            <label htmlFor="faq-search-input" className="sr-only">
              Search the FAQ
            </label>
            <input
              id="faq-search-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the FAQ..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />

            <nav className="mt-4 space-y-2" aria-label="FAQ categories">
              {(["All", ...FAQ_CATEGORIES] as Array<FaqCategory | "All">).map((category) => {
                const active = activeCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveCategory(category)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${
                      active ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-100"
                    }`}
                    aria-pressed={active}
                  >
                    {category}
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className="min-w-0 flex-1 space-y-6" aria-label="FAQ answers">
            {filteredItems.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 text-sm text-gray-700">
                <p>No questions match your search.</p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setActiveCategory("All");
                  }}
                  className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              groupedItems.map((group) => (
                <section key={group.category} className="space-y-3">
                  {activeCategory === "All" && <h3 className="text-lg font-bold text-gray-900">{group.category}</h3>}
                  {group.items.map((item) => (
                    <article key={item.id} className="rounded-lg border border-gray-200">
                      <div className="space-y-3 px-5 py-4 text-sm text-gray-700">
                        <h4 className="text-base font-bold text-gray-900">{item.question}</h4>
                        {item.short}
                      </div>
                      {item.detail && (
                        <details className="border-t border-gray-200">
                          <summary className={summaryClass}>More detail</summary>
                          <div className={bodyClass}>{item.detail}</div>
                        </details>
                      )}
                    </article>
                  ))}
                </section>
              ))
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

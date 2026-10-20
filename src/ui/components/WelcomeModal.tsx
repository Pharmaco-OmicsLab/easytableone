import { useCallback, useRef } from "react";
import { DIFFERENTIATORS } from "../../core/about/aboutContent";
import { useStore } from "../../store";
import { useFocusTrap } from "../hooks/useFocusTrap";

export const WELCOME_SEEN_KEY = "easytableone:welcome-seen-v1";

export default function WelcomeModal() {
  const { welcomeOpen, setWelcomeOpen, setAboutOpen } = useStore();
  const modalRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setWelcomeOpen(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(WELCOME_SEEN_KEY, "1");
    }
  }, [setWelcomeOpen]);

  useFocusTrap(modalRef, welcomeOpen, close);

  if (!welcomeOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div ref={modalRef} tabIndex={-1} className="relative mx-4 max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-8 shadow-xl">
        <button
          id="welcome-close-button"
          type="button"
          onClick={close}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          aria-label="Close welcome"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 id="welcome-modal-title" className="mb-2 text-2xl font-bold text-gray-900">
          Welcome to EasyTableOne
        </h2>
        <p className="mb-6 text-gray-600">
          EasyTableOne helps researchers turn clinical, metabolomics, animal, and in-vitro datasets into journal-ready Table 1 outputs with transparent statistical choices.
        </p>

        <div className="space-y-3">
          {DIFFERENTIATORS.map((item) => (
            <div key={item.title} className="rounded border border-gray-200 bg-gray-50 p-3">
              <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
              <p className="mt-1 text-sm text-gray-700">{item.detail}</p>
            </div>
          ))}
        </div>

        <p className="mt-5 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
          Look for the "About this step" panel and inline explainers as you go. They explain why each statistical decision is being made, not just what button to press.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            id="welcome-get-started-button"
            data-testid="welcome-get-started"
            type="button"
            onClick={close}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Get started
          </button>
          <button
            id="welcome-learn-more-button"
            type="button"
            onClick={() => {
              close();
              setAboutOpen(true);
            }}
            className="text-sm text-gray-600 underline hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Learn more about us
          </button>
        </div>
      </div>
    </div>
  );
}

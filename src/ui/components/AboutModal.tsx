import { useCallback, useRef } from "react";
import { DIFFERENTIATORS, FEEDBACK_EMAIL, LAB_DESCRIPTION, LAB_GITHUB, LAB_NAME, LAB_TAGLINE, LAB_WEBSITE, PRIVACY_POLICY_TEXT, TEAM, TERMS_OF_SERVICE_TEXT } from "../../core/about/aboutContent";
import { useStore } from "../../store";
import { useFocusTrap } from "../hooks/useFocusTrap";

function paragraphs(text: string) {
  return text.split(/\n\n+/).map((paragraph) => (
    <p key={paragraph} className="mt-2 text-sm text-gray-700">
      {paragraph}
    </p>
  ));
}

export default function AboutModal() {
  const { aboutOpen, setAboutOpen } = useStore();
  const modalRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setAboutOpen(false), [setAboutOpen]);

  useFocusTrap(modalRef, aboutOpen, close);

  if (!aboutOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div ref={modalRef} tabIndex={-1} className="relative mx-4 w-full max-w-3xl rounded-xl bg-white p-8 shadow-xl">
        <button
          id="about-close-button"
          type="button"
          onClick={close}
          className="absolute right-4 top-4 text-gray-400 transition-colors hover:text-gray-700"
          aria-label="Close about EasyTableOne"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 id="about-modal-title" className="text-2xl font-bold text-gray-900">
          About EasyTableOne
        </h2>
        <p className="mt-1 text-sm font-semibold text-blue-700">{LAB_NAME} - {LAB_TAGLINE}</p>
        <p className="mt-4 text-sm text-gray-700">{LAB_DESCRIPTION}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <a href={LAB_WEBSITE} target="_blank" rel="noreferrer" className="font-medium text-blue-700 underline">Lab website</a>
          <a href={LAB_GITHUB} target="_blank" rel="noreferrer" className="font-medium text-blue-700 underline">GitHub</a>
          <a href={`mailto:${FEEDBACK_EMAIL}`} className="font-medium text-blue-700 underline">Contact</a>
        </div>

        <section className="mt-6">
          <h3 className="text-base font-semibold text-gray-900">Team</h3>
          <dl className="mt-2 grid gap-2 sm:grid-cols-3">
            {TEAM.map((member) => (
              <div key={member.role} className="rounded border border-gray-200 bg-gray-50 p-3">
                <dt className="text-xs font-semibold uppercase text-gray-500">{member.role}</dt>
                <dd className="mt-1 text-sm font-medium text-gray-900">{member.name}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-6">
          <h3 className="text-base font-semibold text-gray-900">Why EasyTableOne</h3>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {DIFFERENTIATORS.map((item) => (
              <div key={item.title} className="rounded border border-gray-200 p-3">
                <h4 className="text-sm font-semibold text-gray-900">{item.title}</h4>
                <p className="mt-1 text-sm text-gray-700">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <details className="mt-6 rounded border border-gray-200 bg-gray-50 p-3">
          <summary className="cursor-pointer select-none text-sm font-semibold text-gray-900">Privacy Policy</summary>
          <div className="mt-2">{paragraphs(PRIVACY_POLICY_TEXT)}</div>
        </details>

        <details className="mt-3 rounded border border-gray-200 bg-gray-50 p-3">
          <summary className="cursor-pointer select-none text-sm font-semibold text-gray-900">Terms of Service</summary>
          <div className="mt-2">{paragraphs(TERMS_OF_SERVICE_TEXT)}</div>
        </details>
      </div>
    </div>
  );
}

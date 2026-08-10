import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  reason: string;
  next: string;
  action: {
    label: string;
    onClick: () => void;
  };
  children?: ReactNode;
}

export default function EmptyState({ title, reason, next, action, children }: EmptyStateProps) {
  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="mt-2 text-sm text-gray-600">{reason}</p>
      <p className="mt-3 text-sm font-medium text-gray-900">What to do next: {next}</p>
      {children}
      <button
        type="button"
        onClick={action.onClick}
        className="mt-5 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        {action.label}
      </button>
    </div>
  );
}

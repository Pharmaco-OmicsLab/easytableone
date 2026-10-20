import { createContext, useCallback, useContext, useEffect, useState } from "react";
type ToastContextValue = (message: string) => void;
const ToastContext = createContext<ToastContextValue>(() => {});
export function useToast() { return useContext(ToastContext); }
export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState(""); const [key, setKey] = useState(0);
  const toast = useCallback((value: string) => { setMessage(value); setKey((n) => n + 1); }, []);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(""), 3200); return () => clearTimeout(timer); }, [message, key]);
  return <ToastContext.Provider value={toast}>{children}{message && <div role="status" className="fixed bottom-4 right-4 z-[60] max-w-sm rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-xl">{message}</div>}</ToastContext.Provider>;
}

export default function AppFooter() {
  return <footer className="mt-8 flex flex-nowrap items-center justify-center gap-x-2 overflow-x-auto whitespace-nowrap border-t border-slate-200 py-4 text-center text-sm text-slate-600">
    <a href="https://github.com/Pharmaco-OmicsLab" className="hover:text-slate-900 hover:underline">
      Empowered by Pharmaco-Omics Lab – Omics for Personalized Medicine
    </a>
    <span aria-hidden="true">|</span>
    <a href="mailto:pharmacoomicslab@gmail.com" className="hover:text-slate-900 hover:underline">
      Contact Us
    </a>
  </footer>;
}

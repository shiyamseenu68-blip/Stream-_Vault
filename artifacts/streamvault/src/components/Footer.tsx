import { Link } from 'wouter';

export default function Footer() {
  return (
    <footer className="w-full border-t border-white/10 glassmorphism bg-background/80 py-8 mt-auto">
      <div className="container mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-white/40 text-sm font-medium">© {new Date().getFullYear()} StreamVault. Version 1.0.0</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/about" className="text-sm text-white/40 hover:text-white transition-colors">
            About
          </Link>
          <Link href="/settings" className="text-sm text-white/40 hover:text-white transition-colors">
            Settings
          </Link>
          <a href="#" className="text-sm text-white/40 hover:text-white transition-colors">
            Terms & Privacy
          </a>
        </div>
      </div>
    </footer>
  );
}

import { Link, useLocation } from 'wouter';
import { Play } from 'lucide-react';

export default function Header() {
  const [location] = useLocation();

  const links = [
    { href: '/', label: 'Home' },
    { href: '/history', label: 'History' },
    { href: '/settings', label: 'Settings' },
    { href: '/about', label: 'About' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glassmorphism border-b border-white/10 h-16 bg-background/80">
      <div className="container mx-auto px-4 md:px-8 h-full flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white">
            <Play size={16} fill="currentColor" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white group-hover:text-primary transition-colors">
            StreamVault
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-8">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors ${
                location === link.href ? 'text-primary' : 'text-white/70 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

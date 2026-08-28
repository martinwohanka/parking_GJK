'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { SessionUser } from '@/lib/auth';

const LINKS = [
  { href: '/', label: 'Parkoviště' },
  { href: '/rezervace', label: 'Moje rezervace' },
  { href: '/prestupky', label: 'Špatné parkování' },
  { href: '/profil', label: 'Můj profil' },
];

export function Nav({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = user.role === 'ADMIN' ? [...LINKS, { href: '/admin', label: 'Správa' }] : LINKS;

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' || pathname.startsWith('/misto') : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white"
          >
            P
          </span>
          <span className="hidden sm:inline">Parkoviště GJK</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive(link.href)
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-2">
          <span className="hidden text-sm text-slate-500 lg:inline">{user.name}</span>
          <form action="/api/odhlaseni" method="post">
            <button type="submit" className="btn-secondary btn-sm">
              Odhlásit
            </button>
          </form>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={open}
            className="btn-secondary btn-sm md:hidden"
          >
            ☰
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-slate-200 bg-white px-4 py-2 md:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`block rounded-lg px-3 py-2.5 text-sm font-medium ${
                isActive(link.href) ? 'bg-brand-50 text-brand-700' : 'text-slate-700'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

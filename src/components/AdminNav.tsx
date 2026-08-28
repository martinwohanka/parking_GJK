'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin', label: 'Přehled' },
  { href: '/admin/rezervace', label: 'Rezervace' },
  { href: '/admin/uzivatele', label: 'Uživatelé' },
  { href: '/admin/mista', label: 'Parkovací místa' },
  { href: '/admin/prestupky', label: 'Trestné body' },
  { href: '/admin/nastaveni', label: 'Nastavení' },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-slate-200">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

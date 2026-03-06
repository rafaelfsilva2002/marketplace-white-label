import Link from 'next/link';
import {
  Home,
  Search,
  Grid3X3,
  MessageCircle,
  LayoutDashboard,
  Shield,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AIAssistant } from '@/components/ai/ai-assistant';

const NAV_ITEMS = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/search', label: 'Buscar', icon: Search },
  { href: '/categories', label: 'Categorias', icon: Grid3X3 },
  { href: '/chat', label: 'Chat', icon: MessageCircle },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin', label: 'Admin', icon: Shield },
];

export default function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-white p-4 lg:p-6">
      <div className="mx-auto max-w-[1600px] overflow-hidden rounded-3xl border bg-background shadow-[0_25px_60px_-30px_rgba(15,23,42,0.45)]">
        <div className="flex min-h-[calc(100vh-2rem)]">
          <aside className="hidden w-72 flex-col border-r bg-slate-50/80 p-6 lg:flex">
            <Link href="/" className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
                Marketplace
              </p>
              <h1 className="text-2xl font-semibold leading-tight">
                Workspace
                <span className="block text-muted-foreground">desktop</span>
              </h1>
            </Link>

            <nav className="mt-8 flex flex-col gap-2">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-auto rounded-xl border bg-background p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" />
                Busca IA ativa
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Use linguagem natural para encontrar profissionais com mais
                precisao.
              </p>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="border-b bg-background/90 px-4 py-4 backdrop-blur lg:px-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Marketplace App</h2>
                  <p className="text-sm text-muted-foreground">
                    Plataforma web otimizada para computador
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/login">Entrar</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link href="/register">Cadastrar</Link>
                  </Button>
                </div>
              </div>
            </header>

            <main className="flex-1 overflow-y-auto">{children}</main>

            <footer className="border-t px-4 py-3 text-center text-xs text-muted-foreground lg:px-8">
              Marketplace AI-Native
            </footer>
          </div>
        </div>
      </div>
      <AIAssistant />
    </div>
  );
}

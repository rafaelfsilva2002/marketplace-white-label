import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AIAssistant } from '@/components/ai/ai-assistant';

export default function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between mx-auto px-4">
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-xl font-bold">Marketplace</span>
          </Link>

          <nav className="flex items-center gap-4">
            <Link
              href="/search"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Buscar
            </Link>
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/admin"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Admin
            </Link>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Entrar</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">Cadastrar</Link>
            </Button>
          </nav>
        </div>
      </header>

      {children}

      <footer className="border-t py-8 mt-16">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          Marketplace AI-Native — Busca inteligente de profissionais
        </div>
      </footer>

      <AIAssistant />
    </div>
  );
}

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-4xl font-bold">404</h2>
      <p className="text-muted-foreground">Pagina nao encontrada.</p>
      <Button asChild>
        <Link href="/">Voltar ao inicio</Link>
      </Button>
    </div>
  );
}

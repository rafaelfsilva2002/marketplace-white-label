import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function ProfileNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-2xl font-bold">Perfil nao encontrado</h2>
      <p className="text-muted-foreground max-w-md">
        O perfil que voce esta procurando nao existe ou foi removido.
      </p>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/">Pagina inicial</Link>
        </Button>
      </div>
    </div>
  );
}

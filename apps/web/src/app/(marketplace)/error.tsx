'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function MarketplaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Marketplace error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-2xl font-bold">Erro ao carregar a pagina</h2>
      <p className="text-muted-foreground max-w-md">
        Ocorreu um erro ao carregar o conteudo. Tente novamente ou volte para a
        pagina inicial.
      </p>
      {error.digest && (
        <p className="text-muted-foreground text-xs">
          Codigo do erro: {error.digest}
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={reset} variant="default">
          Tentar novamente
        </Button>
        <Button
          onClick={() => (window.location.href = '/')}
          variant="outline"
        >
          Pagina inicial
        </Button>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function HeroSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (location) params.set('location', location);
    router.push(`/search?${params.toString()}`);
  }

  return (
    <div className="relative rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-8 md:p-12">
      <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
        Encontre o profissional ideal
      </h1>
      <p className="mt-3 text-lg text-muted-foreground md:text-xl">
        Busca inteligente powered by IA — descreva o que voce precisa em linguagem natural
      </p>

      <form onSubmit={handleSearch} className="mt-8 flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Ex: quero alguem pra cortar cabelo estilo coreano..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 h-12 text-base"
          />
        </div>
        <div className="relative md:w-64">
          <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Cidade ou bairro"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="pl-10 h-12 text-base"
          />
        </div>
        <Button type="submit" size="lg" className="h-12 px-8">
          <Search className="mr-2 h-4 w-4" />
          Buscar
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {['Cabeleireiro', 'Personal Trainer', 'Massagista', 'Manicure', 'Fotografo'].map(
          (suggestion) => (
            <button
              key={suggestion}
              onClick={() => {
                setQuery(suggestion);
                router.push(`/search?q=${encodeURIComponent(suggestion)}`);
              }}
              className="rounded-full border bg-background px-3 py-1 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              {suggestion}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

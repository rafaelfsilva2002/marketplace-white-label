'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { api, extractApiData, saveTokens } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const raw = await api<
        { accessToken: string; refreshToken: string } |
        { success: boolean; data: { accessToken: string; refreshToken: string } }
      >('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        noAuth: true,
      });
      const result = extractApiData<{ accessToken: string; refreshToken: string }>(raw);

      saveTokens(result.accessToken, result.refreshToken);

      // Redirect to callbackUrl if present, otherwise home
      const params = new URLSearchParams(window.location.search);
      const callbackUrl = params.get('callbackUrl') || '/';
      router.push(callbackUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Entrar</CardTitle>
          <CardDescription>
            Acesse sua conta no Marketplace
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Senha
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
            <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-primary">
              Esqueci minha senha
            </Link>
            <p className="text-sm text-muted-foreground">
              Nao tem conta?{' '}
              <Link href="/register" className="text-primary hover:underline">
                Cadastre-se
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback, FormEvent } from 'react';
import {
  Loader2,
  Save,
  Lock,
  Trash2,
  AlertTriangle,
  User,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

// ---------------------------------------------------------------------------
// Settings Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  // Profile form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Delete account state
  const [deleteLoading, setDeleteLoading] = useState(false);

  // -------------------------------------------------------------------------
  // Fetch user data
  // -------------------------------------------------------------------------

  const fetchUser = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setProfileLoading(false);
      return;
    }

    try {
      const user = await api<UserProfile>('/auth/me', { token });
      setName(user.name ?? '');
      setEmail(user.email ?? '');
      setPhone(user.phone ?? '');
    } catch (err) {
      setProfileError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar dados do usuario',
      );
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // -------------------------------------------------------------------------
  // Update profile handler
  // -------------------------------------------------------------------------

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfileMessage('');
    setProfileError('');

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    setProfileSaving(true);

    try {
      await api('/auth/me', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ name, email, phone: phone || null }),
      });
      setProfileMessage('Dados atualizados com sucesso!');
    } catch (err) {
      setProfileError(
        err instanceof Error
          ? err.message
          : 'Erro ao atualizar dados',
      );
    } finally {
      setProfileSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Change password handler
  // -------------------------------------------------------------------------

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordMessage('');
    setPasswordError('');

    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas nao coincidem.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    setPasswordSaving(true);

    try {
      await api('/auth/change-password', {
        method: 'POST',
        token,
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      setPasswordMessage('Senha alterada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(
        err instanceof Error
          ? err.message
          : 'Erro ao alterar senha',
      );
    } finally {
      setPasswordSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Delete account handler
  // -------------------------------------------------------------------------

  async function handleDeleteAccount() {
    const confirmed = window.confirm(
      'ATENCAO: Esta acao e irreversivel! Todos os seus dados serao permanentemente removidos. Deseja continuar?',
    );
    if (!confirmed) return;

    const doubleConfirm = window.confirm(
      'Tem certeza absoluta? Digite "sim" para confirmar clicando em OK.',
    );
    if (!doubleConfirm) return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    setDeleteLoading(true);

    try {
      await api('/auth/me', {
        method: 'DELETE',
        token,
      });
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/';
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : 'Erro ao excluir conta. Tente novamente.',
      );
      setDeleteLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Carregando configuracoes...
          </p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuracoes</h1>
        <p className="text-muted-foreground">
          Gerencie suas informacoes pessoais e seguranca
        </p>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Profile form                                                      */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Informacoes Pessoais</CardTitle>
              <CardDescription>
                Atualize seu nome, e-mail e telefone
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <form onSubmit={handleProfileSubmit}>
          <CardContent className="space-y-4">
            {/* Success / Error messages */}
            {profileMessage && (
              <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-700">
                {profileMessage}
              </div>
            )}
            {profileError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {profileError}
              </div>
            )}

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                placeholder="Seu nome completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="(11) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={profileSaving}>
              {profileSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Alteracoes
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* Password change form                                              */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Alterar Senha</CardTitle>
              <CardDescription>
                Atualize sua senha de acesso
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <form onSubmit={handlePasswordSubmit}>
          <CardContent className="space-y-4">
            {/* Success / Error messages */}
            {passwordMessage && (
              <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-700">
                {passwordMessage}
              </div>
            )}
            {passwordError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {passwordError}
              </div>
            )}

            {/* Current password */}
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Senha Atual</Label>
              <Input
                id="currentPassword"
                type="password"
                placeholder="Digite sua senha atual"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>

            {/* New password */}
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nova Senha</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Minimo 8 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            {/* Confirm password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repita a nova senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={passwordSaving}>
              {passwordSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Alterando...
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Alterar Senha
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* Danger zone: delete account                                       */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-destructive/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <CardTitle className="text-lg text-destructive">
                Zona de Perigo
              </CardTitle>
              <CardDescription>
                Acoes irreversiveis na sua conta
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Excluir Conta</p>
                <p className="text-xs text-muted-foreground">
                  Ao excluir sua conta, todos os seus dados, perfil,
                  avaliacoes e historico serao permanentemente removidos. Esta
                  acao nao pode ser desfeita.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="shrink-0"
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir Conta
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

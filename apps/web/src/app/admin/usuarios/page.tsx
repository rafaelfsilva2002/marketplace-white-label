'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ShieldOff,
  UserX,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

/* ---------- Types ---------- */

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isVerified: boolean | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface PaginatedUsers {
  data: User[];
  total: number;
  limit: number;
  offset: number;
}

type RoleValue = 'admin' | 'moderator' | 'professional' | 'user';

/* ---------- Constants ---------- */

const PAGE_SIZE = 20;

const ROLES: { value: RoleValue; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'moderator', label: 'Moderador' },
  { value: 'professional', label: 'Profissional' },
  { value: 'user', label: 'Usuario' },
];

/* ---------- Helpers ---------- */

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

function getRoleBadgeClasses(role: string): string {
  switch (role) {
    case 'admin':
      return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
    case 'moderator':
      return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800';
    case 'professional':
      return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/30 dark:text-gray-300 dark:border-gray-800';
  }
}

function getRoleLabel(role: string): string {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'moderator':
      return 'Moderador';
    case 'professional':
      return 'Profissional';
    case 'user':
      return 'Usuario';
    default:
      return role;
  }
}

/* ---------- Skeleton ---------- */

function TableRowSkeleton() {
  return (
    <tr className="border-b">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
          <div className="space-y-1.5">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 w-44 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <div className="h-8 w-24 animate-pulse rounded bg-muted" />
          <div className="h-8 w-8 animate-pulse rounded bg-muted" />
          <div className="h-8 w-8 animate-pulse rounded bg-muted" />
        </div>
      </td>
    </tr>
  );
}

/* ---------- Error Banner ---------- */

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
      <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
      <p className="flex-1 text-sm text-destructive">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

/* ---------- Toast Notification ---------- */

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg transition-all ${
        type === 'success'
          ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300'
          : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300'
      }`}
    >
      {type === 'success' ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <XCircle className="h-4 w-4" />
      )}
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100">
        &times;
      </button>
    </div>
  );
}

/* ---------- Role Dropdown ---------- */

function RoleDropdown({
  currentRole,
  userId,
  onRoleChange,
  disabled,
}: {
  currentRole: string;
  userId: string;
  onRoleChange: (userId: string, newRole: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1 text-xs"
        onClick={() => setOpen(!open)}
        disabled={disabled}
      >
        {getRoleLabel(currentRole)}
        <ChevronDown className="h-3 w-3" />
      </Button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-md border bg-popover p-1 shadow-md">
            {ROLES.map((r) => (
              <button
                key={r.value}
                className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent ${
                  r.value === currentRole
                    ? 'font-medium text-primary'
                    : 'text-foreground'
                }`}
                onClick={() => {
                  if (r.value !== currentRole) {
                    onRoleChange(userId, r.value);
                  }
                  setOpen(false);
                }}
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    r.value === 'admin'
                      ? 'bg-red-500'
                      : r.value === 'moderator'
                        ? 'bg-orange-500'
                        : r.value === 'professional'
                          ? 'bg-green-500'
                          : 'bg-gray-400'
                  }`}
                />
                {r.label}
                {r.value === currentRole && (
                  <CheckCircle2 className="ml-auto h-3 w-3 text-primary" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Main Page ---------- */

export default function AdminUsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const getToken = useCallback(() => {
    return localStorage.getItem('accessToken') || '';
  }, []);

  const fetchUsers = useCallback(
    async (newOffset: number = 0) => {
      const token = getToken();
      if (!token) return;

      setLoading(true);
      setError('');
      try {
        const data = await api<PaginatedUsers>(
          `/admin/users?limit=${PAGE_SIZE}&offset=${newOffset}`,
          { token },
        );
        setUsers(data.data);
        setTotal(data.total);
        setOffset(newOffset);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Erro ao carregar usuarios',
        );
      } finally {
        setLoading(false);
      }
    },
    [getToken],
  );

  useEffect(() => {
    fetchUsers(0);
  }, [fetchUsers]);

  /* ---------- Filtered users (client-side search) ---------- */

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase().trim();
    return users.filter(
      (u) =>
        (u.name && u.name.toLowerCase().includes(q)) ||
        u.email.toLowerCase().includes(q),
    );
  }, [users, searchQuery]);

  /* ---------- Actions ---------- */

  const handleRoleChange = useCallback(
    async (userId: string, newRole: string) => {
      const token = getToken();
      if (!token) return;

      setActionLoading(userId);
      try {
        const updated = await api<User>(`/admin/users/${userId}/role`, {
          token,
          method: 'PUT',
          body: JSON.stringify({ role: newRole }),
        });
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId ? { ...u, role: updated.role } : u,
          ),
        );
        setToast({
          message: `Papel alterado para ${getRoleLabel(newRole)}`,
          type: 'success',
        });
      } catch (err) {
        setToast({
          message:
            err instanceof Error ? err.message : 'Erro ao alterar papel',
          type: 'error',
        });
      } finally {
        setActionLoading(null);
      }
    },
    [getToken],
  );

  const handleToggleVerified = useCallback(
    async (userId: string, currentlyVerified: boolean) => {
      const token = getToken();
      if (!token) return;

      setActionLoading(userId);
      try {
        await api(`/admin/users/${userId}/verify`, {
          token,
          method: 'PUT',
          body: JSON.stringify({ verified: !currentlyVerified }),
        });
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId ? { ...u, isVerified: !currentlyVerified } : u,
          ),
        );
        setToast({
          message: !currentlyVerified
            ? 'Usuario verificado com sucesso'
            : 'Verificacao removida',
          type: 'success',
        });
      } catch (err) {
        setToast({
          message:
            err instanceof Error
              ? err.message
              : 'Erro ao alterar verificacao',
          type: 'error',
        });
      } finally {
        setActionLoading(null);
      }
    },
    [getToken],
  );

  const handleDeactivate = useCallback(
    async (userId: string, userName: string) => {
      const confirmed = window.confirm(
        `Tem certeza que deseja desativar o usuario "${userName}"? Esta acao nao pode ser desfeita facilmente.`,
      );
      if (!confirmed) return;

      const token = getToken();
      if (!token) return;

      setActionLoading(userId);
      try {
        await api(`/admin/users/${userId}`, {
          token,
          method: 'DELETE',
        });
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? { ...u, deletedAt: new Date().toISOString() }
              : u,
          ),
        );
        setToast({
          message: 'Usuario desativado com sucesso',
          type: 'success',
        });
      } catch (err) {
        setToast({
          message:
            err instanceof Error
              ? err.message
              : 'Erro ao desativar usuario',
          type: 'error',
        });
      } finally {
        setActionLoading(null);
      }
    },
    [getToken],
  );

  /* ---------- Pagination ---------- */

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const goToPage = (page: number) => {
    const newOffset = (page - 1) * PAGE_SIZE;
    fetchUsers(newOffset);
    setSearchQuery('');
  };

  /* ---------- Render ---------- */

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Gerenciar Usuarios
          </h1>
          <p className="text-muted-foreground">
            Visualize, edite e gerencie contas de usuarios da plataforma
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchUsers(offset)}
          disabled={loading}
        >
          <RefreshCw
            className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
          />
          Atualizar
        </Button>
      </div>

      {/* Error */}
      {error && (
        <ErrorBanner message={error} onRetry={() => fetchUsers(offset)} />
      )}

      {/* Content card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg">Usuarios</CardTitle>
              <CardDescription>
                {loading
                  ? 'Carregando...'
                  : `${total} usuario${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`}
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm font-medium text-muted-foreground">
                    <th className="px-4 py-3">Nome / Email</th>
                    <th className="px-4 py-3">Papel</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Criado em</th>
                    <th className="px-4 py-3">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <TableRowSkeleton key={i} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="mb-3 h-12 w-12 text-muted-foreground/40" />
              <p className="text-lg font-medium text-muted-foreground">
                {searchQuery
                  ? 'Nenhum usuario encontrado para esta busca'
                  : 'Nenhum usuario cadastrado'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground/70">
                {searchQuery
                  ? 'Tente um termo diferente ou limpe a busca'
                  : 'Os usuarios aparecerao aqui quando se cadastrarem'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm font-medium text-muted-foreground">
                    <th className="px-4 py-3">Nome / Email</th>
                    <th className="px-4 py-3">Papel</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Criado em</th>
                    <th className="px-4 py-3">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const isDeactivated = !!user.deletedAt;
                    const isLoading = actionLoading === user.id;

                    return (
                      <tr
                        key={user.id}
                        className={`border-b transition-colors hover:bg-muted/50 ${
                          isDeactivated ? 'opacity-50' : ''
                        }`}
                      >
                        {/* Name / Email */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold uppercase text-muted-foreground">
                              {(user.name || user.email).charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {user.name || '(Sem nome)'}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Role badge */}
                        <td className="px-4 py-3">
                          <Badge
                            className={`border ${getRoleBadgeClasses(user.role)}`}
                          >
                            {getRoleLabel(user.role)}
                          </Badge>
                        </td>

                        {/* Verified status */}
                        <td className="px-4 py-3">
                          {isDeactivated ? (
                            <Badge className="border border-red-200 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
                              Desativado
                            </Badge>
                          ) : user.isVerified ? (
                            <Badge className="border border-green-200 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300">
                              <ShieldCheck className="mr-1 h-3 w-3" />
                              Verificado
                            </Badge>
                          ) : (
                            <Badge className="border border-yellow-200 bg-yellow-100 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                              Nao verificado
                            </Badge>
                          )}
                        </td>

                        {/* Created at */}
                        <td className="px-4 py-3">
                          <span className="text-sm text-muted-foreground">
                            {formatDate(user.createdAt)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : isDeactivated ? (
                              <span className="text-xs text-muted-foreground">
                                Conta desativada
                              </span>
                            ) : (
                              <>
                                {/* Role change dropdown */}
                                <RoleDropdown
                                  currentRole={user.role}
                                  userId={user.id}
                                  onRoleChange={handleRoleChange}
                                  disabled={isLoading}
                                />

                                {/* Toggle verified */}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  title={
                                    user.isVerified
                                      ? 'Remover verificacao'
                                      : 'Verificar usuario'
                                  }
                                  onClick={() =>
                                    handleToggleVerified(
                                      user.id,
                                      !!user.isVerified,
                                    )
                                  }
                                  disabled={isLoading}
                                >
                                  {user.isVerified ? (
                                    <ShieldOff className="h-4 w-4 text-orange-500" />
                                  ) : (
                                    <ShieldCheck className="h-4 w-4 text-green-500" />
                                  )}
                                </Button>

                                {/* Deactivate */}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  title="Desativar usuario"
                                  onClick={() =>
                                    handleDeactivate(
                                      user.id,
                                      user.name || user.email,
                                    )
                                  }
                                  disabled={isLoading}
                                >
                                  <UserX className="h-4 w-4 text-red-500" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <p className="text-sm text-muted-foreground">
                Mostrando {offset + 1} a{' '}
                {Math.min(offset + PAGE_SIZE, total)} de {total} usuarios
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Pagina {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                >
                  Proxima
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

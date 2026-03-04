'use client';

import { useState, useEffect, useRef, useCallback, type ChangeEvent, type FormEvent } from 'react';
import { User, Camera, X, Plus, Save, Loader2, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PriceRange {
  min: number;
  max: number;
}

interface Profile {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  description: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  services: string[];
  priceRange: PriceRange | null;
  photos: string[];
  isVerified: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProfileFormData {
  displayName: string;
  bio: string;
  description: string;
  city: string;
  state: string;
  services: string[];
  priceRange: PriceRange;
}

interface Toast {
  id: number;
  type: 'success' | 'error';
  message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

// ---------------------------------------------------------------------------
// Toast Notifications Component
// ---------------------------------------------------------------------------

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg transition-all animate-in slide-in-from-bottom-2',
            toast.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
          )}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span className="text-sm">{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="ml-2 shrink-0 rounded-sm opacity-70 hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [serviceInput, setServiceInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastIdRef = useRef(0);

  const [form, setForm] = useState<ProfileFormData>({
    displayName: '',
    bio: '',
    description: '',
    city: '',
    state: '',
    services: [],
    priceRange: { min: 0, max: 0 },
  });

  // -------------------------------------------------------------------------
  // Toast helpers
  // -------------------------------------------------------------------------

  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // -------------------------------------------------------------------------
  // Load profile
  // -------------------------------------------------------------------------

  useEffect(() => {
    async function fetchProfile() {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const data = await api<Profile>('/profiles/me', { token });
        setProfile(data);
        setForm({
          displayName: data.displayName || '',
          bio: data.bio || '',
          description: data.description || '',
          city: data.city || '',
          state: data.state || '',
          services: data.services || [],
          priceRange: data.priceRange || { min: 0, max: 0 },
        });
      } catch {
        addToast('error', 'Erro ao carregar perfil. Verifique sua conexao.');
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [addToast]);

  // -------------------------------------------------------------------------
  // Form field helpers
  // -------------------------------------------------------------------------

  function updateField<K extends keyof ProfileFormData>(field: K, value: ProfileFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    updateField(name as keyof ProfileFormData, value as never);
  }

  function handlePriceChange(field: 'min' | 'max', value: string) {
    const numValue = parseFloat(value) || 0;
    setForm((prev) => ({
      ...prev,
      priceRange: { ...prev.priceRange, [field]: numValue },
    }));
  }

  // -------------------------------------------------------------------------
  // Services management
  // -------------------------------------------------------------------------

  function addService() {
    const trimmed = serviceInput.trim();
    if (!trimmed) return;
    if (form.services.includes(trimmed)) {
      addToast('error', 'Este servico ja foi adicionado.');
      return;
    }
    updateField('services', [...form.services, trimmed]);
    setServiceInput('');
  }

  function removeService(index: number) {
    updateField('services', form.services.filter((_, i) => i !== index));
  }

  function handleServiceKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addService();
    }
  }

  // -------------------------------------------------------------------------
  // Photo upload
  // -------------------------------------------------------------------------

  async function handlePhotoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const token = localStorage.getItem('token');
    if (!token || !profile) return;

    const maxSizeMB = 10;
    if (file.size > maxSizeMB * 1024 * 1024) {
      addToast('error', `Arquivo muito grande. Maximo: ${maxSizeMB}MB.`);
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      addToast('error', 'Formato invalido. Use JPEG, PNG ou WebP.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_URL}/profiles/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Falha no upload');
      }

      const result = await response.json();
      const photoUrl: string = result.url || result.path || result.photoUrl;

      if (photoUrl) {
        setProfile((prev) =>
          prev ? { ...prev, photos: [...prev.photos, photoUrl] } : prev,
        );
        addToast('success', 'Foto enviada com sucesso!');
      }
    } catch {
      addToast('error', 'Erro ao enviar foto. Tente novamente.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function removePhoto(index: number) {
    setProfile((prev) =>
      prev ? { ...prev, photos: prev.photos.filter((_, i) => i !== index) } : prev,
    );
  }

  // -------------------------------------------------------------------------
  // Save profile
  // -------------------------------------------------------------------------

  async function handleSave(e: FormEvent) {
    e.preventDefault();

    if (!form.displayName.trim()) {
      addToast('error', 'Nome de exibicao e obrigatorio.');
      return;
    }

    if (form.displayName.trim().length < 2) {
      addToast('error', 'Nome de exibicao deve ter pelo menos 2 caracteres.');
      return;
    }

    const token = localStorage.getItem('token');
    if (!token || !profile) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        displayName: form.displayName.trim(),
        bio: form.bio.trim() || null,
        description: form.description.trim() || null,
        city: form.city.trim() || null,
        state: form.state || null,
        services: form.services,
        photos: profile.photos,
      };

      if (form.priceRange.min > 0 || form.priceRange.max > 0) {
        payload.priceRange = {
          min: form.priceRange.min,
          max: form.priceRange.max,
        };
      } else {
        payload.priceRange = null;
      }

      const updated = await api<Profile>(`/profiles/${profile.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(payload),
      });

      setProfile(updated);
      addToast('success', 'Perfil atualizado com sucesso!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar perfil.';
      addToast('error', message);
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Carregando perfil...</p>
          </div>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------------------
  // No profile / not logged in
  // -------------------------------------------------------------------------

  if (!profile) {
    return (
      <main className="container mx-auto px-4 py-8">
        <Card className="max-w-md mx-auto">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <User className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground text-center">
              Nenhum perfil encontrado. Faca login ou crie um perfil profissional.
            </p>
            <Button asChild>
              <Link href="/login">Fazer Login</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <main className="container mx-auto px-4 py-8">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Editar Perfil</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie suas informacoes profissionais
          </p>
        </div>
        {profile.isVerified && (
          <Badge className="ml-auto">Verificado</Badge>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
        {/* Photos Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Fotos</CardTitle>
            <CardDescription>
              Adicione fotos ao seu perfil profissional. Formatos: JPEG, PNG, WebP.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {profile.photos.map((photo, index) => (
                <div key={`${photo}-${index}`} className="relative group aspect-square">
                  <img
                    src={photo.startsWith('http') ? photo : `${API_URL}${photo}`}
                    alt={`Foto ${index + 1}`}
                    className="h-full w-full rounded-lg object-cover border"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="absolute top-1 right-1 rounded-full bg-destructive p-1 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remover foto"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}

              {/* Upload Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={cn(
                  'aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors',
                  uploading && 'opacity-50 cursor-not-allowed',
                )}
              >
                {uploading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Camera className="h-6 w-6" />
                )}
                <span className="text-xs">
                  {uploading ? 'Enviando...' : 'Adicionar'}
                </span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>
          </CardContent>
        </Card>

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Informacoes Basicas</CardTitle>
            <CardDescription>
              Dados que aparecerao no seu perfil publico.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Display Name */}
            <div className="space-y-2">
              <label htmlFor="displayName" className="text-sm font-medium">
                Nome de Exibicao <span className="text-destructive">*</span>
              </label>
              <Input
                id="displayName"
                name="displayName"
                value={form.displayName}
                onChange={handleInputChange}
                placeholder="Seu nome profissional"
                maxLength={100}
                required
              />
              <p className="text-xs text-muted-foreground">
                {form.displayName.length}/100 caracteres
              </p>
            </div>

            {/* Bio */}
            <div className="space-y-2">
              <label htmlFor="bio" className="text-sm font-medium">
                Bio
              </label>
              <textarea
                id="bio"
                name="bio"
                value={form.bio}
                onChange={handleInputChange}
                placeholder="Uma breve descricao sobre voce"
                maxLength={500}
                rows={3}
                className={cn(
                  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[80px]',
                )}
              />
              <p className="text-xs text-muted-foreground">
                {form.bio.length}/500 caracteres
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Descricao Detalhada
              </label>
              <textarea
                id="description"
                name="description"
                value={form.description}
                onChange={handleInputChange}
                placeholder="Descreva sua experiencia, especialidades e o que te diferencia"
                maxLength={5000}
                rows={6}
                className={cn(
                  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[120px]',
                )}
              />
              <p className="text-xs text-muted-foreground">
                {form.description.length}/5000 caracteres
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Localizacao</CardTitle>
            <CardDescription>
              Onde voce atua profissionalmente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="city" className="text-sm font-medium">
                  Cidade
                </label>
                <Input
                  id="city"
                  name="city"
                  value={form.city}
                  onChange={handleInputChange}
                  placeholder="Ex: Sao Paulo"
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="state" className="text-sm font-medium">
                  Estado
                </label>
                <select
                  id="state"
                  name="state"
                  value={form.state}
                  onChange={handleInputChange}
                  className={cn(
                    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  <option value="">Selecione...</option>
                  {BRAZILIAN_STATES.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Services */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Servicos</CardTitle>
            <CardDescription>
              Liste os servicos que voce oferece. Pressione Enter ou clique em Adicionar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={serviceInput}
                onChange={(e) => setServiceInput(e.target.value)}
                onKeyDown={handleServiceKeyDown}
                placeholder="Ex: Consultoria, Massagem, Personal Trainer"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={addService}
                disabled={!serviceInput.trim()}
              >
                <Plus className="h-4 w-4 mr-1" />
                Adicionar
              </Button>
            </div>

            {form.services.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.services.map((service, index) => (
                  <Badge
                    key={`${service}-${index}`}
                    variant="secondary"
                    className="flex items-center gap-1 py-1 px-3"
                  >
                    {service}
                    <button
                      type="button"
                      onClick={() => removeService(index)}
                      className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {form.services.length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                Nenhum servico adicionado ainda.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Price Range */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Faixa de Preco</CardTitle>
            <CardDescription>
              Defina a faixa de preco dos seus servicos em reais (R$).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="priceMin" className="text-sm font-medium">
                  Preco Minimo (R$)
                </label>
                <Input
                  id="priceMin"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.priceRange.min || ''}
                  onChange={(e) => handlePriceChange('min', e.target.value)}
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="priceMax" className="text-sm font-medium">
                  Preco Maximo (R$)
                </label>
                <Input
                  id="priceMax"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.priceRange.max || ''}
                  onChange={(e) => handlePriceChange('max', e.target.value)}
                  placeholder="0,00"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Actions */}
        <div className="flex items-center justify-between gap-4 pb-8">
          <Button variant="outline" type="button" asChild>
            <Link href="/dashboard">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={saving} className="min-w-[140px]">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Salvar Perfil
              </>
            )}
          </Button>
        </div>
      </form>
    </main>
  );
}

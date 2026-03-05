import { notFound } from 'next/navigation';
import Image from 'next/image';
import { MapPin, Star, Shield, Clock, MessageCircle, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RecommendationsSection } from '@/components/profiles/recommendations-section';
import { api } from '@/lib/api';
import { getOptimizedProfilePhoto } from '@/lib/cdn';

interface Profile {
  id: string;
  displayName: string;
  bio?: string;
  description?: string;
  city?: string;
  state?: string;
  services: string[];
  photos?: string[];
  isVerified: boolean;
  isActive: boolean;
  viewsCount: number;
  averageRating: number;
  reviewCount: number;
  createdAt: string;
}

interface Review {
  id: string;
  rating: number;
  comment: string;
  userName: string;
  sentimentLabel?: string;
  createdAt: string;
}

interface PaginatedReviews {
  data: Review[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface PageProps {
  params: { id: string };
}

// Server Component
export default async function ProfilePage({ params }: PageProps) {
  let profile: Profile;
  try {
    profile = await api<Profile>(`/profiles/${params.id}`);
  } catch {
    notFound();
  }

  const { data: reviews } = await api<PaginatedReviews>(
    `/reviews/profile/${params.id}?limit=5`,
  );

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold">{profile.displayName}</h1>
                <div className="mt-2 flex items-center gap-4">
                  {profile.isVerified && (
                    <Badge className="gap-1">
                      <Shield className="h-3 w-3" />
                      Verificado
                    </Badge>
                  )}
                  <span className="flex items-center text-sm text-muted-foreground">
                    <MapPin className="mr-1 h-4 w-4" />
                    {profile.city}, {profile.state}
                  </span>
                  <span className="flex items-center text-sm text-muted-foreground">
                    <Clock className="mr-1 h-4 w-4" />
                    Membro desde {new Date(profile.createdAt).getFullYear()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                <span className="text-lg font-semibold">{profile.averageRating}</span>
                <span className="text-sm text-muted-foreground">
                  ({profile.reviewCount} avaliacoes)
                </span>
              </div>
            </div>
          </div>

          {/* Photos */}
          {profile.photos && profile.photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Fotos ({profile.photos.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {profile.photos.map((photo, index) => (
                    <div key={index} className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
                      <Image
                        src={getOptimizedProfilePhoto(photo, index === 0 ? 'full' : 'card')}
                        alt={`${profile.displayName} - foto ${index + 1}`}
                        fill
                        sizes="(max-width: 640px) 50vw, 33vw"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bio */}
          <Card>
            <CardHeader>
              <CardTitle>Sobre</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{profile.description}</p>
            </CardContent>
          </Card>

          {/* Services */}
          <Card>
            <CardHeader>
              <CardTitle>Servicos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {profile.services.map((service) => (
                  <Badge key={service} variant="secondary" className="text-sm">
                    {service}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Reviews */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Avaliacoes ({profile.reviewCount})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {reviews.length > 0 ? (
                reviews.map((review) => (
                  <div key={review.id} className="border-b pb-4 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{review.userName}</span>
                        <div className="flex">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-4 w-4 ${
                                i < review.rating
                                  ? 'fill-yellow-400 text-yellow-400'
                                  : 'text-muted'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {new Date(review.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {review.comment}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  Nenhuma avaliacao ainda.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <Button className="w-full" size="lg">
                Contratar
              </Button>
              <Button variant="outline" className="w-full" size="lg">
                Enviar Mensagem
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {profile.viewsCount.toLocaleString()} visualizacoes
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <RecommendationsSection
        profileId={params.id}
        title="Profissionais Similares"
      />
    </main>
  );
}

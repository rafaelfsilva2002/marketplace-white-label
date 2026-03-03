import { MapPin, Star, Shield, Clock, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RecommendationsSection } from '@/components/profiles/recommendations-section';

interface PageProps {
  params: { id: string };
}

// Server Component
export default async function ProfilePage({ params }: PageProps) {
  // TODO: Replace with actual API call
  // const profile = await api(`/profiles/${params.id}`);
  const profile = {
    id: params.id,
    displayName: 'Maria Silva',
    bio: 'Cabeleireira profissional com 10 anos de experiencia em cortes modernos e coloracao.',
    description:
      'Especializada em cortes femininos, coloracao e tratamentos capilares. Atendo em domicilio e em salao proprio. Formada pela escola XYZ com certificacoes internacionais.',
    city: 'Sao Paulo',
    state: 'SP',
    services: ['Corte feminino', 'Coloracao', 'Escova progressiva', 'Tratamento capilar', 'Penteados'],
    isVerified: true,
    isActive: true,
    viewsCount: 1432,
    averageRating: 4.8,
    reviewCount: 127,
    createdAt: '2024-06-15',
  };

  const reviews = [
    {
      id: '1',
      rating: 5,
      comment: 'Excelente profissional! Meu cabelo ficou incrivel.',
      userName: 'Ana P.',
      sentimentLabel: 'positive',
      createdAt: '2024-12-10',
    },
    {
      id: '2',
      rating: 4,
      comment: 'Muito bom atendimento, recomendo.',
      userName: 'Carlos M.',
      sentimentLabel: 'positive',
      createdAt: '2024-12-05',
    },
  ];

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
              {reviews.map((review) => (
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
              ))}
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

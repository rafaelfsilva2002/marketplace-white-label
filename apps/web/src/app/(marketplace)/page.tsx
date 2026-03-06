import Link from 'next/link';
import { HeroSearch } from '@/components/search/hero-search';
import { ProfileCard } from '@/components/profiles/profile-card';
import { RecommendationsSection } from '@/components/profiles/recommendations-section';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';

interface Profile {
  id: string;
  displayName: string;
  bio?: string;
  city?: string;
  state?: string;
  services?: string[];
  photos?: string[];
  isVerified?: boolean;
  averageRating?: number;
  reviewCount?: number;
}

interface PaginatedProfiles {
  data: Profile[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  children: { id: string; name: string; slug: string }[];
}

// Server Component — fetches data at request time
export default async function HomePage() {
  let featuredProfiles: Profile[] = [];
  try {
    const response = await api<PaginatedProfiles>('/profiles?limit=6');
    featuredProfiles = response.data ?? [];
  } catch {
    // fallback to empty
  }

  let categoriesList: CategorySummary[] = [];
  try {
    categoriesList = await api<CategorySummary[]>('/categories');
  } catch {
    // categories not available yet
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <HeroSearch />

      {/* Categories Section */}
      {categoriesList.length > 0 && (
        <section className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Categorias</h2>
            <Link
              href="/categories"
              className="text-sm text-primary hover:underline"
            >
              Ver todas
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {categoriesList.slice(0, 8).map((cat) => (
              <Link key={cat.id} href={`/categories/${cat.slug}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="p-4 text-center">
                    <h3 className="font-semibold">{cat.name}</h3>
                    {cat.children.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {cat.children.length} subcategorias
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-2xl font-bold mb-6">Profissionais em Destaque</h2>
        {featuredProfiles.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredProfiles.map((profile) => (
              <ProfileCard key={profile.id} profile={profile} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">
            Nenhum profissional encontrado no momento.
          </p>
        )}
      </section>

      <RecommendationsSection title="Recomendados para Voce" />
    </main>
  );
}

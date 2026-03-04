import { HeroSearch } from '@/components/search/hero-search';
import { ProfileCard } from '@/components/profiles/profile-card';
import { RecommendationsSection } from '@/components/profiles/recommendations-section';
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

// Server Component — fetches data at request time
export default async function HomePage() {
  const { data: featuredProfiles } = await api<PaginatedProfiles>(
    '/profiles?limit=6',
  );

  return (
    <main className="container mx-auto px-4 py-8">
      <HeroSearch />

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

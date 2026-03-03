import { HeroSearch } from '@/components/search/hero-search';
import { ProfileCard } from '@/components/profiles/profile-card';

// Server Component — fetches data at request time
export default async function HomePage() {
  // TODO: Replace with actual API call when backend is ready
  const featuredProfiles = [
    {
      id: '1',
      displayName: 'Maria Silva',
      bio: 'Cabeleireira profissional com 10 anos de experiencia',
      city: 'Sao Paulo',
      state: 'SP',
      services: ['Corte feminino', 'Coloracao', 'Escova progressiva'],
      isVerified: true,
      averageRating: 4.8,
      reviewCount: 127,
    },
    {
      id: '2',
      displayName: 'Carlos Santos',
      bio: 'Personal Trainer certificado CREF',
      city: 'Rio de Janeiro',
      state: 'RJ',
      services: ['Musculacao', 'Funcional', 'Emagrecimento'],
      isVerified: true,
      averageRating: 4.9,
      reviewCount: 89,
    },
    {
      id: '3',
      displayName: 'Ana Oliveira',
      bio: 'Massoterapeuta e terapeuta holistica',
      city: 'Belo Horizonte',
      state: 'MG',
      services: ['Massagem relaxante', 'Drenagem', 'Reflexologia'],
      isVerified: false,
      averageRating: 4.7,
      reviewCount: 54,
    },
  ];

  return (
    <main className="container mx-auto px-4 py-8">
      <HeroSearch />

      <section className="mt-12">
        <h2 className="text-2xl font-bold mb-6">Profissionais em Destaque</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featuredProfiles.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} />
          ))}
        </div>
      </section>
    </main>
  );
}

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ProfileCard } from '@/components/profiles/profile-card';
import { api } from '@/lib/api';

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  profilesCount: number;
  children: {
    id: string;
    name: string;
    slug: string;
    description?: string;
  }[];
}

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

interface CategoryProfilesResult {
  data: Profile[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  category: Category;
}

interface PageProps {
  params: { slug: string };
  searchParams: { page?: string };
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const page = Number(searchParams.page) || 1;

  let result: CategoryProfilesResult;
  try {
    result = await api<CategoryProfilesResult>(
      `/categories/${params.slug}/profiles?page=${page}&limit=12`,
    );
  } catch {
    notFound();
  }

  const { data: profiles, total, totalPages, category } = result;

  return (
    <main className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/categories" className="hover:text-foreground transition-colors">
          Categorias
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium">{category.name}</span>
      </nav>

      {/* Category Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{category.name}</h1>
        {category.description && (
          <p className="mt-2 text-muted-foreground">{category.description}</p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          {total} {total === 1 ? 'profissional' : 'profissionais'}
        </p>
      </div>

      {/* Subcategories */}
      {category.children.length > 0 && (
        <div className="mb-8 flex flex-wrap gap-2">
          {category.children.map((sub) => (
            <Link key={sub.id} href={`/categories/${sub.slug}`}>
              <Badge
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80 text-sm px-3 py-1"
              >
                {sub.name}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {/* Profiles Grid */}
      {profiles.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-center py-12">
          Nenhum profissional encontrado nesta categoria.
        </p>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/categories/${params.slug}?page=${page - 1}`}
              className="rounded-md border px-4 py-2 text-sm hover:bg-accent transition-colors"
            >
              Anterior
            </Link>
          )}
          <span className="flex items-center px-4 py-2 text-sm text-muted-foreground">
            Pagina {page} de {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/categories/${params.slug}?page=${page + 1}`}
              className="rounded-md border px-4 py-2 text-sm hover:bg-accent transition-colors"
            >
              Proxima
            </Link>
          )}
        </div>
      )}
    </main>
  );
}

import Link from 'next/link';
import {
  Scissors,
  Heart,
  GraduationCap,
  Monitor,
  Briefcase,
  Dumbbell,
  Palette,
  Wrench,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  sortOrder: number;
  children: {
    id: string;
    name: string;
    slug: string;
    description?: string;
  }[];
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Scissors,
  Heart,
  GraduationCap,
  Monitor,
  Briefcase,
  Dumbbell,
  Palette,
  Wrench,
};

function CategoryIcon({
  iconName,
  className,
}: {
  iconName?: string;
  className?: string;
}) {
  const Icon = iconName ? iconMap[iconName] : null;
  if (!Icon) {
    return <div className={className} />;
  }
  return <Icon className={className} />;
}

export default async function CategoriesPage() {
  let categories: Category[] = [];
  try {
    categories = await api<Category[]>('/categories');
  } catch {
    // fallback to empty
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Categorias</h1>
        <p className="mt-2 text-muted-foreground">
          Encontre profissionais por area de atuacao
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {categories.map((category) => (
          <Link key={category.id} href={`/categories/${category.slug}`}>
            <Card className="h-full transition-shadow hover:shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CategoryIcon
                      iconName={category.icon ?? undefined}
                      className="h-6 w-6"
                    />
                  </div>
                  <h2 className="text-lg font-semibold">{category.name}</h2>
                </div>

                {category.description && (
                  <p className="text-sm text-muted-foreground mb-4">
                    {category.description}
                  </p>
                )}

                {category.children.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {category.children.slice(0, 3).map((sub) => (
                      <Badge key={sub.id} variant="outline" className="text-xs">
                        {sub.name}
                      </Badge>
                    ))}
                    {category.children.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{category.children.length - 3}
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {categories.length === 0 && (
        <p className="text-muted-foreground text-center py-12">
          Nenhuma categoria disponivel no momento.
        </p>
      )}
    </main>
  );
}

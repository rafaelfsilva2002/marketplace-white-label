import Link from 'next/link';
import { MapPin, Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ProfileCardProps {
  profile: {
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
  };
}

export function ProfileCard({ profile }: ProfileCardProps) {
  return (
    <Link href={`/profiles/${profile.id}`}>
      <Card className="overflow-hidden transition-shadow hover:shadow-lg">
        <div className="aspect-[4/3] bg-muted">
          {profile.photos?.[0] ? (
            <img
              src={profile.photos[0]}
              alt={profile.displayName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-4xl font-bold text-muted-foreground/30">
              {profile.displayName.charAt(0)}
            </div>
          )}
        </div>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold">
                {profile.displayName}
                {profile.isVerified && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Verificado
                  </Badge>
                )}
              </h3>
              {(profile.city || profile.state) && (
                <p className="mt-1 flex items-center text-sm text-muted-foreground">
                  <MapPin className="mr-1 h-3 w-3" />
                  {[profile.city, profile.state].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
            {profile.averageRating && (
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-medium">
                  {profile.averageRating.toFixed(1)}
                </span>
                {profile.reviewCount && (
                  <span className="text-xs text-muted-foreground">
                    ({profile.reviewCount})
                  </span>
                )}
              </div>
            )}
          </div>
          {profile.bio && (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
              {profile.bio}
            </p>
          )}
          {profile.services && profile.services.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {profile.services.slice(0, 3).map((service) => (
                <Badge key={service} variant="outline" className="text-xs">
                  {service}
                </Badge>
              ))}
              {profile.services.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{profile.services.length - 3}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

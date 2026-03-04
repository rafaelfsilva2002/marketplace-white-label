'use client';

import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { ProfileCard } from './profile-card';

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

interface RecommendationsSectionProps {
  profileId?: string;
  title?: string;
}

export function RecommendationsSection({ profileId, title }: RecommendationsSectionProps) {
  const [recommendations, setRecommendations] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRecommendations() {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
        const url = profileId
          ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'}/recommendations/similar/${profileId}`
          : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'}/recommendations/for-you`;

        const response = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (response.ok) {
          const data = await response.json();
          setRecommendations(data.results || data || []);
        }
      } catch {
        // Silently fail — recommendations are not critical
      } finally {
        setLoading(false);
      }
    }

    fetchRecommendations();
  }, [profileId]);

  if (loading) {
    return (
      <section className="mt-12">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          {title || 'Recomendados para Voce'}
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-64 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (recommendations.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-purple-500" />
        {title || 'Recomendados para Voce'}
      </h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {recommendations.map((profile) => (
          <ProfileCard key={profile.id} profile={profile} />
        ))}
      </div>
    </section>
  );
}

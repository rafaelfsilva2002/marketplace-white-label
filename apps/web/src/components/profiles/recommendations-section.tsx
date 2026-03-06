'use client';

import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { ProfileCard } from './profile-card';
import { api, extractApiData, getAccessToken } from '@/lib/api';

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

interface RecommendationResult {
  profile: Profile;
  score?: number;
  similarity?: number;
  reason?: string;
}

interface RecommendationResponse {
  results: RecommendationResult[];
  meta?: {
    count: number;
    limit: number;
  };
}

export function RecommendationsSection({ profileId, title }: RecommendationsSectionProps) {
  const [recommendations, setRecommendations] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!profileId && !token) {
      setLoading(false);
      setRecommendations([]);
      return;
    }

    async function fetchRecommendations() {
      try {
        const path = profileId
          ? `/recommendations/similar/${profileId}`
          : '/recommendations/for-you';

        const raw = await api<
          RecommendationResponse | { success: boolean; data: RecommendationResponse }
        >(path, { noAuth: !token });

        const data = extractApiData<RecommendationResponse>(raw);
        const profiles = data.results
          .map((item) => item.profile)
          .filter(Boolean);
        setRecommendations(profiles);
      } catch {
        // Silently fail — recommendations are not critical
        setRecommendations([]);
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
          <Sparkles className="h-5 w-5 text-primary" />
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
        <Sparkles className="h-5 w-5 text-primary" />
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

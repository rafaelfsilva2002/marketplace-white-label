import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { hash } from 'bcryptjs';
import * as schema from '../schema';
import type { Database } from '../index';

const { users, profiles, reviews, subscriptions } = schema;

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = 'password123';

export async function seed(db: Database) {
  console.log('Seeding database...');

  // --- 1. Users ---
  const passwordHash = await hash(DEFAULT_PASSWORD, SALT_ROUNDS);

  const [admin, moderator, joao, maria, carlos] = await db
    .insert(users)
    .values([
      {
        email: 'admin@marketplace.com',
        passwordHash,
        role: 'admin',
        name: 'Admin',
        isVerified: true,
        verifiedAt: new Date(),
      },
      {
        email: 'mod@marketplace.com',
        passwordHash,
        role: 'moderator',
        name: 'Moderador',
        isVerified: true,
        verifiedAt: new Date(),
      },
      {
        email: 'joao@example.com',
        passwordHash,
        role: 'professional',
        name: 'Joao Silva',
        phone: '+5511999990001',
        documentNumber: '12345678901',
        isVerified: true,
        verifiedAt: new Date(),
      },
      {
        email: 'maria@example.com',
        passwordHash,
        role: 'professional',
        name: 'Maria Oliveira',
        phone: '+5521999990002',
        documentNumber: '98765432100',
        isVerified: true,
        verifiedAt: new Date(),
      },
      {
        email: 'carlos@example.com',
        passwordHash,
        role: 'user',
        name: 'Carlos Santos',
        phone: '+5531999990003',
        isVerified: false,
      },
    ])
    .returning();

  console.log(`  Inserted ${5} users`);

  // --- 2. Profiles ---
  const [profileJoao, profileMaria] = await db
    .insert(profiles)
    .values([
      {
        userId: joao.id,
        displayName: 'Cabeleireiro Premium',
        bio: 'Cabeleireiro profissional com mais de 10 anos de experiencia em cortes modernos, coloracao e tratamentos capilares. Atendo em domicilio e em salao proprio na zona sul de Sao Paulo.',
        services: ['corte', 'escova', 'coloracao'],
        city: 'Sao Paulo',
        state: 'SP',
        country: 'BR',
        priceRange: { min: 50, max: 300 },
        isVerified: true,
        isActive: true,
        verifiedBy: moderator.id,
        verifiedAt: new Date(),
      },
      {
        userId: maria.id,
        displayName: 'Personal Trainer',
        bio: 'Personal trainer certificada CREF com especializacao em treinamento funcional, musculacao e yoga. Transforme seu corpo e sua mente com treinos personalizados no Rio de Janeiro.',
        services: ['musculacao', 'funcional', 'yoga'],
        city: 'Rio de Janeiro',
        state: 'RJ',
        country: 'BR',
        priceRange: { min: 80, max: 250 },
        isVerified: true,
        isActive: true,
        verifiedBy: moderator.id,
        verifiedAt: new Date(),
      },
    ])
    .returning();

  console.log(`  Inserted ${2} profiles`);

  // --- 3. Reviews ---
  const insertedReviews = await db
    .insert(reviews)
    .values([
      {
        profileId: profileJoao.id,
        reviewerId: carlos.id,
        rating: 5,
        comment: 'Excelente profissional! Corte impecavel e atendimento de primeira.',
        sentiment: 'positive',
        sentimentScore: 0.95,
      },
      {
        profileId: profileJoao.id,
        reviewerId: maria.id,
        rating: 4,
        comment: 'Muito bom corte, apenas demorou um pouco mais do que o esperado.',
        sentiment: 'positive',
        sentimentScore: 0.72,
      },
      {
        profileId: profileMaria.id,
        reviewerId: carlos.id,
        rating: 5,
        comment: 'Treino incrivel! A Maria sabe motivar e montar um plano perfeito.',
        sentiment: 'positive',
        sentimentScore: 0.98,
      },
      {
        profileId: profileMaria.id,
        reviewerId: joao.id,
        rating: 3,
        comment: 'Boa profissional, mas o horario nem sempre e flexivel.',
        sentiment: 'neutral',
        sentimentScore: 0.45,
      },
    ])
    .returning();

  console.log(`  Inserted ${insertedReviews.length} reviews`);

  // --- 4. Subscriptions ---
  const now = new Date();
  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

  const insertedSubscriptions = await db
    .insert(subscriptions)
    .values([
      {
        userId: joao.id,
        plan: 'basic',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: oneMonthLater,
        features: {
          prioritySearch: false,
          verifiedBadge: true,
          analytics: false,
        },
      },
      {
        userId: maria.id,
        plan: 'premium',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: oneMonthLater,
        features: {
          prioritySearch: true,
          verifiedBadge: true,
          analytics: true,
        },
      },
    ])
    .returning();

  console.log(`  Inserted ${insertedSubscriptions.length} subscriptions`);

  console.log('Seed completed successfully!');
}

// --- Runnable main block ---
async function main() {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgresql://marketplace:marketplace@localhost:5432/marketplace';

  const client = postgres(connectionString);
  const db = drizzle(client, { schema }) as unknown as Database;

  try {
    await seed(db);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

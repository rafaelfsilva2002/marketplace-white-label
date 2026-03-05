import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { hash } from 'bcryptjs';
import * as schema from '../schema';
import type { Database } from '../index';

const { users, profiles, reviews, subscriptions, categories, profileCategories } = schema;

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

  // --- 5. Categories ---
  const [beleza, saude, educacao, tecnologia, consultoria, esportes, arte, servicosGerais] =
    await db
      .insert(categories)
      .values([
        {
          name: 'Beleza',
          slug: 'beleza',
          description: 'Servicos de beleza, estetica e cuidados pessoais',
          icon: 'Scissors',
          sortOrder: 1,
        },
        {
          name: 'Saude',
          slug: 'saude',
          description: 'Profissionais de saude, bem-estar e terapias',
          icon: 'Heart',
          sortOrder: 2,
        },
        {
          name: 'Educacao',
          slug: 'educacao',
          description: 'Professores, tutores e instrutores',
          icon: 'GraduationCap',
          sortOrder: 3,
        },
        {
          name: 'Tecnologia',
          slug: 'tecnologia',
          description: 'Desenvolvimento, design e servicos digitais',
          icon: 'Monitor',
          sortOrder: 4,
        },
        {
          name: 'Consultoria',
          slug: 'consultoria',
          description: 'Consultores de negocios, financas e gestao',
          icon: 'Briefcase',
          sortOrder: 5,
        },
        {
          name: 'Esportes',
          slug: 'esportes',
          description: 'Personal trainers, instrutores e treinadores',
          icon: 'Dumbbell',
          sortOrder: 6,
        },
        {
          name: 'Arte',
          slug: 'arte',
          description: 'Artistas, musicos, fotografos e criativos',
          icon: 'Palette',
          sortOrder: 7,
        },
        {
          name: 'Servicos Gerais',
          slug: 'servicos-gerais',
          description: 'Eletricistas, encanadores, manutencao e reparos',
          icon: 'Wrench',
          sortOrder: 8,
        },
      ])
      .returning();

  // Subcategories
  await db.insert(categories).values([
    // Beleza subcategories
    { name: 'Cabeleireiro', slug: 'cabeleireiro', description: 'Cortes, coloracao e tratamentos capilares', icon: 'Scissors', parentId: beleza.id, sortOrder: 1 },
    { name: 'Maquiagem', slug: 'maquiagem', description: 'Maquiagem profissional para eventos e ensaios', icon: 'Sparkles', parentId: beleza.id, sortOrder: 2 },
    { name: 'Manicure e Pedicure', slug: 'manicure-pedicure', description: 'Cuidados com unhas e nail art', icon: 'Hand', parentId: beleza.id, sortOrder: 3 },
    // Saude subcategories
    { name: 'Fisioterapia', slug: 'fisioterapia', description: 'Reabilitacao e tratamentos fisioterapeuticos', icon: 'Activity', parentId: saude.id, sortOrder: 1 },
    { name: 'Nutricao', slug: 'nutricao', description: 'Acompanhamento nutricional e dietas', icon: 'Apple', parentId: saude.id, sortOrder: 2 },
    { name: 'Psicologia', slug: 'psicologia', description: 'Terapia e acompanhamento psicologico', icon: 'Brain', parentId: saude.id, sortOrder: 3 },
    // Educacao subcategories
    { name: 'Idiomas', slug: 'idiomas', description: 'Aulas de ingles, espanhol e outros idiomas', icon: 'Globe', parentId: educacao.id, sortOrder: 1 },
    { name: 'Reforco Escolar', slug: 'reforco-escolar', description: 'Aulas particulares e reforco para estudantes', icon: 'BookOpen', parentId: educacao.id, sortOrder: 2 },
    { name: 'Musica', slug: 'musica', description: 'Aulas de instrumentos e canto', icon: 'Music', parentId: educacao.id, sortOrder: 3 },
    // Tecnologia subcategories
    { name: 'Desenvolvimento Web', slug: 'desenvolvimento-web', description: 'Sites, aplicativos e sistemas web', icon: 'Code', parentId: tecnologia.id, sortOrder: 1 },
    { name: 'Design Grafico', slug: 'design-grafico', description: 'Identidade visual, logos e materiais graficos', icon: 'Pen', parentId: tecnologia.id, sortOrder: 2 },
    { name: 'Marketing Digital', slug: 'marketing-digital', description: 'SEO, redes sociais e publicidade online', icon: 'Megaphone', parentId: tecnologia.id, sortOrder: 3 },
    // Consultoria subcategories
    { name: 'Financeira', slug: 'consultoria-financeira', description: 'Planejamento financeiro e investimentos', icon: 'DollarSign', parentId: consultoria.id, sortOrder: 1 },
    { name: 'Juridica', slug: 'consultoria-juridica', description: 'Assessoria legal e advocacia', icon: 'Scale', parentId: consultoria.id, sortOrder: 2 },
    // Esportes subcategories
    { name: 'Personal Trainer', slug: 'personal-trainer', description: 'Treinamento personalizado em academia ou domicilio', icon: 'Dumbbell', parentId: esportes.id, sortOrder: 1 },
    { name: 'Yoga e Pilates', slug: 'yoga-pilates', description: 'Aulas de yoga, pilates e meditacao', icon: 'Flower', parentId: esportes.id, sortOrder: 2 },
    { name: 'Artes Marciais', slug: 'artes-marciais', description: 'Jiu-jitsu, muay thai, karate e defesa pessoal', icon: 'Swords', parentId: esportes.id, sortOrder: 3 },
    // Arte subcategories
    { name: 'Fotografia', slug: 'fotografia', description: 'Ensaios, eventos e fotografia profissional', icon: 'Camera', parentId: arte.id, sortOrder: 1 },
    { name: 'Musica e DJs', slug: 'musica-djs', description: 'Bandas, DJs e musicos para eventos', icon: 'Music', parentId: arte.id, sortOrder: 2 },
    // Servicos Gerais subcategories
    { name: 'Eletricista', slug: 'eletricista', description: 'Instalacoes e reparos eletricos', icon: 'Zap', parentId: servicosGerais.id, sortOrder: 1 },
    { name: 'Encanador', slug: 'encanador', description: 'Instalacoes hidraulicas e reparos', icon: 'Wrench', parentId: servicosGerais.id, sortOrder: 2 },
    { name: 'Pintura', slug: 'pintura', description: 'Pintura residencial e comercial', icon: 'PaintBucket', parentId: servicosGerais.id, sortOrder: 3 },
  ]);

  console.log(`  Inserted 8 main categories + 24 subcategories`);

  // --- 6. Profile-Category associations ---
  // Joao (Cabeleireiro) -> Beleza
  await db.insert(profileCategories).values([
    { profileId: profileJoao.id, categoryId: beleza.id },
  ]);

  // Maria (Personal Trainer) -> Esportes
  await db.insert(profileCategories).values([
    { profileId: profileMaria.id, categoryId: esportes.id },
  ]);

  console.log(`  Inserted 2 profile-category associations`);

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

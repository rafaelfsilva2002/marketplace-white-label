import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3001/api/v1';

const queries = [
  'cabeleireiro',
  'massagem relaxante',
  'personal trainer',
  'manicure',
  'maquiagem para festa',
  'quero alguem pra cortar cabelo estilo coreano',
  'profissional de estetica',
  'nutricionista esportivo',
];

export default function () {
  // Full-text search
  const query = queries[Math.floor(Math.random() * queries.length)];
  const ftRes = http.get(`${BASE_URL}/search?q=${encodeURIComponent(query)}&limit=10`);

  check(ftRes, {
    'FTS status 200': (r) => r.status === 200,
    'FTS response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(0.5);

  // Semantic search
  const semRes = http.post(
    `${BASE_URL}/search/semantic`,
    JSON.stringify({ query, limit: 10 }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(semRes, {
    'Semantic status 200': (r) => r.status === 200,
    'Semantic response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}

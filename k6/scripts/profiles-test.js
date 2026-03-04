import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 30 },
    { duration: '2m', target: 30 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3001/api/v1';

export default function () {
  // List profiles
  const listRes = http.get(`${BASE_URL}/profiles?limit=10&page=1`);

  check(listRes, {
    'List profiles 200': (r) => r.status === 200,
    'List profiles < 200ms': (r) => r.timings.duration < 200,
    'Has results': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && Array.isArray(body.data.results || body.data);
      } catch {
        return false;
      }
    },
  });

  sleep(0.5);

  // Health check
  const healthRes = http.get(`${BASE_URL.replace('/api/v1', '')}/health`);

  check(healthRes, {
    'Health 200': (r) => r.status === 200,
    'Health < 50ms': (r) => r.timings.duration < 50,
  });

  sleep(1);
}

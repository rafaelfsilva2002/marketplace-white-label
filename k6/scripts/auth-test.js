import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 30 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3001/api/v1';

export default function () {
  const email = `loadtest_${randomString(8)}@test.com`;
  const password = 'Test1234!@#$';

  // Register
  const registerRes = http.post(
    `${BASE_URL}/auth/register`,
    JSON.stringify({ email, password, name: 'Load Test User' }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(registerRes, {
    'Register status 201': (r) => r.status === 201,
    'Register has token': (r) => JSON.parse(r.body).data?.accessToken !== undefined,
  });

  if (registerRes.status !== 201) {
    sleep(1);
    return;
  }

  const token = JSON.parse(registerRes.body).data.accessToken;

  // Get profile
  const meRes = http.get(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  check(meRes, {
    'Me status 200': (r) => r.status === 200,
    'Me response time < 200ms': (r) => r.timings.duration < 200,
  });

  // Login
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(loginRes, {
    'Login status 200': (r) => r.status === 200,
    'Login response time < 200ms': (r) => r.timings.duration < 200,
  });

  sleep(1);
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  createEventEnvelope,
  eventEnvelopeSchema,
} from '../dist/events/event-envelope.js';

const VALID_CORRELATION_ID = '123e4567-e89b-12d3-a456-426614174000';

function makeValidEnvelope(overrides = {}) {
  return {
    id: randomUUID(),
    type: 'user.created',
    source: 'marketplace-api',
    timestamp: new Date().toISOString(),
    correlationId: VALID_CORRELATION_ID,
    payload: { ok: true },
    ...overrides,
  };
}

// 1-10: creation invariants
test('01 createEventEnvelope returns an object', () => {
  const envelope = createEventEnvelope('evt', { ok: true }, VALID_CORRELATION_ID);
  assert.equal(typeof envelope, 'object');
  assert.ok(envelope);
});

test('02 createEventEnvelope sets fixed source', () => {
  const envelope = createEventEnvelope('evt', { ok: true }, VALID_CORRELATION_ID);
  assert.equal(envelope.source, 'marketplace-api');
});

test('03 createEventEnvelope generates UUID id', () => {
  const envelope = createEventEnvelope('evt', { ok: true }, VALID_CORRELATION_ID);
  assert.equal(eventEnvelopeSchema.shape.id.safeParse(envelope.id).success, true);
});

test('04 createEventEnvelope keeps provided type', () => {
  const envelope = createEventEnvelope('profile.updated', { ok: true }, VALID_CORRELATION_ID);
  assert.equal(envelope.type, 'profile.updated');
});

test('05 createEventEnvelope keeps provided correlationId', () => {
  const envelope = createEventEnvelope('evt', { ok: true }, VALID_CORRELATION_ID);
  assert.equal(envelope.correlationId, VALID_CORRELATION_ID);
});

test('06 createEventEnvelope keeps payload by reference', () => {
  const payload = { nested: { x: 1 } };
  const envelope = createEventEnvelope('evt', payload, VALID_CORRELATION_ID);
  assert.equal(envelope.payload, payload);
});

test('07 createEventEnvelope timestamp is ISO datetime', () => {
  const envelope = createEventEnvelope('evt', { ok: true }, VALID_CORRELATION_ID);
  assert.equal(eventEnvelopeSchema.shape.timestamp.safeParse(envelope.timestamp).success, true);
});

test('08 createEventEnvelope output passes schema', () => {
  const envelope = createEventEnvelope('evt', { ok: true }, VALID_CORRELATION_ID);
  assert.equal(eventEnvelopeSchema.safeParse(envelope).success, true);
});

test('09 createEventEnvelope does not set metadata by default', () => {
  const envelope = createEventEnvelope('evt', { ok: true }, VALID_CORRELATION_ID);
  assert.equal('metadata' in envelope, false);
});

test('10 createEventEnvelope creates distinct ids', () => {
  const a = createEventEnvelope('evt', { ok: true }, VALID_CORRELATION_ID);
  const b = createEventEnvelope('evt', { ok: true }, VALID_CORRELATION_ID);
  assert.notEqual(a.id, b.id);
});

// 11-30: payload variants
const payloadCases = [
  { name: 'flat string', payload: { a: 'x' } },
  { name: 'flat number', payload: { a: 1 } },
  { name: 'flat boolean', payload: { a: true } },
  { name: 'null value', payload: { a: null } },
  { name: 'array value', payload: { a: [1, 2, 3] } },
  { name: 'nested object', payload: { a: { b: { c: 1 } } } },
  { name: 'mixed primitives', payload: { a: 1, b: 'x', c: false } },
  { name: 'empty object', payload: {} },
  { name: 'large int', payload: { a: 9_999_999 } },
  { name: 'negative float', payload: { a: -1.25 } },
  { name: 'long string', payload: { a: 'x'.repeat(1024) } },
  { name: 'unicode string', payload: { a: 'olá-mundo-çã' } },
  { name: 'date string', payload: { a: new Date().toISOString() } },
  { name: 'array of objects', payload: { a: [{ id: 1 }, { id: 2 }] } },
  { name: 'deep array mix', payload: { a: [1, 'x', { k: 'v' }, null] } },
  { name: 'boolean map', payload: { f1: true, f2: false, f3: true } },
  { name: 'numeric map', payload: { n1: 0, n2: 1, n3: 2 } },
  { name: 'object with spaces', payload: { 'my key': 'value' } },
  { name: 'json-like blob', payload: { user: { id: 1 }, meta: { tags: ['a'] } } },
  { name: 'empty arrays', payload: { ids: [], rows: [] } },
];

payloadCases.forEach((entry, idx) => {
  test(`${11 + idx} payload variant: ${entry.name}`, () => {
    const envelope = createEventEnvelope('payload.test', entry.payload, VALID_CORRELATION_ID);
    const parsed = eventEnvelopeSchema.safeParse(envelope);
    assert.equal(parsed.success, true);
    assert.deepEqual(envelope.payload, entry.payload);
  });
});

// 31-50: valid type variants
const validTypeCases = [
  'a',
  'A',
  'evt',
  'user.created',
  'user.updated.v2',
  'chat.message.sent',
  'profile.deactivated',
  'x-y-z',
  'x_y_z',
  'x:y:z',
  'x/y/z',
  'x123',
  '123x',
  'event.with.very.long.segment.name',
  'e'.repeat(128),
  'UPPER.CASE.EVENT',
  'mixed.Case.Event',
  'evt with spaces',
  'evt\twith\ttabs',
  'evt\nwith\nnewlines',
];

validTypeCases.forEach((typeValue, idx) => {
  test(`${31 + idx} valid type accepted: ${JSON.stringify(typeValue)}`, () => {
    const envelope = createEventEnvelope(typeValue, { ok: true }, VALID_CORRELATION_ID);
    assert.equal(eventEnvelopeSchema.safeParse(envelope).success, true);
    assert.equal(envelope.type, typeValue);
  });
});

// 51-70: invalid type variants
const invalidTypeCases = [
  '',
  null,
  undefined,
  0,
  1,
  -1,
  true,
  false,
  [],
  [1, 2],
  {},
  { a: 1 },
  () => 'x',
  Symbol('x'),
  NaN,
  Infinity,
  -Infinity,
  BigInt(1),
  /abc/,
  new Date(),
];

invalidTypeCases.forEach((typeValue, idx) => {
  test(`${51 + idx} invalid type rejected: ${String(typeValue)}`, () => {
    const envelope = makeValidEnvelope({ type: typeValue });
    const parsed = eventEnvelopeSchema.safeParse(envelope);
    assert.equal(parsed.success, false);
  });
});

// 71-90: invalid correlationId variants
const invalidCorrelationIds = [
  '',
  '123',
  'not-a-uuid',
  '123e4567e89b12d3a456426614174000',
  '123e4567-e89b-12d3-a456',
  '123e4567-e89b-12d3-a456-42661417400',
  '123e4567-e89b-12d3-a456-4266141740000',
  'ZZZe4567-e89b-12d3-a456-426614174000',
  '123e4567-e89b-12d3-a456-42661417400G',
  ' 123e4567-e89b-12d3-a456-426614174000',
  '123e4567-e89b-12d3-a456-426614174000 ',
  '123e4567_e89b_12d3_a456_426614174000',
  '123e4567/e89b/12d3/a456/426614174000',
  '123e4567.e89b.12d3.a456.426614174000',
  '00000000-0000-0000-0000-00000000000Z',
  'g23e4567-e89b-12d3-a456-426614174000',
  '123e4567-e89b-12d3-a456-42661417400-',
  '----',
  'uuid:123e4567-e89b-12d3-a456-426614174000',
  '123e4567-e89b-12d3-a456-426614174000-extra',
];

invalidCorrelationIds.forEach((correlationId, idx) => {
  test(`${71 + idx} invalid correlationId rejected: ${correlationId}`, () => {
    const envelope = createEventEnvelope('evt', { ok: true }, VALID_CORRELATION_ID);
    envelope.correlationId = correlationId;
    const parsed = eventEnvelopeSchema.safeParse(envelope);
    assert.equal(parsed.success, false);
  });
});

// 91-100: timestamp validity matrix
const validTimestamps = [
  '2026-01-01T00:00:00.000Z',
  '2026-01-01T00:00:00Z',
  '2026-12-31T23:59:59.999Z',
  '2026-06-15T12:34:56.123Z',
  '2026-06-15T12:34:56.000Z',
];

validTimestamps.forEach((timestamp, idx) => {
  test(`${91 + idx} valid timestamp accepted: ${timestamp}`, () => {
    const envelope = makeValidEnvelope({ timestamp });
    const parsed = eventEnvelopeSchema.safeParse(envelope);
    assert.equal(parsed.success, true);
  });
});

const invalidTimestamps = [
  '',
  'not-a-date',
  '2026-13-01T00:00:00.000Z',
  '2026-00-01T00:00:00.000Z',
  '2026-01-32T00:00:00.000Z',
];

invalidTimestamps.forEach((timestamp, idx) => {
  test(`${96 + idx} invalid timestamp rejected: ${timestamp}`, () => {
    const envelope = makeValidEnvelope({ timestamp });
    const parsed = eventEnvelopeSchema.safeParse(envelope);
    assert.equal(parsed.success, false);
  });
});

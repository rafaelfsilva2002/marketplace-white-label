import { ApiError } from '../api';

describe('ApiError', () => {
  it('creates error with status and code', () => {
    const err = new ApiError('Not found', 404, 'NOT_FOUND');
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('ApiError');
  });

  it('creates error without code', () => {
    const err = new ApiError('Server error', 500);
    expect(err.status).toBe(500);
    expect(err.code).toBeUndefined();
  });
});

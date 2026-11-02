import { HealthService } from './health.service.js';

describe('HealthService', () => {
  it('reports the API as healthy', () => {
    expect(new HealthService().getHealth()).toEqual({ status: 'ok' });
  });
});

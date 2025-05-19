// apps/backend/__tests__/routes/index.test.ts
import request from 'supertest';
import express from 'express';
import router from '../../src/routes';

describe('Index Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    // Arrange - Create a fresh Express app and mount our router for each test
    app = express();
    app.use('/', router);
  });

  test('should respond with a welcome message for the root route', async () => {
    // Act
    const response = await request(app).get('/');
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Hello from Backend!' });
  });
});
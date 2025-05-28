import { Router } from 'express';

// Simple root router that responds with a basic health message
const router = Router();

router.get('/', (_, res) => {
  // Basic sanity endpoint
  res.json({ message: 'Hello from Backend!' });
});

export default router;

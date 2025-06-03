/**
 * Entry point for the backend Express server. The server configures common
 * middleware, sets up API routes and metrics endpoints, and registers graceful
 * shutdown handlers.
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import logger from './services/logger';
import routes from './routes';
import repositoryRoutes from './routes/repositoryRoutes';
import commitRoutes from './routes/commitRoutes';
import healthRoutes from './routes/healthRoutes';
import errorHandler from './middlewares/errorHandler';
import { setupGracefulShutdown } from './utils/gracefulShutdown';
import { requestIdMiddleware } from './middlewares/requestId';
import { metricsMiddleware, metricsHandler } from './services/metrics';

dotenv.config();

// Initialize the Express application used for all API endpoints
const app = express();

// Security middlewares
app.use(helmet());
app.use(cors(config.cors));

// Rate limiting for all API routes
const limiter = rateLimit(config.rateLimit);
app.use('/api', limiter);

// Attach request ID and metrics collection
app.use(requestIdMiddleware);
app.use(metricsMiddleware);
// Parse incoming JSON bodies
app.use(express.json());

// Expose Prometheus metrics endpoint
app.use('/metrics', metricsHandler);
// Application routes
app.use('/api', routes);
app.use('/', healthRoutes);
app.use('/api/repositories', repositoryRoutes);
app.use('/api/commits', commitRoutes);

app.use(errorHandler);

// Start the server
// Start listening for incoming HTTP requests
const server = app.listen(config.port, () => {
  logger.info(`Backend running on port ${config.port}`);
});

// Handle graceful shutdown signals
setupGracefulShutdown(server);

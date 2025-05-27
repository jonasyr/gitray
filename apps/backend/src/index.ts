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

dotenv.config();

const app = express();

// Security middleware
app.use(helmet());
app.use(cors(config.cors));

// Rate limiting
const limiter = rateLimit(config.rateLimit);
app.use('/api', limiter);

app.use(express.json());

// API routes
app.use('/api', routes);
app.use('/', healthRoutes);
app.use('/api/repositories', repositoryRoutes);
app.use('/api/commits', commitRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

const server = app.listen(config.port, () => {
  logger.info(`Backend running on port ${config.port}`);
});

setupGracefulShutdown(server);

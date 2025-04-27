import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from 'dotenv';
import { notFoundHandler, errorHandler } from './middleware/error.middleware';

// Routes
import authRoutes from './routes/auth.routes';
import bountyRoutes from './routes/bounty.routes';
import submissionRoutes from './routes/submission.routes';
import disputeRoutes from './routes/dispute.routes';
import statsRoutes from './routes/stats.routes';

// Load environment variables
config();

// Create Express app
const app = express();

// Apply middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON
app.use(morgan('dev')); // Logging

// Apply routes
app.use('/api/auth', authRoutes);
app.use('/api/bounty', bountyRoutes);
app.use('/api/submission', submissionRoutes);
app.use('/api/dispute', disputeRoutes);
app.use('/api/stats', statsRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', environment: process.env.NODE_ENV || 'development' });
});

// Apply error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

export default app; 
import { Router } from 'express';
import transactionController from '../controllers/transactionController';
import { authenticateLocalToken } from '../middleware/localAuth';

const router = Router();

// All transaction routes require authentication
router.use(authenticateLocalToken);

// Get user's transaction history
router.get('/history', (req, res) => transactionController.getUserTransactions(req, res));

// Get transaction history with pagination and filtering (for history page)
router.get('/history-page', (req, res) => transactionController.getTransactionHistory(req, res));

// Get transaction by reference ID
router.get('/ref/:ref', (req, res) => transactionController.getTransactionByRef(req, res));

// Get user's transaction statistics
router.get('/stats', (req, res) => transactionController.getUserTransactionStats(req, res));

// Get transaction statistics for history page
router.get('/stats-page', (req, res) => transactionController.getTransactionStats(req, res));

// Get user's game history with enhanced filtering
router.get('/user', (req, res) => transactionController.getUserGameHistory(req, res));

// Get user's game history statistics
router.get('/user/stats', (req, res) => transactionController.getUserGameHistoryStats(req, res));

// Create a transaction (admin only)
router.post('/create', (req, res) => transactionController.createTransaction(req, res));

// Update transaction status (admin only)
router.put('/status/:ref', (req, res) => transactionController.updateTransactionStatus(req, res));

export default router;

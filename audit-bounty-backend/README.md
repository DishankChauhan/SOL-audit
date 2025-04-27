# Audit Bounty Backend

Backend API for the Solana Audit Bounty Platform, providing REST endpoints for managing bounties, submissions, disputes, and analytics.

## Features

- 🔐 **Authentication**: Firebase Token verification with role-based access control
- 📁 **Bounty Management**: Create, list, update, and delete bounties
- 📝 **Submission Handling**: Create, approve, reject, and dispute findings
- ⚖️ **Dispute Resolution**: Initiate and resolve disputes with moderator oversight
- 📊 **Analytics**: Track platform statistics and metrics
- 🔄 **Solana Integration**: Connect with the on-chain smart contract

## Tech Stack

- Node.js & TypeScript
- Express.js for REST API
- Firebase Admin SDK for authentication and database
- Solana Web3.js for blockchain interaction
- Borsh for Solana data serialization

## Prerequisites

- Node.js 16+ and npm
- Firebase project with Firestore enabled
- Solana CLI and wallet for contract deployment
- Access to a Solana RPC endpoint (Devnet/Testnet/Mainnet)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/audit-bounty-backend.git
   cd audit-bounty-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env file with your configuration
   ```

4. Configure Firebase:
   - Create a Firebase project at https://console.firebase.google.com
   - Enable Firestore Database
   - Generate a new private key for service account in Project Settings > Service Accounts
   - Save as `firebase-service-account.json` in the project root or configure env variables

5. Configure Solana:
   - Create a Solana keypair using `solana-keygen new -o keypair.json` 
   - Fund the wallet if interacting with Devnet/Testnet/Mainnet
   - Update the env variables with your Solana configuration

## Development

Start the development server:

```bash
npm run dev
```

The server will be available at http://localhost:3001 (or the PORT specified in your .env file)

## API Routes

### Authentication
- `POST /api/auth/login` - Authenticate user with Firebase token
- `GET /api/auth/me` - Get current user profile
- `PUT /api/auth/profile` - Update user profile
- `PUT /api/auth/wallet` - Link wallet address to user

### Bounties
- `POST /api/bounty/create` - Create a new bounty
- `GET /api/bounty/list` - List bounties with filters
- `GET /api/bounty/:id` - Get a specific bounty
- `PUT /api/bounty/:id` - Update a bounty
- `DELETE /api/bounty/:id` - Delete a bounty
- `PUT /api/bounty/:id/link-solana` - Link Solana address to bounty

### Submissions
- `POST /api/submission` - Create a new submission
- `GET /api/submission/bounty/:bountyId` - Get submissions for a bounty
- `GET /api/submission/:id` - Get a specific submission
- `PUT /api/submission/:id/approve` - Approve a submission
- `PUT /api/submission/:id/reject` - Reject a submission
- `POST /api/submission/:id/comment` - Add a comment to a submission
- `GET /api/submission/user/:auditorId` - Get submissions by auditor

### Disputes
- `POST /api/dispute/initiate` - Initiate a dispute
- `GET /api/dispute/list` - List disputes with filters
- `GET /api/dispute/:id` - Get a specific dispute
- `PUT /api/dispute/:id/resolve` - Resolve a dispute (moderator only)

### Statistics
- `GET /api/stats` - Get overall platform statistics
- `GET /api/stats/bounties` - Get bounty statistics
- `GET /api/stats/submissions` - Get submission statistics
- `GET /api/stats/users` - Get user statistics

## Deployment

Build the project:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

For deployment instructions specific to different platforms, check out:
- [Deploying to Heroku](https://devcenter.heroku.com/articles/deploying-nodejs)
- [Deploying to AWS](https://aws.amazon.com/getting-started/hands-on/deploy-nodejs-web-app/)
- [Deploying to Google Cloud](https://cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-nodejs-service)

## License

This project is licensed under the ISC License. 
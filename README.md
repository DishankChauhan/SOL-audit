# Sol Audit 🔍 - Secure Smart Contract Audits on Solana

<div align="center">
  <img src="docs/images/audit-bounty-logo.png" alt="Sol Audit Logo" width="300" />
  <br />
  <h3>Smart contracts deserve trusted audits</h3>
  <p>Connect with top security auditors and protect your smart contracts.</p>

  <div>
    <img src="https://img.shields.io/badge/Solana-Compatible-blueviolet" alt="Solana Compatible" />
    <img src="https://img.shields.io/badge/Status-Beta-orange" alt="Status Beta" />
    <img src="https://img.shields.io/badge/License-MIT-blue" alt="License MIT" />
  </div>
</div>

<br />

![Sol Audit Platform Interface](docs/images/audit-bounty-homepage.png)

## 📋 Table of Contents

- [Overview](#overview)
- [Why Sol Audit?](#why-sol-audit)
- [Features Implemented](#features-implemented)
- [Platform Workflow](#platform-workflow)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [Future Roadmap](#future-roadmap)
- [Contributing](#contributing)
- [License](#license)

## 🔭 Overview

Sol Audit is a decentralized platform built on Solana that connects smart contract developers with top security auditors. Our platform streamlines the entire audit process, from bounty creation to vulnerability disclosure and reward distribution.

**Mission:** Make smart contract security accessible and reliable for all blockchain developers.

![Bounty Creation Flow](docs/images/bounty-creation.png)

## 🤔 Why Sol Audit?

### Problems in the Current Audit Landscape

- **High Costs:** Traditional audit firms charge premium prices, making security inaccessible for smaller projects
- **Limited Availability:** Top auditors have long waitlists, delaying project launches
- **Centralized Control:** Existing bounty platforms lack transparency and on-chain settlement
- **Misaligned Incentives:** Fixed-fee audits don't reward based on actual vulnerabilities found
- **Poor User Experience:** Current solutions have complex workflows and poor developer experience

### Our Solution

Sol Audit addresses these challenges by:

1. **Pay-Per-Finding Model:** Only pay for actual vulnerabilities discovered
2. **On-Chain Settlement:** All rewards are processed transparently on Solana
3. **Open Marketplace:** Any qualified auditor can participate, reducing wait times
4. **Enhanced Security:** Leveraging the collective expertise of diverse security researchers
5. **Seamless UX:** Intuitive platform designed for both developers and auditors

![Platform Benefits](docs/images/platform-benefits.png)

## ✅ Features Implemented

- **Authentication System**
  - Firebase-based authentication with email and password
  - Wallet connection and verification with Solana wallet adapters

- **Bounty Management**
  - Create bounties with detailed project information
  - Set custom severity weights and reward allocation
  - Browse and filter active bounties
  - Automatic ownership tracking tied to Firebase user ID

- **Submission Flow**
  - Submit vulnerabilities with severity assessment
  - Proof of concept and fix recommendation support
  - Submission review process for bounty owners

- **Reward System**
  - Automatic escrow creation for bounty funds
  - On-chain payment distribution for approved submissions
  - Integration with Solana's SPL tokens and native SOL

- **User Experience**
  - Responsive and intuitive interface
  - Real-time status updates for bounties and submissions
  - Markdown support for detailed technical documentation

![Submission Flow](docs/images/submission-flow.png)

## 🔄 Platform Workflow

### For Project Owners

1. **Create Bounty**
   - Connect Solana wallet
   - Define bounty parameters and reward pool
   - Fund the bounty escrow account
   - Set submission criteria and deadline

2. **Review Submissions**
   - Receive notifications for new submissions
   - Review vulnerability reports with PoC
   - Approve/reject findings with feedback
   - Rewards automatically distributed upon approval

### For Auditors

1. **Browse Bounties**
   - Filter by tags, reward size, and deadline
   - View detailed project specs and requirements

2. **Submit Findings**
   - Document vulnerabilities with severity assessment
   - Provide proof of concept
   - Include fix recommendations
   - Submit for review and receive confirmation

3. **Receive Rewards**
   - Automatic payment for approved submissions
   - Reputation building on successful findings

![User Dashboard](docs/images/user-dashboard.png)

## 💻 Technology Stack

- **Frontend:**
  - Next.js 13 with App Router
  - TypeScript
  - TailwindCSS
  - Solana Wallet Adapter

- **Backend:**
  - Firebase (Authentication, Firestore)
  - Node.js Express API
  - Solana Web3.js

- **Blockchain:**
  - Solana Program (Rust)
  - SPL Token integration
  - Custom escrow program

## 🚀 Getting Started

### Prerequisites

- Node.js v16 or higher
- npm or yarn
- Firebase account
- Solana devnet account and wallet

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/DishankChauhan/sol-audit
   cd sol-audit
   ```

2. Install dependencies:
   ```
   cd sol-audit-backend
   npm install
   cd ../sol-audit-frontend
   npm install
   ```

3. Configure Firebase:
   - Create a Firebase project
   - Set up Firestore database
   - Download serviceAccountKey.json and place it in the backend root directory
   - Configure frontend Firebase credentials in `sol-audit-frontend/src/lib/firebase/config.ts`

4. Run the applications:
   ```
   # Terminal 1 - Backend
   cd sol-audit-backend
   npm run dev
   
   # Terminal 2 - Frontend
   cd sol-audit-frontend
   npm run dev
   ```

![Setup Instructions](docs/images/setup-instructions.png)

## 🔮 Future Roadmap

We're committed to continually improving the Sol Audit platform. Here's what's coming next:

### Short-term (Q2 2023)
- **Dispute Resolution DAO** - Implement a decentralized arbitration system for contested submissions
- **Enhanced Analytics** - Provide insights for both auditors and project owners
- **Reputation System** - Build a trustless reputation system for auditors based on successful findings

### Mid-term (Q3-Q4 2023)
- **Team Collaboration** - Support for audit teams working together on larger projects
- **Specialized Audit Types** - Custom templates for different types of audits (NFT, DeFi, etc.)
- **Integration with Developer Tools** - IDE plugins and CI/CD integrations

### Long-term Vision
- **Decentralized Governance** - Community-driven platform governance
- **Cross-chain Support** - Extend beyond Solana to other blockchain ecosystems
- **Audit Certification Program** - Standardized certification for auditors on the platform

![Future Roadmap](docs/images/roadmap.png)

## 👥 Contributing

We welcome contributions to improve the platform! Please see the [CONTRIBUTING.md](CONTRIBUTING.md) file for guidelines.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  <p>Built with ❤️ by Dishank Chauhan</p>
  <div>
    <a href="https://twitter.com/SolAudit">Twitter</a> •
    <a href="https://discord.gg/solaudit">Discord</a> •
    <a href="mailto:contact@solaudit.io">Contact</a>
  </div>
</div> 
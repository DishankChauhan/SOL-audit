# Audit Bounty Smart Contract

A Solana smart contract for managing security audit bounties, submissions, and reward distributions.

## Overview

This smart contract allows project owners to create bounties for security audits, enabling security researchers (auditors) to submit findings, and project owners to approve or reject those findings. The contract also includes a dispute resolution mechanism and reward distribution system.

## Key Features

- **Bounty Creation**: Project owners can create bounties with customizable parameters like repo URL, bounty amount, deadline, and severity weights
- **Finding Submission**: Auditors can submit security findings with severity levels, descriptions, and proof of concept
- **Review Process**: Project owners can approve or reject submissions
- **Dispute Resolution**: Auditors can dispute rejections, with a resolution mechanism
- **Reward Distribution**: Approved findings result in token transfers to auditors based on severity weights
- **Cancellation**: Project owners can cancel bounties after deadlines pass

## Smart Contract Structure

The contract is organized into the following modules:

- **entrypoint.rs**: Program entry point
- **instruction.rs**: Defines instruction types and serialization/deserialization
- **processor.rs**: Contains the business logic for processing instructions
- **state.rs**: Defines data structures for program state
- **error.rs**: Custom error types

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment details including program ID and instructions.

## Usage Instructions

### For Project Owners

1. **Create a Bounty**: Initialize a new bounty with details about your project
2. **Review Submissions**: Approve or reject security findings
3. **Handle Disputes**: Participate in dispute resolution if needed
4. **Cancel Bounty**: Reclaim funds after deadline if needed

### For Security Researchers (Auditors)

1. **Submit Findings**: Submit security vulnerabilities found in the project
2. **Dispute Rejections**: Contest rejections if you believe your finding was valid
3. **Claim Rewards**: Collect tokens for approved findings

## Severity Weights

Bounties define severity weights (e.g., Critical: 40%, High: 30%, Medium: 20%, Low: 10%) that determine the percentage of the bounty amount paid for each severity level.

## License

This project is licensed under the MIT License. 
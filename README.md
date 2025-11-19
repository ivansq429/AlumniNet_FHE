# AlumniNet_FHE

AlumniNet_FHE is a privacy-preserving social network platform designed for alumni interactions, leveraging Zama's Fully Homomorphic Encryption (FHE) technology. This secure network enables verified alumni to engage in anonymous donations and mutual aid without exposing their positions or sensitive data.

## The Problem

In a world where data breaches and privacy violations are rampant, traditional social networks expose users' personal information, including job titles and connections. This openness can lead to unwanted solicitations, identity theft, or even targeted scams. Alumni networks face similar challenges: the need to validate identities while ensuring the privacy and confidentiality of their members. 

Cleartext data is particularly dangerous in such environments as it may be intercepted or misused, undermining the very purpose of these networks: trust and support among alumni. Without robust privacy measures, alumni may hesitate to contribute resources or seek assistance within their network, stifling community growth and engagement.

## The Zama FHE Solution

Zama’s Fully Homomorphic Encryption technology offers a groundbreaking way to secure data while enabling meaningful interactions. By allowing computation directly on encrypted data, Zama's solution eliminates the need to expose sensitive information. 

Using the fhevm, AlumniNet_FHE processes encrypted inputs to ensure user identity verification and interactions occur without ever revealing the underlying data. This means alumni can donate, offer support, or request help, all while their personal information remains confidential.

## Key Features

- 🔒 **Privacy-First Design**: Interact without fear of data exposure.
- 💬 **Anonymous Donations**: Support fellow alumni discreetly.
- 🤝 **Peer Support**: Facilitate resource sharing without revealing identities.
- 🎓 **Verified Connections**: Ensure that all interactions are authentic and secure.
- 🌐 **Dynamic Interaction**: Engage with fellow alumni in real-time without compromising privacy.

## Technical Architecture & Stack

AlumniNet_FHE is built on a tech stack that incorporates state-of-the-art privacy solutions. The primary components of the architecture are:

- **Backend**: Zama's fhevm, enabling computation on encrypted data.
- **Frontend**: A responsive web application built to provide an intuitive user experience.
- **Database**: Encrypted storage solutions ensuring data integrity and privacy.

### Stack Overview

- **Core Privacy Engine**: Zama's fhevm
- **Front-end Framework**: React
- **Backend Language**: Node.js
- **Database**: Encrypted database solutions

## Smart Contract / Core Logic

Here’s a simplified example using Solidity to illustrate how we could implement a basic function for verifying the identity of an alumnus while maintaining privacy.solidity
pragma solidity ^0.8.0;

import "tfhe.sol"; // Hypothetical import referencing Zama's library

contract AlumniNetwork {
    mapping(address => bytes) public encryptedIdentities;

    function verifyIdentity(bytes memory encryptedIdentity) public returns (bool) {
        // Logic to use TFHE.decrypt() to verify identity while keeping data secure
        bytes memory decryptedId = TFHE.decrypt(encryptedIdentity);
        // Further verification logic
        // ...
        return true; // Or false based on verification
    }
}

## Directory Structure

Here’s an overview of the directory structure for AlumniNet_FHE:
AlumniNet_FHE/
├── contracts/
│   ├── AlumniNetwork.sol
├── src/
│   ├── index.js
│   ├── App.js
├── scripts/
│   ├── donate.js
│   ├── support.js
├── tests/
│   ├── AlumniNetwork.test.js
└── README.md

## Installation & Setup

### Prerequisites

1. Ensure you have Node.js and npm installed.
2. Install the required Zama library:bash
npm install fhevm

### Installing Dependencies

Next, install the necessary dependencies for the project:bash
npm install

## Build & Run

To compile the smart contracts and run the application, execute the following commands:

1. Compile the smart contracts:bash
npx hardhat compile

2. Start the application:bash
npm start

## Acknowledgements

We would like to express our heartfelt gratitude to Zama for providing the open-source Fully Homomorphic Encryption primitives that make AlumniNet_FHE possible. Their dedication to advancing privacy and security in technology is invaluable to projects like ours, empowering communities to interact safely and securely.
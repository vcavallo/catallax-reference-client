# Catallax - Decentralized Contract Work Platform

A comprehensive UI implementation for testing the Catallax protocol (NIP-3400), which enables decentralized contract work with escrow arbitration on Nostr.

## ⚡ Lightning Integration

**Real Lightning payments are now supported!** The app includes both demo mode (simulated payments) and real Lightning integration via WebLN. Switch between modes in the Settings tab.

## Features

This implementation covers all Catallax protocol features:

### For Arbiters
- **Create Arbiter Services** - Advertise arbitration services with fee structures and expertise areas
- **Manage Service Announcements** - Update service details, policies, and fee structures
- **View Assigned Tasks** - See tasks that use your arbitration services
- **Conclude Tasks** - Document task resolutions and payment confirmations

### For Patrons (Task Creators)
- **Create Task Proposals** - Post detailed work requirements with payment terms
- **Select Arbiters** - Choose from available arbitration services
- **Fund Tasks** - Add escrow funding via Lightning zaps
- **Assign Workers** - Select and assign workers to funded tasks
- **Track Progress** - Monitor task status through completion

### For Workers (Free Agents)
- **Discover Tasks** - Browse available funded tasks
- **Apply for Work** - Contact patrons for task assignments
- **Submit Work** - Mark tasks as submitted for review
- **Track Assignments** - View tasks you're working on

### Discovery & Management
- **Browse Arbiters** - View all available arbitration services with fees and specialties
- **Task Marketplace** - Discover tasks needing funding or workers (with filters)
- **Lightning Integration** - Native zap support for escrow funding and payments
- **Status Tracking** - Real-time updates on task progress
- **Payment History** - View completed task resolutions and outcomes

## Protocol Implementation

The UI implements the complete Catallax protocol specification:

- **Kind 33400**: Arbiter Announcement (parameterized replaceable)
- **Kind 33401**: Task Proposal (parameterized replaceable)
- **Kind 3402**: Task Conclusion (regular event)

### Task Workflow

1. **Arbiter Setup** - Arbiters create service announcements
2. **Task Creation** - Patrons create proposals and select arbiters
3. **Escrow Funding** - Patrons click "Fund Escrow" → pay Lightning invoice → task automatically updates to "funded"
4. **Worker Assignment** - Patrons assign workers to funded tasks
5. **Work Completion** - Workers submit completed work
6. **Payment Resolution** - Arbiters send Lightning payments to workers or refunds to patrons
7. **Task Conclusion** - Arbiters document final resolution with payment receipts

**Seamless Experience**: The app automatically handles task status updates after Lightning payments complete.

## Technical Features

- **Lightning Integration** - Native zap support for all payments (escrow, worker payments, refunds)
- **Smart Filtering** - Toggle between funded/unfunded tasks for different user roles
- **Real-time Updates** - Live task status changes via Nostr subscriptions
- **Efficient Querying** - Optimized relay queries with proper filtering
- **User Management** - Multi-account support with role-based interfaces
- **Responsive Design** - Mobile-friendly interface with dark/light themes
- **Type Safety** - Full TypeScript implementation with proper event validation

## Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```

3. **Access the Application**
   - Open http://localhost:5173
   - Log in with a Nostr extension (Alby, nos2x, etc.)
   - Start creating arbiter services or task proposals

## Usage Guide

### Creating an Arbiter Service

1. Click "Create Arbiter Service"
2. Fill in service details, fee structure, and expertise areas
3. Publish to make your services available to patrons

### Posting a Task

1. Click "Create Task"
2. Describe the work, requirements, and payment amount
3. Select an arbiter from available services
4. Fund the task via Lightning to activate it

### Managing Tasks

- **Patrons**: Fund tasks via Lightning, assign workers, track progress
- **Workers**: Submit completed work, communicate with patrons
- **Arbiters**: Send Lightning payments to workers or refunds to patrons, document resolutions

### Lightning Payments

The app supports both demo and real Lightning payments:

#### Demo Mode (Default)
- **Fund Escrow**: Simulated Lightning payments for protocol testing
- **Worker Payment**: Simulated arbiter payments to workers
- **Patron Refund**: Simulated refunds to patrons
- **No Real Bitcoin**: Safe for testing and development

#### Real Lightning Mode
- **WebLN Integration**: Uses browser Lightning wallet extensions (Alby, Mutiny, etc.)
- **QR Code Support**: Scan Lightning invoices with any mobile Lightning wallet
- **LNURL-Pay Support**: Resolves Lightning addresses from user profiles
- **NIP-57 Zaps**: Full Nostr zap implementation with receipts
- **Real Bitcoin**: Actual Lightning payments sent over the network

**Switch modes in Settings tab**

### Discovery Filters

- **Unfunded Tasks** (default): Shows proposed tasks needing funding - ideal for patrons
- **Funded Tasks**: Shows funded tasks needing workers - ideal for workers
- Toggle between views to see different opportunities

## Protocol Notes

- All events use the `t` tag with "catallax" for efficient discovery
- Task updates replace previous versions (parameterized replaceable events)
- Payment confirmations reference Lightning zap receipts
- Out-of-band communication handles worker applications and work submission

## Development

Built with:
- React 18 + TypeScript
- TailwindCSS + shadcn/ui components
- Nostrify for Nostr protocol integration
- TanStack Query for data management
- React Router for navigation

## How to Use Real Lightning

### Prerequisites
1. **Lightning Wallet** (choose one):
   - **WebLN Extension**: [Alby](https://getalby.com), [Mutiny](https://mutinywallet.com), etc.
   - **Mobile Wallet**: Any Lightning wallet that can scan QR codes (Phoenix, Breez, Zeus, etc.)

2. **Set Up Lightning Address**:
   - Add `lud16` field to your Nostr profile (kind 0 event)
   - Format: `"lud16": "username@domain.com"`
   - Many Lightning wallets provide Lightning addresses

### Enable Real Lightning
1. Go to **Settings** tab in the app
2. Toggle **"Real Lightning Payments"**
3. Confirm you understand real Bitcoin will be sent
4. The app will check for WebLN support

### Making Payments
1. **Fund Tasks**: Click "Fund Escrow" → Choose payment method → Task automatically becomes "funded"
   - **WebLN**: Browser extension handles payment automatically
   - **QR Code**: Scan with any Lightning wallet app
2. **Pay Workers**: Arbiters click "Pay Worker" → Real Lightning payment sent
3. **Issue Refunds**: Arbiters click "Refund Patron" → Lightning refund sent
4. **Seamless Updates**: Task status updates automatically when payments complete

### Payment Methods
- **WebLN Tab**: One-click payments with browser extensions
- **QR Code Tab**: Scan with mobile wallets + automatic payment detection via Nostr relays
- **Real-time Detection**: Watches for zap receipts on Nostr to automatically confirm payments
- **Universal Support**: Works with any Lightning wallet, not just WebLN

### Lightning Address Setup Examples
```json
// In your Nostr profile (kind 0)
{
  "name": "Alice",
  "lud16": "alice@getalby.com",
  "lud06": "LNURL1234..." // Alternative LNURL format
}
```

The app automatically detects Lightning addresses from user profiles and enables zap functionality.

---

Vibed with [MKStack](https://soapbox.pub/mkstack)
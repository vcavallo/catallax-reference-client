# Catallax Protocol Implementation Guide

## How Task Status Changes Work

**Important**: Task status changes are **user-initiated events**, not automatic relay behavior. Users must publish updated task proposal events themselves after taking actions.

## Complete Workflow

### 1. Arbiter Setup
- Arbiter publishes **Kind 33400** (Arbiter Announcement)
- Includes fee structure, expertise areas, and policies
- This is a **parameterized replaceable event** (can be updated)

### 2. Task Creation
- Patron publishes **Kind 33401** (Task Proposal) with status "proposed"
- References specific arbiter service via `a` tag
- Includes task details, requirements, and payment amount

### 3. Escrow Funding Process
**This is where the confusion often happens:**

1. **Patron sends Lightning payment to arbiter** (off-protocol payment)
2. **Patron receives zap receipt** (Kind 9735 event)
3. **Patron publishes updated Kind 33401** with:
   - Status changed to "funded"
   - `e` tag referencing the zap receipt
   - All other task details remain the same

**The relay does NOT automatically change task status.** The patron must manually update the task proposal event.

### 4. Worker Assignment
1. **Workers discover funded tasks** (status "funded")
2. **Worker contacts patron** (out-of-band communication)
3. **Patron selects worker and publishes updated Kind 33401** with:
   - Status changed to "in_progress"
   - Additional `p` tag for worker pubkey
   - Same zap receipt reference

### 5. Work Submission
1. **Worker completes work** (off-protocol)
2. **Worker or patron publishes updated Kind 33401** with:
   - Status changed to "submitted"
   - All previous tags maintained

### 6. Payment Resolution
1. **Arbiter reviews work** (off-protocol)
2. **Arbiter sends Lightning payment** to worker OR refunds patron
3. **Arbiter receives payment receipt** (zap receipt)

### 7. Task Conclusion
**Arbiter publishes Kind 3402** (Task Conclusion) with:
- Resolution type (successful/rejected/cancelled/abandoned)
- Reference to payout zap receipt
- Reference to original task proposal
- All participant pubkeys

## Key Protocol Insights

### User Responsibilities
- **Patrons**: Update task status after funding and worker assignment
- **Workers**: Communicate completion (may update status to "submitted")
- **Arbiters**: Handle payments and publish final conclusions

### Event Relationships
- **Kind 33400**: Arbiter services (replaceable)
- **Kind 33401**: Task proposals (replaceable - latest version is current status)
- **Kind 3402**: Task conclusions (regular events - permanent record)

### Payment Flow
1. **Escrow**: Patron → Arbiter (Lightning)
2. **Worker Payment**: Arbiter → Worker (Lightning)
3. **Refund**: Arbiter → Patron (Lightning)

All Lightning payments happen **outside the Nostr protocol** but are **referenced in events** via zap receipts.

### Status Transitions
```
proposed → funded → in_progress → submitted → concluded
     ↓         ↓          ↓           ↓          ↓
   Patron   Patron    Patron     Worker/    Arbiter
  creates   funds     assigns    Patron    concludes
   task    escrow     worker    submits    with 3402
```

## Implementation Notes

### Why This Design?
- **Decentralized**: No central authority manages state
- **Auditable**: All status changes are signed events
- **Flexible**: Users control their own state transitions
- **Lightning-Native**: Leverages existing Lightning infrastructure

### Common Misconceptions
- ❌ "Relays automatically update task status when payments are made"
- ❌ "Zap receipts automatically trigger status changes"
- ❌ "The protocol handles payments internally"

### Correct Understanding
- ✅ Users publish updated events after taking actions
- ✅ Zap receipts are referenced in events as proof
- ✅ Lightning payments happen outside Nostr
- ✅ Task proposals are replaceable (latest version is current)

## Testing the Protocol

When testing Catallax:
1. **Create arbiter service** (Kind 33400)
2. **Create task proposal** (Kind 33401, status "proposed")
3. **Send Lightning payment** to arbiter
4. **Update task proposal** (Kind 33401, status "funded", with zap receipt)
5. **Assign worker** (Kind 33401, status "in_progress", with worker pubkey)
6. **Mark submitted** (Kind 33401, status "submitted")
7. **Arbiter pays worker** (Lightning payment)
8. **Arbiter concludes task** (Kind 3402 with resolution)

Each step requires **user action** - nothing happens automatically.
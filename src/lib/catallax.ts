import type { NostrEvent } from '@nostrify/nostrify';

// Catallax Event Kinds
export const CATALLAX_KINDS = {
  ARBITER_ANNOUNCEMENT: 33400,
  TASK_PROPOSAL: 33401,
  TASK_CONCLUSION: 3402,
} as const;

// Status Types
export type TaskStatus = 'proposed' | 'funded' | 'in_progress' | 'submitted' | 'concluded';
export type ResolutionType = 'successful' | 'rejected' | 'cancelled' | 'abandoned';
export type FeeType = 'flat' | 'percentage';

// Content Interfaces
export interface ArbiterAnnouncementContent {
  name: string;
  about?: string;
  policy_text?: string;
  policy_url?: string;
}

export interface TaskProposalContent {
  title: string;
  description: string;
  requirements: string;
  deadline?: number; // Unix timestamp
}

export interface TaskConclusionContent {
  resolution_details: string;
}

// Parsed Event Interfaces
export interface ArbiterAnnouncement {
  id: string;
  pubkey: string;
  created_at: number;
  content: ArbiterAnnouncementContent;
  d: string;
  arbiterPubkey: string;
  detailsUrl?: string;
  categories: string[];
  feeType: FeeType;
  feeAmount: string;
  minAmount?: string;
  maxAmount?: string;
}

export interface TaskProposal {
  id: string;
  pubkey: string;
  created_at: number;
  content: TaskProposalContent;
  d: string;
  patronPubkey: string;
  arbiterPubkey?: string;
  workerPubkey?: string;
  arbiterService?: string;
  amount: string;
  categories: string[];
  status: TaskStatus;
  zapReceiptId?: string;
  detailsUrl?: string;
}

export interface TaskConclusion {
  id: string;
  pubkey: string;
  created_at: number;
  content: TaskConclusionContent;
  payoutZapReceiptId?: string;
  taskProposalId?: string;
  patronPubkey?: string;
  arbiterPubkey?: string;
  workerPubkey?: string;
  resolution: ResolutionType;
  taskReference?: string;
}

// Utility Functions
export function parseArbiterAnnouncement(event: NostrEvent): ArbiterAnnouncement | null {
  try {
    const content = JSON.parse(event.content) as ArbiterAnnouncementContent;

    const d = event.tags.find(([name]) => name === 'd')?.[1];
    const arbiterPubkey = event.tags.find(([name]) => name === 'p')?.[1];
    const detailsUrl = event.tags.find(([name]) => name === 'r')?.[1];
    const categories = event.tags.filter(([name]) => name === 't').map(([, value]) => value);
    const feeType = event.tags.find(([name]) => name === 'fee_type')?.[1] as FeeType;
    const feeAmount = event.tags.find(([name]) => name === 'fee_amount')?.[1];
    const minAmount = event.tags.find(([name]) => name === 'min_amount')?.[1];
    const maxAmount = event.tags.find(([name]) => name === 'max_amount')?.[1];

    if (!d || !arbiterPubkey || !feeType || !feeAmount) {
      return null;
    }

    return {
      id: event.id,
      pubkey: event.pubkey,
      created_at: event.created_at,
      content,
      d,
      arbiterPubkey,
      detailsUrl,
      categories,
      feeType,
      feeAmount,
      minAmount,
      maxAmount,
    };
  } catch {
    return null;
  }
}

export function parseTaskProposal(event: NostrEvent): TaskProposal | null {
  try {
    const content = JSON.parse(event.content) as TaskProposalContent;

    const d = event.tags.find(([name]) => name === 'd')?.[1];
    const pTags = event.tags.filter(([name]) => name === 'p');
    const patronPubkey = pTags[0]?.[1];
    const arbiterPubkey = pTags[1]?.[1];
    const workerPubkey = pTags[2]?.[1];

    const arbiterService = event.tags.find(([name]) => name === 'a')?.[1];
    const amount = event.tags.find(([name]) => name === 'amount')?.[1];
    const categories = event.tags.filter(([name]) => name === 't').map(([, value]) => value);
    const status = event.tags.find(([name]) => name === 'status')?.[1] as TaskStatus;
    const zapReceiptId = event.tags.find(([name, , , marker]) => name === 'e' && marker === 'zap')?.[1];
    const detailsUrl = event.tags.find(([name]) => name === 'r')?.[1];

    if (!d || !patronPubkey || !amount || !status) {
      return null;
    }

    return {
      id: event.id,
      pubkey: event.pubkey,
      created_at: event.created_at,
      content,
      d,
      patronPubkey,
      arbiterPubkey,
      workerPubkey,
      arbiterService,
      amount,
      categories,
      status,
      zapReceiptId,
      detailsUrl,
    };
  } catch {
    return null;
  }
}

export function parseTaskConclusion(event: NostrEvent): TaskConclusion | null {
  try {
    const content = JSON.parse(event.content) as TaskConclusionContent;

    const eTags = event.tags.filter(([name]) => name === 'e');
    const payoutZapReceiptId = eTags[0]?.[1];
    const taskProposalId = eTags[1]?.[1];

    const pTags = event.tags.filter(([name]) => name === 'p');
    const patronPubkey = pTags[0]?.[1];
    const arbiterPubkey = pTags[1]?.[1];
    const workerPubkey = pTags[2]?.[1];

    const resolution = event.tags.find(([name]) => name === 'resolution')?.[1] as ResolutionType;
    const taskReference = event.tags.find(([name]) => name === 'a')?.[1];

    if (!resolution) {
      return null;
    }

    return {
      id: event.id,
      pubkey: event.pubkey,
      created_at: event.created_at,
      content,
      payoutZapReceiptId,
      taskProposalId,
      patronPubkey,
      arbiterPubkey,
      workerPubkey,
      resolution,
      taskReference,
    };
  } catch {
    return null;
  }
}

export function formatSats(sats: string | number): string {
  const amount = typeof sats === 'string' ? parseInt(sats) : sats;
  if (amount >= 100000000) {
    return `${(amount / 100000000).toFixed(2)} BTC`;
  }
  return `${amount.toLocaleString()} sats`;
}

export function formatFee(feeType: FeeType, feeAmount: string): string {
  if (feeType === 'flat') {
    return formatSats(feeAmount);
  }
  const percentage = parseFloat(feeAmount) * 100;
  return `${percentage}%`;
}

export function generateTaskId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  const timestamp = Date.now().toString().slice(-6);
  return `${slug}-${timestamp}`;
}

export function generateServiceId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  return `${slug}-service`;
}

export function getStatusColor(status: TaskStatus): string {
  switch (status) {
    case 'proposed': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    case 'funded': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'in_progress': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    case 'submitted': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
    case 'concluded': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
  }
}

export function getResolutionColor(resolution: ResolutionType): string {
  switch (resolution) {
    case 'successful': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'rejected': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    case 'cancelled': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
    case 'abandoned': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
  }
}

export interface PaymentSplit {
  recipientPubkey: string;
  amount: number; // in sats
  weight: number; // for zap split
  purpose: string;
}

export function calculateArbiterFee(taskAmount: number, feeType: FeeType, feeAmount: string): number {
  if (feeType === 'flat') {
    return parseInt(feeAmount);
  } else {
    // Percentage fee
    const percentage = parseFloat(feeAmount);
    return Math.floor(taskAmount * percentage);
  }
}

export function calculatePaymentSplit(
  task: TaskProposal,
  arbiter: ArbiterAnnouncement,
  recipientPubkey: string,
  paymentType: 'worker' | 'patron'
): PaymentSplit[] {
  const taskAmount = parseInt(task.amount);
  const arbiterFee = calculateArbiterFee(taskAmount, arbiter.feeType, arbiter.feeAmount);

  const splits: PaymentSplit[] = [];

  if (paymentType === 'worker') {
    // Worker gets the full task amount
    splits.push({
      recipientPubkey,
      amount: taskAmount,
      weight: taskAmount,
      purpose: `Payment for completed work: ${task.content.title}`,
    });

    // Arbiter gets their fee as additional amount
    if (arbiterFee > 0) {
      splits.push({
        recipientPubkey: task.arbiterPubkey!,
        amount: arbiterFee,
        weight: arbiterFee,
        purpose: `Arbiter fee for task: ${task.content.title}`,
      });
    }
  } else {
    // For refunds, patron gets the full task amount back
    splits.push({
      recipientPubkey,
      amount: taskAmount,
      weight: taskAmount,
      purpose: `Refund for task: ${task.content.title}`,
    });

    // Arbiter still gets their fee for arbitration service
    if (arbiterFee > 0) {
      splits.push({
        recipientPubkey: task.arbiterPubkey!,
        amount: arbiterFee,
        weight: arbiterFee,
        purpose: `Arbiter fee for task: ${task.content.title}`,
      });
    }
  }

  return splits;
}
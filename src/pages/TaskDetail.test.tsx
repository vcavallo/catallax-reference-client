import { describe, it, expect } from 'vitest';
import { formatSats, type TaskProposal } from '@/lib/catallax';

// Extract the generateMetaDescription function for testing
function generateMetaDescription(task: TaskProposal): string {
  const amount = formatSats(task.amount);
  const description = task.content.description;
  
  // Start with the amount
  let metaDescription = `${amount}`;
  
  // Add description, truncating if necessary to fit within reasonable limits
  // Aim for around 150-160 characters total for optimal social sharing
  const maxDescriptionLength = 150 - metaDescription.length - 3; // -3 for " - "
  
  if (description && maxDescriptionLength > 20) {
    const truncatedDescription = description.length > maxDescriptionLength 
      ? description.substring(0, maxDescriptionLength - 3) + '...'
      : description;
    metaDescription += ` - ${truncatedDescription}`;
  }
  
  return metaDescription;
}

describe('TaskDetail Meta Description Generation', () => {
  it('should generate meta description with amount and short description', () => {
    const mockTask: TaskProposal = {
      id: 'test-id',
      pubkey: 'test-pubkey',
      created_at: Date.now() / 1000,
      content: {
        title: 'Test Task',
        description: 'This is a short description',
        requirements: 'Test requirements',
      },
      d: 'test-d',
      patronPubkey: 'patron-pubkey',
      amount: '50000',
      categories: ['test'],
      status: 'proposed',
    };

    const result = generateMetaDescription(mockTask);
    expect(result).toBe('50,000 sats - This is a short description');
  });

  it('should truncate long descriptions', () => {
    const longDescription = 'This is a very long description that should be truncated because it exceeds the maximum length allowed for social media meta descriptions and we want to keep it concise';
    
    const mockTask: TaskProposal = {
      id: 'test-id',
      pubkey: 'test-pubkey',
      created_at: Date.now() / 1000,
      content: {
        title: 'Test Task',
        description: longDescription,
        requirements: 'Test requirements',
      },
      d: 'test-d',
      patronPubkey: 'patron-pubkey',
      amount: '100000',
      categories: ['test'],
      status: 'proposed',
    };

    const result = generateMetaDescription(mockTask);
    expect(result.length).toBeLessThanOrEqual(150);
    expect(result).toContain('100,000 sats - ');
    expect(result).toContain('...');
  });

  it('should handle large amounts in BTC format', () => {
    const mockTask: TaskProposal = {
      id: 'test-id',
      pubkey: 'test-pubkey',
      created_at: Date.now() / 1000,
      content: {
        title: 'Test Task',
        description: 'High value task',
        requirements: 'Test requirements',
      },
      d: 'test-d',
      patronPubkey: 'patron-pubkey',
      amount: '100000000', // 1 BTC
      categories: ['test'],
      status: 'proposed',
    };

    const result = generateMetaDescription(mockTask);
    expect(result).toBe('1.00 BTC - High value task');
  });

  it('should handle empty description', () => {
    const mockTask: TaskProposal = {
      id: 'test-id',
      pubkey: 'test-pubkey',
      created_at: Date.now() / 1000,
      content: {
        title: 'Test Task',
        description: '',
        requirements: 'Test requirements',
      },
      d: 'test-d',
      patronPubkey: 'patron-pubkey',
      amount: '25000',
      categories: ['test'],
      status: 'proposed',
    };

    const result = generateMetaDescription(mockTask);
    expect(result).toBe('25,000 sats');
  });
});
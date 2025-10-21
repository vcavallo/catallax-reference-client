import { nip19 } from 'nostr-tools';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

interface CopyNpubButtonProps {
  pubkey: string;
  className?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  showText?: boolean;
}

export function CopyNpubButton({ 
  pubkey, 
  className, 
  size = 'icon', 
  variant = 'ghost',
  showText = false 
}: CopyNpubButtonProps) {
  const { toast } = useToast();

  const handleCopy = () => {
    const npub = nip19.npubEncode(pubkey);
    navigator.clipboard.writeText(npub);
    toast({
      title: 'Copied!',
      description: 'npub copied to clipboard',
    });
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleCopy}
      className={cn('shrink-0', className)}
      title="Copy npub"
    >
      <Copy className="h-4 w-4" />
      {showText && <span className="ml-1">Copy</span>}
    </Button>
  );
}
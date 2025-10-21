import { useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { CATALLAX_KINDS, generateServiceId, type FeeType } from '@/lib/catallax';

interface ArbiterAnnouncementFormProps {
  onSuccess?: () => void;
}

export function ArbiterAnnouncementForm({ onSuccess }: ArbiterAnnouncementFormProps) {
  const { user } = useCurrentUser();
  const { mutate: createEvent, isPending } = useNostrPublish();

  const [formData, setFormData] = useState({
    name: '',
    about: '',
    policyText: '',
    policyUrl: '',
    detailsUrl: '',
    feeType: 'percentage' as FeeType,
    feeAmount: '',
    minAmount: '',
    maxAmount: '',
  });

  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const content = {
      name: formData.name,
      about: formData.about || undefined,
      policy_text: formData.policyText || undefined,
      policy_url: formData.policyUrl || undefined,
    };

    const tags: string[][] = [
      ['d', generateServiceId(formData.name)],
      ['p', user.pubkey],
      ['t', 'catallax'],
      ['fee_type', formData.feeType],
      ['fee_amount', formData.feeAmount],
    ];

    if (formData.detailsUrl) {
      tags.push(['r', formData.detailsUrl]);
    }

    if (formData.minAmount) {
      tags.push(['min_amount', formData.minAmount]);
    }

    if (formData.maxAmount) {
      tags.push(['max_amount', formData.maxAmount]);
    }

    categories.forEach(category => {
      tags.push(['t', category]);
    });

    createEvent({
      kind: CATALLAX_KINDS.ARBITER_ANNOUNCEMENT,
      content: JSON.stringify(content),
      tags,
    }, {
      onSuccess: () => {
        setFormData({
          name: '',
          about: '',
          policyText: '',
          policyUrl: '',
          detailsUrl: '',
          feeType: 'percentage',
          feeAmount: '',
          minAmount: '',
          maxAmount: '',
        });
        setCategories([]);
        onSuccess?.();
      },
    });
  };

  const addCategory = () => {
    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
      setCategories([...categories, newCategory.trim()]);
      setNewCategory('');
    }
  };

  const removeCategory = (category: string) => {
    setCategories(categories.filter(c => c !== category));
  };

  if (!user) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Please log in to create an arbiter service announcement.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Arbiter Service</CardTitle>
        <CardDescription>
          Advertise your arbitration services to the Catallax network
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Service Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Web Development Escrow"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="about">About (Optional)</Label>
            <Textarea
              id="about"
              value={formData.about}
              onChange={(e) => setFormData({ ...formData, about: e.target.value })}
              placeholder="Describe your arbitration expertise and experience"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="feeType">Fee Structure *</Label>
              <Select
                value={formData.feeType}
                onValueChange={(value: FeeType) => setFormData({ ...formData, feeType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat Fee</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feeAmount">
                Fee Amount * {formData.feeType === 'flat' ? '(sats)' : '(0.0-1.0)'}
              </Label>
              <Input
                id="feeAmount"
                type="number"
                step={formData.feeType === 'percentage' ? '0.01' : '1'}
                min="0"
                max={formData.feeType === 'percentage' ? '1' : undefined}
                value={formData.feeAmount}
                onChange={(e) => setFormData({ ...formData, feeAmount: e.target.value })}
                placeholder={formData.feeType === 'flat' ? '10000' : '0.05'}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minAmount">Minimum Task Amount (sats)</Label>
              <Input
                id="minAmount"
                type="number"
                min="0"
                value={formData.minAmount}
                onChange={(e) => setFormData({ ...formData, minAmount: e.target.value })}
                placeholder="100000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxAmount">Maximum Task Amount (sats)</Label>
              <Input
                id="maxAmount"
                type="number"
                min="0"
                value={formData.maxAmount}
                onChange={(e) => setFormData({ ...formData, maxAmount: e.target.value })}
                placeholder="10000000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Service Categories</Label>
            <div className="flex gap-2">
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="e.g., programming, design, writing"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCategory();
                  }
                }}
              />
              <Button type="button" onClick={addCategory} variant="outline">
                Add
              </Button>
            </div>
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {categories.map((category) => (
                  <Badge key={category} variant="secondary" className="flex items-center gap-1">
                    {category}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => removeCategory(category)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="detailsUrl">Details URL (Optional)</Label>
            <Input
              id="detailsUrl"
              type="url"
              value={formData.detailsUrl}
              onChange={(e) => setFormData({ ...formData, detailsUrl: e.target.value })}
              placeholder="https://your-website.com/arbitration-services"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="policyUrl">Policy URL (Optional)</Label>
            <Input
              id="policyUrl"
              type="url"
              value={formData.policyUrl}
              onChange={(e) => setFormData({ ...formData, policyUrl: e.target.value })}
              placeholder="https://your-website.com/arbitration-policy"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="policyText">Policy Text (Optional)</Label>
            <Textarea
              id="policyText"
              value={formData.policyText}
              onChange={(e) => setFormData({ ...formData, policyText: e.target.value })}
              placeholder="Full text of your arbitration policies, terms, and dispute resolution procedures"
              rows={4}
            />
          </div>

          <Button type="submit" disabled={isPending || !formData.name || !formData.feeAmount}>
            {isPending ? 'Publishing...' : 'Publish Service'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Zap, AlertTriangle, Shield } from 'lucide-react';

interface ZapModeToggleProps {
  realZapsEnabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function ZapModeToggle({ realZapsEnabled, onToggle }: ZapModeToggleProps) {
  const [showWarning, setShowWarning] = useState(false);

  const handleToggle = (enabled: boolean) => {
    if (enabled && !realZapsEnabled) {
      setShowWarning(true);
    } else {
      onToggle(enabled);
      setShowWarning(false);
    }
  };

  const confirmRealZaps = () => {
    onToggle(true);
    setShowWarning(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Lightning Payment Mode
        </CardTitle>
        <CardDescription>
          Choose between demo mode (simulated) or real Lightning payments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-2">
          <Switch
            id="real-zaps"
            checked={realZapsEnabled}
            onCheckedChange={handleToggle}
          />
          <Label htmlFor="real-zaps" className="flex items-center gap-2">
            {realZapsEnabled ? (
              <>
                <Zap className="h-4 w-4 text-yellow-500" />
                Real Lightning Payments
              </>
            ) : (
              <>
                <Shield className="h-4 w-4 text-blue-500" />
                Demo Mode (Simulated)
              </>
            )}
          </Label>
        </div>

        {realZapsEnabled ? (
          <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
            <Zap className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800 dark:text-yellow-200">
              <strong>Real Lightning Mode:</strong> Payments will send actual Bitcoin.
              Supports WebLN wallet extensions (Alby, Mutiny) and QR codes for any Lightning wallet.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
            <Shield className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800 dark:text-blue-200">
              <strong>Demo Mode:</strong> Payments are simulated for testing.
              No real Bitcoin is sent. Perfect for protocol testing.
            </AlertDescription>
          </Alert>
        )}

        {showWarning && (
          <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800 dark:text-red-200">
              <strong>⚠️ Warning:</strong> You're about to enable real Lightning payments.
              This will send actual Bitcoin. Make sure you understand the risks.
              <div className="flex gap-2 mt-3">
                <button
                  onClick={confirmRealZaps}
                  className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                >
                  I Understand - Enable Real Zaps
                </button>
                <button
                  onClick={() => setShowWarning(false)}
                  className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
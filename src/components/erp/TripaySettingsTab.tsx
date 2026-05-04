'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CreditCard, Save, Eye, EyeOff, ExternalLink, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiFetch } from '@/lib/api-client';

interface TripayConfig {
  apiKey: string;
  privateKey: string;
  merchantCode: string;
  mode: 'sandbox' | 'production';
}

export default function TripaySettingsTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TripayConfig>({
    apiKey: '',
    privateKey: '',
    merchantCode: '',
    mode: 'sandbox',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Load settings
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch<{ settings: Record<string, any> }>('/api/settings'),
  });

  useEffect(() => {
    const tripay = settingsData?.settings?.tripay_config;
    if (tripay) {
      setForm({
        apiKey: tripay.apiKey || '',
        privateKey: tripay.privateKey || '',
        merchantCode: tripay.merchantCode || '',
        mode: tripay.mode || 'sandbox',
      });
    }
  }, [settingsData]);

  const isConfigured = form.apiKey && form.privateKey && form.merchantCode;

  const handleSave = async () => {
    if (!form.apiKey.trim() || !form.privateKey.trim() || !form.merchantCode.trim()) {
      toast.error('Semua field wajib diisi');
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/api/settings/tripay_config', {
        method: 'PATCH',
        body: JSON.stringify({ value: form }),
      });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Konfigurasi Tripay berhasil disimpan');
    } catch {
      toast.error('Gagal menyimpan konfigurasi Tripay');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const result = await apiFetch<{ success: boolean; message?: string; error?: string }>(
        '/api/payments/qris/create',
        {
          method: 'POST',
          body: JSON.stringify({
            invoiceNo: 'TEST-' + Date.now(),
            amount: 1,
            callbackUrl: window.location.origin + '/api/payments/qris/callback',
            returnUrl: window.location.origin,
          }),
        }
      );
      if (result.success !== false) {
        toast.success('Koneksi Tripay berhasil! QRIS siap digunakan.');
      } else {
        toast.error(result.error || 'Koneksi gagal. Periksa kredensial.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Gagal menghubungi Tripay');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Pembayaran QRIS (Tripay)
          </CardTitle>
          <CardDescription>
            Terima pembayaran via QRIS dari pelanggan. Daftar di{' '}
            <a href="https://tripay.co.id" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
              tripay.co.id <ExternalLink className="w-3 h-3" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            {isConfigured ? (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Terkonfigurasi
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-200">
                <XCircle className="w-3 h-3 mr-1" /> Belum dikonfigurasi
              </Badge>
            )}
            {form.mode === 'production' && isConfigured && (
              <Badge className="bg-red-100 text-red-700 border-red-200">Production</Badge>
            )}
            {form.mode === 'sandbox' && isConfigured && (
              <Badge variant="secondary">Sandbox</Badge>
            )}
          </div>

          <Separator />

          {/* Mode */}
          <div className="space-y-2">
            <Label>Mode</Label>
            <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v as 'sandbox' | 'production' })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Sandbox (Testing)
                  </span>
                </SelectItem>
                <SelectItem value="production">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Production (Live)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Gunakan Sandbox untuk testing. Ganti ke Production setelah siap menerima pembayaran asli.
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <Label>API Key</Label>
            <div className="relative">
              <Input
                type={showApiKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="Masukkan API Key dari Tripay"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Private Key */}
          <div className="space-y-2">
            <Label>Private Key</Label>
            <div className="relative">
              <Input
                type={showPrivateKey ? 'text' : 'password'}
                value={form.privateKey}
                onChange={(e) => setForm({ ...form, privateKey: e.target.value })}
                placeholder="Masukkan Private Key dari Tripay"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowPrivateKey(!showPrivateKey)}
              >
                {showPrivateKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Merchant Code */}
          <div className="space-y-2">
            <Label>Merchant Code</Label>
            <Input
              type="text"
              value={form.merchantCode}
              onChange={(e) => setForm({ ...form, merchantCode: e.target.value })}
              placeholder="Masukkan Merchant Code dari Tripay"
            />
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Cara mendapatkan kredensial:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-xs">
              <li>Daftar di <a href="https://tripay.co.id" target="_blank" rel="noopener noreferrer" className="underline">tripay.co.id</a></li>
              <li>Setelah aktif, buka menu API &gt; Credential</li>
              <li>Copy API Key, Private Key, dan Merchant Code ke form di atas</li>
              <li>Klik &quot;Simpan&quot; lalu &quot;Test Koneksi&quot;</li>
            </ol>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-between border-t pt-4 gap-2">
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={!isConfigured || testing}
            className="w-full sm:w-auto"
          >
            {testing ? 'Mengetes...' : 'Test Koneksi'}
          </Button>
          <Button onClick={handleSave} disabled={saving || !isConfigured} className="w-full sm:w-auto">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

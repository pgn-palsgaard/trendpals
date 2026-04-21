import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Mail, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export default function ImportFromEmailModal({ open, onClose, onImport }) {
  const [emailText, setEmailText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleExtract = async () => {
    if (!emailText.trim()) {
      toast.error('Please paste an email first');
      return;
    }
    setIsProcessing(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a project brief extractor for Palsgaard, a B2B ingredient company.
Extract structured project information from the following email or meeting notes.

EMAIL / NOTES:
"""
${emailText}
"""

Extract as much detail as possible. For region_code, map to one of: ASPAC, AMERICAS, EMEC, IMEA, Global.
For category, use one of: Cake premixes & Long shelf-life cakes, Cake gels, Condiments, Chocolate & Confectionery, Dairy, Ice Cream, Processed meat, Oils & Fats, Plant-based products, RUTF and RUSF. Pick the best match.
For meeting_context, use one of: discovery, innovation_day, technical_workshop, other.
For customer_priorities, select any that apply from: cost, clean label, sustainability, texture, indulgence, health & wellness, convenience.
For trend_time_window, use one of: last 6 months, last 12 months, last 24 months, last 36 months. Default to "last 24 months".

Return ONLY a JSON object with these fields (omit fields you cannot determine):
- name (string): a concise project name summarising the customer + category + region
- category (string)
- region_code (string)
- customer_name (string)
- audience (string, default "Industrial manufacturers")
- objective (string): what the deck must achieve, written as a clear purpose statement
- specific_focus (string): sub-angles or product types to focus on
- topics_to_avoid (string)
- trend_time_window (string)
- meeting_context (string)
- customer_priorities (array of strings)`,
        response_json_schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            category: { type: 'string' },
            region_code: { type: 'string' },
            customer_name: { type: 'string' },
            audience: { type: 'string' },
            objective: { type: 'string' },
            specific_focus: { type: 'string' },
            topics_to_avoid: { type: 'string' },
            trend_time_window: { type: 'string' },
            meeting_context: { type: 'string' },
            customer_priorities: { type: 'array', items: { type: 'string' } },
          },
        },
      });

      onImport(result);
      toast.success('Project details extracted — please review and adjust');
      onClose();
      setEmailText('');
    } catch (error) {
      toast.error('Failed to extract details: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600" />
            Import from Email
          </DialogTitle>
          <DialogDescription>
            Paste an email or meeting notes below. AI will automatically extract the project details and pre-fill the form.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          placeholder="Paste your email or meeting notes here..."
          className="min-h-[260px] font-mono text-sm"
          value={emailText}
          onChange={(e) => setEmailText(e.target.value)}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            onClick={handleExtract}
            disabled={isProcessing || !emailText.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isProcessing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Extracting...</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" />Extract Details</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
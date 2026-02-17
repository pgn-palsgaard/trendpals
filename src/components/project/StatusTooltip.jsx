import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const statusDescriptions = {
  draft: 'Initial setup complete. Add sources to proceed.',
  evidence_sufficient: 'Sources uploaded. Generate trend candidates next.',
  publishable: 'Trends selected (3-5). Ready to generate report.',
  published: 'Report published. Can clone or regenerate.',
  aged: 'Report aging. Consider regenerating with fresh data.',
  fresh: 'Data is recent and reliable.',
  use_with_caution: 'Some sources are aging. Verify with latest data.',
  outdated: 'Sources are outdated. Update recommended.'
};

export default function StatusTooltip({ status, children }) {
  const description = statusDescriptions[status];
  
  if (!description) return children;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            {children}
            <HelpCircle className="w-3 h-3 text-slate-400 cursor-help" />
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs">{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
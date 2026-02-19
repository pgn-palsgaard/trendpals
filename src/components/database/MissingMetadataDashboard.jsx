import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Calendar, MapPin, Tag, Shield } from 'lucide-react';

export default function MissingMetadataDashboard({ sources, onFilterMissing, onBulkFix }) {
  // Calculate missing fields
  const missingRegion = sources.filter(s => !s.region).length;
  const missingCategory = sources.filter(s => !s.category).length;
  const missingDate = sources.filter(s => !s.date).length;
  const missingTrustTier = sources.filter(s => !s.trust_tier || s.trust_tier === 'medium').length; // medium is default, might want explicit
  
  const totalMissing = missingRegion + missingCategory + missingDate;

  if (totalMissing === 0) {
    return null;
  }

  return (
    <Card className="border-amber-300 bg-amber-50/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-900">
          <AlertTriangle className="w-5 h-5" />
          Missing Metadata
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-amber-800 mb-4">
          {totalMissing} field{totalMissing > 1 ? 's' : ''} missing across your sources. Click to filter and fix.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {missingRegion > 0 && (
            <button
              onClick={() => onFilterMissing('region')}
              className="p-3 border-2 border-amber-200 rounded-lg hover:border-amber-400 hover:bg-amber-100 transition-all text-left"
            >
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4 text-amber-600" />
                <span className="font-semibold text-amber-900">Region</span>
              </div>
              <p className="text-sm text-amber-700">{missingRegion} source{missingRegion > 1 ? 's' : ''}</p>
            </button>
          )}

          {missingCategory > 0 && (
            <button
              onClick={() => onFilterMissing('category')}
              className="p-3 border-2 border-amber-200 rounded-lg hover:border-amber-400 hover:bg-amber-100 transition-all text-left"
            >
              <div className="flex items-center gap-2 mb-1">
                <Tag className="w-4 h-4 text-amber-600" />
                <span className="font-semibold text-amber-900">Category</span>
              </div>
              <p className="text-sm text-amber-700">{missingCategory} source{missingCategory > 1 ? 's' : ''}</p>
            </button>
          )}

          {missingDate > 0 && (
            <button
              onClick={() => onFilterMissing('date')}
              className="p-3 border-2 border-amber-200 rounded-lg hover:border-amber-400 hover:bg-amber-100 transition-all text-left"
            >
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-amber-600" />
                <span className="font-semibold text-amber-900">Date Published</span>
              </div>
              <p className="text-sm text-amber-700">{missingDate} source{missingDate > 1 ? 's' : ''}</p>
            </button>
          )}
        </div>

        <div className="pt-3 border-t border-amber-200">
          <Button
            size="sm"
            onClick={onBulkFix}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white"
          >
            Fix all missing data →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
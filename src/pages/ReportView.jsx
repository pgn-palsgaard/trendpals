import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ExternalLink, Copy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import DownloadReportButton from '@/components/project/DownloadReportButton';

export default function ReportView() {
  const urlParams = new URLSearchParams(window.location.search);
  const reportId = urlParams.get('id');

  const { data: report, isLoading } = useQuery({
    queryKey: ['report', reportId],
    queryFn: async () => {
      const reports = await base44.entities.Report.filter({ id: reportId });
      return reports[0];
    },
    enabled: !!reportId
  });

  const { data: sources = [] } = useQuery({
    queryKey: ['reportSources', report?.project_id],
    queryFn: () => base44.entities.Source.filter({ project_id: report.project_id }),
    enabled: !!report?.project_id
  });

  const handleCopySlide = (slide) => {
    const text = `
${slide.title}
${slide.subtitle || ''}

${slide.bullets?.map(b => `• ${b}`).join('\n') || ''}

${slide.so_what?.length ? 'So What for Manufacturers:\n' + slide.so_what.map(s => `• ${s}`).join('\n') : ''}

${slide.where_palsgaard_supports?.length ? 'Where Palsgaard Supports:\n' + slide.where_palsgaard_supports.map(s => `• ${s}`).join('\n') : ''}

Evidence: ${slide.evidence_footer || ''}
    `.trim();
    
    navigator.clipboard.writeText(text);
    toast.success('Slide copied to clipboard');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading report...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-slate-600 mb-4">Report not found</p>
            <Link to={createPageUrl('ReportsLibrary')}>
              <Button>Back to Library</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const freshnessColors = {
    fresh: 'bg-green-100 text-green-700',
    use_with_caution: 'bg-yellow-100 text-yellow-700',
    outdated: 'bg-red-100 text-red-700'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8">
      <div className="max-w-5xl mx-auto px-4">
        <Link to={createPageUrl('ReportsLibrary')}>
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Library
          </Button>
        </Link>

        {/* Report Header */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-2xl mb-3">{report.title}</CardTitle>
                <div className="flex flex-wrap gap-2 text-sm text-slate-600">
                  <span>{report.category}</span>
                  <span>•</span>
                  <span>{report.region}</span>
                  <span>•</span>
                  <span>{report.slides?.length || 0} slides</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <DownloadReportButton report={report} size="sm" />
                <Badge className={`${freshnessColors[report.freshness || 'fresh']}`}>
                  {report.freshness?.replace('_', ' ') || 'fresh'}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {report.selected_trends && report.selected_trends.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {report.selected_trends.map((trend, idx) => (
                  <Badge key={idx} variant="secondary">{trend}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Slides */}
        {report.slides && report.slides.map((slide, idx) => (
          <Card key={idx} className="mb-6">
            <CardHeader className="border-b">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="text-sm text-slate-500 mb-2">Slide {slide.slide_number}</div>
                  <CardTitle className="text-xl mb-1">{slide.title}</CardTitle>
                  {slide.subtitle && (
                    <p className="text-sm text-slate-600">{slide.subtitle}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleCopySlide(slide)}
                  title="Copy slide content"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {slide.bullets && slide.bullets.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-semibold text-slate-900 mb-3">Key Points</h4>
                  <ul className="space-y-2">
                    {slide.bullets.map((bullet, bidx) => (
                      <li key={bidx} className="flex items-start gap-3">
                        <span className="text-blue-600 mt-1">•</span>
                        <span className="text-slate-700">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {slide.product_examples && slide.product_examples.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-semibold text-slate-900 mb-3">Product Examples</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {slide.product_examples.map((product, pidx) => (
                      <div key={pidx} className="p-4 border border-slate-200 rounded-lg bg-slate-50">
                        {product.image_url && (
                          <img 
                            src={product.image_url} 
                            alt={product.product_name}
                            className="w-full h-32 object-contain mb-3 bg-white rounded"
                          />
                        )}
                        <h5 className="font-semibold text-sm text-slate-900 mb-1">
                          {product.brand} - {product.product_name}
                        </h5>
                        <p className="text-xs text-slate-600 mb-2">{product.market}</p>
                        {product.key_ingredients && (
                          <p className="text-xs text-slate-600 mb-2">
                            <span className="font-medium">Key ingredients:</span> {product.key_ingredients}
                          </p>
                        )}
                        {product.relevance && (
                          <p className="text-xs text-blue-700 italic">{product.relevance}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {slide.so_what && slide.so_what.length > 0 && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-3">So What for Manufacturers?</h4>
                  <ul className="space-y-2">
                    {slide.so_what.map((item, sidx) => (
                      <li key={sidx} className="flex items-start gap-3">
                        <span className="text-blue-600 mt-1">→</span>
                        <span className="text-blue-800">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {slide.where_palsgaard_supports && slide.where_palsgaard_supports.length > 0 && (
                <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <h4 className="font-semibold text-emerald-900 mb-3">Where Palsgaard Supports</h4>
                  <ul className="space-y-2">
                    {slide.where_palsgaard_supports.map((item, pidx) => (
                      <li key={pidx} className="flex items-start gap-3">
                        <span className="text-emerald-600 mt-1">✓</span>
                        <span className="text-emerald-800">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {slide.evidence_footer && (
                <div className="pt-4 border-t">
                  <p className="text-xs text-slate-500">
                    <span className="font-medium">Evidence:</span> {slide.evidence_footer}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {/* Evidence Pack */}
        {report.evidence_pack && report.evidence_pack.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Evidence Pack</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {report.evidence_pack.map((evidence, idx) => (
                  <li key={idx} className="flex items-start gap-3 pb-3 border-b last:border-0">
                    <span className="text-purple-600 mt-1 font-bold">•</span>
                    <div className="flex-1">
                      <p className="text-slate-700">{evidence.bullet}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {evidence.source_type}
                        </Badge>
                        {evidence.confidence && (
                          <Badge variant="outline" className="text-xs">
                            {evidence.confidence} confidence
                          </Badge>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
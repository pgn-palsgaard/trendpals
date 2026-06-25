import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

export default function BriefingContextSlide({ slide }) {
  if (!slide) return null;

  return (
    <Card className="mb-6 overflow-hidden">
      <CardContent className="p-8 md:p-10 bg-white">
        <p className="text-xs font-semibold tracking-widest uppercase text-[#C15338] mb-3">
          {slide.subtitle}
        </p>
        <h2 className="text-2xl md:text-3xl font-semibold text-[#1D2B47] mb-8 font-heading">
          {slide.title}
        </h2>

        {slide.prepared_for && (
          <div className="mb-8">
            <p className="text-sm font-semibold text-[#C15338] mb-1">Prepared for</p>
            <p className="text-sm text-[#1D2B47]">{slide.prepared_for}</p>
          </div>
        )}

        {slide.commercial_questions?.length > 0 && (
          <div className="mb-8">
            <p className="text-sm font-semibold text-[#1D428A] mb-3">
              {slide.commercial_questions.length === 2 ? 'Two' : slide.commercial_questions.length} commercial question{slide.commercial_questions.length > 1 ? 's' : ''} this report answers
            </p>
            <div className="space-y-4">
              {slide.commercial_questions.map((cq, i) => (
                <div key={i}>
                  <p className="text-sm font-semibold text-[#C15338]">{i + 1} {cq.question}</p>
                  {cq.markets_in_scope && (
                    <p className="text-sm text-[#1D2B47] mt-0.5">Markets in scope: {cq.markets_in_scope}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {slide.trends_under_microscope?.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-semibold text-[#1D428A] mb-3">
              {slide.trends_under_microscope.length} trend{slide.trends_under_microscope.length > 1 ? 's' : ''} under the microscope
            </p>
            <div className="space-y-1.5">
              {slide.trends_under_microscope.map((t, i) => (
                <p key={i} className="text-sm text-[#1D2B47]">{t}</p>
              ))}
            </div>
          </div>
        )}

        {slide.evidence_footer && (
          <p className="text-xs italic text-stone-400 mt-8">{slide.evidence_footer}</p>
        )}
      </CardContent>
    </Card>
  );
}
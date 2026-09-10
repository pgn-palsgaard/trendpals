import React, { useEffect, useRef, useState } from 'react';
import SlideCanvas from '@/components/briefbeta/SlideCanvas';

export default function SlideThumbnail({ slide }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(160);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  if (!slide) return <div className="aspect-video bg-secondary rounded-lg flex items-center justify-center text-xs text-muted-foreground">Brief in progress</div>;
  return <div ref={ref} aria-hidden="true" className="relative aspect-video overflow-hidden rounded-lg bg-card pointer-events-none">
    <div className="absolute top-0 left-0 w-[800px] origin-top-left" style={{ transform: `scale(${width / 800})` }}><SlideCanvas slide={slide} thumbnail /></div>
  </div>;
}
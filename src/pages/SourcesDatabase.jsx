import React from 'react';
import SourceLibrary from '../components/sources/SourceLibrary';

export default function SourcesDatabase() {
  return (
    <SourceLibrary
      sourceTypeFilter={['mintel', 'report', 'url', 'gnpd', 'other']}
      title="Evidence Sources"
      subtitle="Mintel reports, GNPD exports, trade press, and external market data"
    />
  );
}
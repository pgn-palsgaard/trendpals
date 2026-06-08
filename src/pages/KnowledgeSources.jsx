import React from 'react';
import SourceLibrary from '../components/sources/SourceLibrary';

export default function KnowledgeSources() {
  return (
    <SourceLibrary
      sourceTypeFilter="knowledge"
      title="Knowledge Sources"
      subtitle="Palsgaard product sheets, technical docs, capabilities, and internal references"
    />
  );
}
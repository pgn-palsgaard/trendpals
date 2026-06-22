import React from 'react';

export default function ValidationSummary({ challenges, assignments }) {
  const total = challenges.length;
  const approved = challenges.filter(c => c.review_status === 'approved').length;
  const validated = challenges.filter(c => c.validation_status === 'validated' || c.validation_status === 'confirmed').length;
  const approvedCount = approved;
  const pendingAssignments = assignments.filter(a => a.status !== 'responded' && a.status !== 'completed').length;

  const MetricCard = ({ label, value, denom, highlight }) => (
    <div style={{
      background: 'hsl(var(--card))',
      border: '1px solid hsl(var(--border))',
      borderRadius: 10,
      padding: '12px 16px',
      flex: 1,
    }}>
      <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {label}
      </p>
      <p style={{
        fontSize: 22,
        fontWeight: 600,
        color: highlight || '#1D2B47',
        lineHeight: 1,
      }}>
        {denom !== undefined ? `${value} / ${denom}` : value}
      </p>
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <MetricCard
        label="Approved challenges"
        value={approved}
        denom={total}
      />
      <MetricCard
        label="SME validated"
        value={validated}
        denom={approvedCount}
      />
      <MetricCard
        label="Pending assignments"
        value={pendingAssignments === 0 ? 'None' : pendingAssignments}
        highlight={pendingAssignments === 0 ? '#4A6040' : '#92600A'}
      />
    </div>
  );
}
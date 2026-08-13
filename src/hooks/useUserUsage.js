import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Per-user usage totals: briefs submitted, architect chat sessions, logins.
// Queries are bounded to the user's own email so nothing scans the whole table.
export default function useUserUsage(email) {
  const key = (email || '').toLowerCase();

  return useQuery({
    queryKey: ['userUsage', key],
    enabled: !!key,
    queryFn: async () => {
      const [briefs, sessions, logins] = await Promise.all([
        base44.entities.ReportRequest.filter({ requester_email: key }),
        base44.entities.ArchitectSession.filter({ owner_email: key }),
        base44.entities.LoginEvent.filter({ email: key }),
      ]);

      const sortDesc = (arr, field) =>
        [...arr].sort((a, b) => String(b[field] || '').localeCompare(String(a[field] || '')));

      const sortedLogins = sortDesc(logins, 'timestamp');

      return {
        briefCount: briefs.length,
        chatCount: sessions.length,
        chatConverted: sessions.filter(s => s.status === 'converted').length,
        loginCount: logins.length,
        lastLogin: sortedLogins[0]?.timestamp || null,
        recentBriefs: sortDesc(briefs, 'submitted_at').slice(0, 5),
        recentChats: sortDesc(sessions, 'last_message_at').slice(0, 5),
      };
    },
  });
}
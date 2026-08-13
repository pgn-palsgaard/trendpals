import { base44 } from '@/api/base44Client';

// Records one LoginEvent per user per calendar day. Debounced locally so a
// refresh doesn't create extra records, and guarded server-side by checking
// for an existing record for today.
export async function recordLogin(user) {
  if (!user?.email) return;
  const email = user.email.toLowerCase();
  const day = new Date().toISOString().slice(0, 10);
  const marker = `tp_login_${email}_${day}`;

  try { if (localStorage.getItem(marker)) return; } catch { /* ignore */ }

  const existing = await base44.entities.LoginEvent.filter({ email, day }, '-timestamp', 1);
  try { localStorage.setItem(marker, '1'); } catch { /* ignore */ }
  if (existing.length > 0) return;

  await base44.entities.LoginEvent.create({
    user_id: user.id,
    email,
    full_name: user.full_name || '',
    day,
    timestamp: new Date().toISOString(),
  });
}
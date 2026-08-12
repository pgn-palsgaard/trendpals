import React from 'react';
import { base44 } from '@/api/base44Client';
import { Mail, UserPlus, ShieldCheck, LogIn, HelpCircle, ArrowRight } from 'lucide-react';

const STEPS = [
  {
    icon: LogIn,
    title: 'Click “Log in to the Review area” below',
    body: 'You reached this page from a link in an email. The first time you click the button below, you’ll be taken to the secure Base44 login screen — Base44 is the platform that powers TrendPals.',
  },
  {
    icon: UserPlus,
    title: 'Choose “Sign up” to create your account',
    body: 'On that login screen, click “Sign up” (bottom right, next to “Need an account?”). Enter your work email and choose a secure password of at least 8 characters. This becomes your personal reviewer login.',
  },
  {
    icon: ShieldCheck,
    title: 'Confirm your email',
    body: 'Follow the on-screen prompt to confirm your email address. Once confirmed, your reviewer account is ready to use.',
  },
  {
    icon: Mail,
    title: 'You’re in — straight to your Review Queue',
    body: 'After signing up once, you won’t need to sign up again. You’ll land directly in your Review Queue, where the trends and challenges assigned to you are waiting for your expert input.',
  },
];

export default function AccessGuideReview() {
  React.useEffect(() => {
    try { localStorage.setItem('tp_signup_role', 'reviewer'); } catch {}
  }, []);

  const handleLogin = () => {
    base44.auth.redirectToLogin(`${window.location.origin}/review`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6987a5428ef229e6ee55cbb6/16cea8b8e_Palsgaardlogo_blue_250x250.png"
            alt="Palsgaard"
            className="h-8"
          />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Intro */}
        <div className="mb-10">
          <p className="section-label mb-2">SME reviewer access</p>
          <h1 className="page-title text-3xl mb-3">Welcome, expert reviewer</h1>
          <p className="text-base text-muted-foreground leading-relaxed">
            As a subject-matter expert, you help validate the trends and challenges that shape
            TrendPals. Your review area is where you confirm, refine or reject what our analysts
            have surfaced. You were sent here by a colleague — setting up your account the first
            time takes a few short steps.
          </p>
        </div>

        {/* Steps */}
        <ol className="space-y-4 mb-10">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={i} className="pal-card p-5 flex gap-4">
                <div
                  className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center"
                  style={{ background: '#EBF0F8' }}
                >
                  <Icon className="w-5 h-5" style={{ color: '#1D428A' }} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: '#1D428A', color: 'white' }}
                    >
                      {i + 1}
                    </span>
                    <h3 className="text-base font-semibold text-foreground">{step.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Login CTA */}
        <div className="flex flex-col items-start gap-3 mb-12">
          <button
            onClick={handleLogin}
            className="inline-flex items-center gap-2 px-6 h-11 rounded-[8px] text-sm font-medium text-white transition-colors"
            style={{ background: '#1D428A' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#163570'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#1D428A'; }}
          >
            Log in to the Review area
            <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-xs text-muted-foreground">
            Already set up your password? You can log in directly.
          </p>
        </div>

        {/* Troubleshooting */}
        <div className="pal-card p-5" style={{ background: '#F7F4EE' }}>
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="w-4 h-4" style={{ color: '#6F8263' }} />
            <h3 className="text-sm font-semibold text-foreground">Having trouble getting in?</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            If the “Sign up” option doesn’t appear, or you can’t create your account, reply to the
            email that sent you here and your TrendPals contact will help you get set up.
          </p>
        </div>
      </main>

      <footer className="border-t border-border py-6">
        <p className="text-center text-xs text-muted-foreground">Palsgaard A/S · TrendPals</p>
      </footer>
    </div>
  );
}
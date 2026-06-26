import React from 'react';
import { base44 } from '@/api/base44Client';
import { Mail, KeyRound, LogIn, HelpCircle, ArrowRight } from 'lucide-react';

const STEPS = [
  {
    icon: Mail,
    title: 'Check your inbox',
    body: 'Look for an invitation email from Base44 (it powers TrendPals). If you don’t see it, check your spam or junk folder.',
  },
  {
    icon: KeyRound,
    title: 'Verify and set your password',
    body: 'Open the link in that email. The first time, you’ll be asked to verify your email and create a secure password — this becomes your TrendPals login.',
  },
  {
    icon: LogIn,
    title: 'Log in',
    body: 'Once your password is set, use the button below to sign in. From then on, you\u2019ll log in with the email and password you just created.',
  },
];

export default function AccessGuide() {
  const handleLogin = () => {
    base44.auth.redirectToLogin(`${window.location.origin}/`);
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
          <p className="section-label mb-2">Getting started</p>
          <h1 className="page-title text-3xl mb-3">Welcome to TrendPals</h1>
          <p className="text-base text-muted-foreground leading-relaxed">
            TrendPals is your shared workspace for market trends, sources and customer-ready reports.
            Getting access the first time takes three short steps.
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
            Log in to TrendPals
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
            <h3 className="text-sm font-semibold text-foreground">Didn’t receive an invitation?</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Access is granted by invitation only. If you can’t find your invite — and it’s not in
            your spam folder — please contact your TrendPals administrator to request access for your
            email address.
          </p>
        </div>
      </main>

      <footer className="border-t border-border py-6">
        <p className="text-center text-xs text-muted-foreground">Palsgaard A/S \u00b7 TrendPals</p>
      </footer>
    </div>
  );
}
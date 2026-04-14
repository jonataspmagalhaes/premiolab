'use client';

import { AppTopNav, AppMobileHeader, MobileBottomNav } from '@/components/AppSidebar';
import { BackgroundEffects } from '@/components/BackgroundEffects';
import { DataLoader } from '@/components/DataLoader';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-page relative">
      <BackgroundEffects />
      <AppTopNav />
      <AppMobileHeader />
      <MobileBottomNav />

      <main className="relative z-10 pt-12 lg:pt-14 pb-20 lg:pb-0">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <DataLoader>{children}</DataLoader>
        </div>
      </main>
    </div>
  );
}

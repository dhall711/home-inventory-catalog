import { Suspense } from 'react';
import { LoginClient } from './LoginClient';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginClient />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-md p-8">
        <div className="h-5 w-40 bg-brand-800/50 rounded animate-pulse mb-3" />
        <div className="h-3 w-64 bg-brand-800/50 rounded animate-pulse" />
      </div>
    </main>
  );
}

'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function AIFinderRedirect() {
  const { tenant } = useParams<{ tenant: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/${tenant}/crm/customers?tab=ai-finder`);
  }, [tenant, router]);
  return null;
}

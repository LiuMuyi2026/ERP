import { redirect } from 'next/navigation';

type TenantPageProps = {
  params: {
    tenant: string;
  };
};

export default function TenantPage({ params }: TenantPageProps) {
  redirect(`/${params.tenant}/workspace`);
}

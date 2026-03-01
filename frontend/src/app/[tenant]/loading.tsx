export default function TenantLoading() {
  return (
    <div className="flex-1 p-6 space-y-4" style={{ background: 'var(--notion-bg)' }}>
      <div className="skeleton h-8 w-48" />
      <div className="skeleton h-4 w-72" />
      <div className="grid grid-cols-4 gap-4 mt-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-xl" />
        ))}
      </div>
      <div className="skeleton h-64 rounded-xl mt-4" />
    </div>
  );
}

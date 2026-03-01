export default function AccountingLoading() {
  return (
    <div className="flex-1 p-6 space-y-4" style={{ background: 'var(--notion-bg)' }}>
      <div className="skeleton h-8 w-40" />
      <div className="grid grid-cols-4 gap-4 mt-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-xl" />
        ))}
      </div>
      <div className="skeleton h-10 w-full rounded-lg mt-4" />
      <div className="space-y-2 mt-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton h-12 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

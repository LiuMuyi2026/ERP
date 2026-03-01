export default function CrmLoading() {
  return (
    <div className="flex-1 p-6 space-y-4" style={{ background: 'var(--notion-bg)' }}>
      <div className="skeleton h-8 w-32" />
      <div className="grid grid-cols-3 gap-4 mt-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton h-20 rounded-xl" />
        ))}
      </div>
      <div className="skeleton h-10 w-full rounded-lg mt-4" />
      <div className="space-y-2 mt-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton h-14 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

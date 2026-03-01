export default function SettingsLoading() {
  return (
    <div className="flex-1 p-6 space-y-4" style={{ background: 'var(--notion-bg)' }}>
      <div className="skeleton h-8 w-32" />
      <div className="space-y-4 mt-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

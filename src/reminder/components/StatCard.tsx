export default function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

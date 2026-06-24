export function LoadState({ title, message }: { title: string; message: string }) {
  return (
    <section className="state-panel" role="status">
      <h2>{title}</h2>
      <p>{message}</p>
    </section>
  );
}

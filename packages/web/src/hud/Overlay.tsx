export function Overlay({ title, body, button, onClick }: {
  title: string; body: string; button: string; onClick(): void;
}) {
  return (
    <div className="overlay">
      <div className="dialog">
        <h2>{title}</h2>
        <p style={{ whiteSpace: 'pre-line' }}>{body}</p>
        <button className="primary" onClick={onClick}>{button}</button>
      </div>
    </div>
  );
}

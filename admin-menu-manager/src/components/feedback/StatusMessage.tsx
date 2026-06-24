type StatusMessageProps = {
  tone?: "info" | "warning" | "error";
  title: string;
  children: string;
};

export function StatusMessage({ tone = "info", title, children }: StatusMessageProps) {
  return (
    <div className={`status-message ${tone}`} role={tone === "error" ? "alert" : "status"}>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

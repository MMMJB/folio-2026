export default function Figure({ children }: { children: React.ReactNode }) {
  return (
    <figure className="flex flex-col overflow-auto">
      <span className="border-md-border bg-md-background ml-auto w-max rounded border px-1.5 py-0.5 text-xs">
        Interactive
      </span>
      {children}
    </figure>
  );
}

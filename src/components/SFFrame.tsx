export default function SFFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="sf-frame h-[var(--sf-frame-h)] w-[var(--sf-frame-w)] bg-[var(--sf-bg-frame)] py-0.5 transition-transform ease-out will-change-transform"
      style={{
        transform:
          "translate(0, calc(var(--sf-scroll, 0px) + var(--sf-frame-h) * var(--sf-active-frame, 0) * -1))",
        transitionDuration: "var(--sf-scroll-transition, 0ms)",
      }}
    >
      <div className="sf-content flex size-full items-center bg-[var(--sf-bg-content)]">
        {children}
      </div>
    </div>
  );
}

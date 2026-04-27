export default function CaptionLink({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      className="text-tx-secondary hover:text-tx-primary underline transition-colors"
    >
      {children}
    </a>
  );
}

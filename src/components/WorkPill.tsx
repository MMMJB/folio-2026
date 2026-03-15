import Image from "next/image";

export default function WorkPill({
  logo,
  href,
  children,
}: {
  logo: string;
  href: string;
  children: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-surface-100 hover:bg-surface-200 relative inline-flex items-center gap-1 rounded-full p-1 pr-2 align-middle text-sm/3 transition-colors selection:bg-transparent"
    >
      <Image
        src={logo}
        alt={`${children} logo`}
        width={16}
        height={16}
        className="bg-skeleton rounded-full shadow"
      />
      {children}
    </a>
  );
}

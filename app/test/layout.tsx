export default function TestLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="min-h-[100dvh] flex justify-center">{children}</div>;
}

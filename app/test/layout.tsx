export default function TestLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="min-h-[100dvh] flex justify-center p-0 md:p-5 lg:p-5">{children}</div>;
}

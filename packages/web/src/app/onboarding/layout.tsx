import { UserButton } from "@clerk/nextjs";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-neutral-900 px-6 py-4">
        <div className="text-sm font-medium text-neutral-300">Setup</div>
        <UserButton afterSignOutUrl="/sign-in" />
      </header>
      {children}
    </div>
  );
}

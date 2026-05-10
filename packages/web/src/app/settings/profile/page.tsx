import { UserProfile } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function ProfilePage() {
  return (
    <div>
      <p className="mb-4 text-sm text-neutral-400">
        Your account is managed by Clerk. Update your email, password, and MFA below.
      </p>
      <UserProfile
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "bg-neutral-900/50 border border-neutral-800 shadow-none",
          },
        }}
      />
    </div>
  );
}

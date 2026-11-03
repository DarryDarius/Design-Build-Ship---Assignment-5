import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";
import { AuthShell } from "@/components/AuthShell";

export default function SignUpPage() {
  return (
    <AuthShell>
      <Suspense>
        <SignUp />
      </Suspense>
    </AuthShell>
  );
}

import { Suspense } from "react";
import RegisterPage from "./register-page";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RegisterPage />
    </Suspense>
  );
}

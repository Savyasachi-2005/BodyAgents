"use client";

import { AnatomyApp } from "./components/AnatomyApp";
import { AuthProvider } from "./lib/auth-context";

export default function Home() {
  return (
    <AuthProvider>
      <AnatomyApp />
    </AuthProvider>
  );
}

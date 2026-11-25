"use client";

import { AnatomyApp } from "./components/AnatomyApp";
import { AuthProvider } from "./lib/auth-context";
import { ToastProvider } from "./lib/toaster";

export default function Home() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AnatomyApp />
      </AuthProvider>
    </ToastProvider>
  );
}

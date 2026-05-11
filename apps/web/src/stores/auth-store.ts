"use client";

import type { AuthResponse, AuthUser } from "@mallbay/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type AuthState = {
  hasHydrated: boolean;
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setHasHydrated: (hasHydrated: boolean) => void;
  setSession: (session: AuthResponse) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      user: null,
      accessToken: null,
      refreshToken: null,
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setSession: (session) =>
        set({
          user: session.user,
          accessToken: session.accessToken,
          refreshToken: session.refreshToken
        }),
      clearSession: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null
        })
    }),
    {
      name: "mallbay-auth",
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      }
    }
  )
);

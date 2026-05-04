import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hydrated: boolean;
  // Activity data stored separately so updates don't trigger re-renders
  // in components that only read user.name / user.role
  _activity: { page: string; action: string; lastSeenAt: string } | null;

  // Actions
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  setHydrated: (hydrated: boolean) => void;
  updateActivity: (page: string, action: string) => void;
}

// skipHydration: true prevents Turbopack TDZ errors by deferring
// localStorage read to the React lifecycle (rehydrate called in AppContent).
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      hydrated: false,
      _activity: null,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setToken: (token) => set({ token }),
      setHydrated: (hydrated) => set({ hydrated, isLoading: false }),
      
      login: (user, token) => set({ 
        user, 
        token, 
        isAuthenticated: true,
        isLoading: false,
        hydrated: true
      }),
      
      logout: () => set({ 
        user: null, 
        token: null, 
        isAuthenticated: false,
        isLoading: false,
        hydrated: true,
        _activity: null
      }),
      
      setLoading: (isLoading) => set({ isLoading }),
      
      updateActivity: (page, action) => set({
        // Store activity in a separate key — subscribers that only read `user`
        // won't re-render since `user` reference stays the same.
        _activity: { page, action, lastSeenAt: new Date().toISOString() }
      })
    }),
    {
      name: 'razkindo-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ 
        user: state.user, 
        token: state.token,
        isAuthenticated: state.isAuthenticated 
      }),
      // CRITICAL: skipHydration prevents the persist middleware from calling
      // hydrate() synchronously during create(). In Turbopack, the chunk
      // containing this store may also contain other modules that import
      // useAuthStore, causing TDZ if hydration's .then() callback fires
      // before the const binding is assigned. Rehydration is triggered
      // manually in AppContent via useAuthStore.persist.rehydrate().
      skipHydration: true,
      onRehydrateStorage: () => {
        return (_state, error) => {
          if (error) {
            console.error('Hydration error:', error);
          }
        };
      },
    }
  )
);

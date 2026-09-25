import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api('/auth/me');
      setUser(user);
      return user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Role-based styling hooks off this attribute (see index.css).
  useEffect(() => {
    if (user) document.body.dataset.role = user.role;
    else delete document.body.dataset.role;
  }, [user]);

  const value = useMemo(() => ({
    user,
    loading,
    refresh,
    async login(username, password) {
      const { user } = await api('/auth/login', { method: 'POST', body: { username, password } });
      setUser(user);
      return user;
    },
    async logout() {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      setUser(null);
    },
    signup: (form) => api('/auth/signup', { method: 'POST', body: form }),
    async updateProfile(fields) {
      const { user } = await api('/auth/profile', { method: 'PATCH', body: fields });
      setUser(user);
      return user;
    },
    async changePassword(currentPassword, newPassword) {
      const data = await api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setUser(data.user);
      return data;
    },
  }), [user, loading, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

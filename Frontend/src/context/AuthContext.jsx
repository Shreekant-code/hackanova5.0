/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useState } from "react";
import {
  STORAGE_KEYS,
  readFromStorage,
  readJsonFromStorage,
  removeFromStorage,
  writeJsonToStorage,
  writeToStorage,
} from "../utils/storage.js";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => readFromStorage(STORAGE_KEYS.authToken, ""));
  const [user, setUser] = useState(() => readJsonFromStorage(STORAGE_KEYS.authUser, null));
  const [profile, setProfile] = useState(() => readJsonFromStorage(STORAGE_KEYS.userProfile, null));

  const setSession = ({ token: nextToken, user: nextUser }) => {
    const safeToken = String(nextToken || "").trim();
    setToken(safeToken);
    setUser(nextUser || null);

    if (safeToken) {
      writeToStorage(STORAGE_KEYS.authToken, safeToken);
    } else {
      removeFromStorage(STORAGE_KEYS.authToken);
    }

    if (nextUser) {
      writeJsonToStorage(STORAGE_KEYS.authUser, nextUser);
    } else {
      removeFromStorage(STORAGE_KEYS.authUser);
    }
  };

  const updateProfile = (nextProfile) => {
    setProfile(nextProfile || null);
    if (nextProfile) {
      writeJsonToStorage(STORAGE_KEYS.userProfile, nextProfile);
      return;
    }
    removeFromStorage(STORAGE_KEYS.userProfile);
  };

  const logout = () => {
    setToken("");
    setUser(null);
    setProfile(null);
    removeFromStorage(STORAGE_KEYS.authToken);
    removeFromStorage(STORAGE_KEYS.authUser);
    removeFromStorage(STORAGE_KEYS.userProfile);
  };

  const value = useMemo(
    () => ({
      token,
      user,
      profile,
      isAuthenticated: Boolean(token),
      setSession,
      updateProfile,
      logout,
    }),
    [token, user, profile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
};

import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "./api";

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({ scheme: "crewmarket", storagePrefix: "crewmarket", storage: SecureStore }),
  ],
});

export const { useSession, signIn, signUp, signOut } = authClient;

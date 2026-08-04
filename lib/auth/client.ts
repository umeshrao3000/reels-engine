"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { signUp, signIn, signOut, useSession, requestPasswordReset, resetPassword } = authClient;

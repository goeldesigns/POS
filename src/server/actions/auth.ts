"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  profileSchema,
  resetPasswordSchema,
  selectRestaurantSchema,
  signupSchema,
} from "@/lib/validation/auth";
import { backend, relaySessionCookies } from "../backend/client";
import { SESSION_COOKIE } from "../auth/session";
import { getPlatformContext, getRestaurantContext } from "../auth/context";
import { publicAction, restaurantAction, platformAction } from "../action";

interface RestaurantOption {
  id: string;
  name: string;
  city: string | null;
  role: string;
  suspended: boolean;
  current: boolean;
}

async function startSession(path: string, body: unknown) {
  const response = await backend.send("POST", path, { body });
  await relaySessionCookies(response);
  return (await response.json()).data as { redirectTo: string };
}

export const loginAction = publicAction(loginSchema, (input) => startSession("/api/v1/auth/login", input));

export const selectRestaurantAction = restaurantAction(
  { schema: selectRestaurantSchema, revalidate: false },
  (input) => backend.post<{ name: string }>("/api/v1/auth/select-restaurant", input),
);

export async function listMyRestaurants(): Promise<RestaurantOption[]> {
  const ctx = await getRestaurantContext();
  if (!ctx) return [];
  return backend.get<RestaurantOption[]>("/api/v1/auth/restaurants");
}

export async function logoutAction() {
  await endSession("/api/v1/auth/logout", SESSION_COOKIE.RESTAURANT);
  redirect("/auth/login");
}

async function endSession(path: string, cookieName: string) {
  const store = await cookies();
  if (store.get(cookieName)?.value) {
    const response = await backend.send("POST", path, { body: {} }).catch(() => null);
    if (response) await relaySessionCookies(response);
  }
  store.delete(cookieName);
}

export const signupAction = publicAction(signupSchema, (input) => startSession("/api/v1/auth/signup", input));

export const forgotPasswordAction = publicAction(forgotPasswordSchema, (input) =>
  backend.post<{ sent: boolean }>("/api/v1/auth/forgot-password", input),
);

export const resetPasswordAction = publicAction(resetPasswordSchema, (input) =>
  backend.post<{ done: boolean }>("/api/v1/auth/reset-password", input),
);

export const updateProfileAction = restaurantAction({ schema: profileSchema }, async (input) => {
  await backend.put("/api/v1/profile", input);
  return { ok: true };
});

export const changePasswordAction = restaurantAction({ schema: changePasswordSchema }, async (input) => {
  await backend.post("/api/v1/auth/change-password", input);
  return { ok: true };
});

export const adminLoginAction = publicAction(loginSchema, (input) => startSession("/api/v1/auth/admin/login", input));

export async function adminLogoutAction() {
  await endSession("/api/v1/auth/admin/logout", SESSION_COOKIE.PLATFORM);
  redirect("/super-admin/login");
}

export const updateAdminProfileAction = platformAction({ schema: profileSchema }, async (input) => {
  await backend.put("/api/v1/admin/profile", input);
  return { ok: true };
});

export const changeAdminPasswordAction = platformAction({ schema: changePasswordSchema }, async (input) => {
  await backend.post("/api/v1/admin/change-password", input);
  return { ok: true };
});

export async function getPlatformUser() {
  return getPlatformContext();
}

import { z } from "zod";
import { emailField, passwordField, phoneField, requiredString, optionalPhone } from "./helpers";

export const loginSchema = z.object({
  email: emailField(),
  password: z.string().min(1, "Password is required").max(128),
  remember: z.boolean().default(true),
  next: z.string().optional(),
});

export const signupSchema = z
  .object({
    restaurantName: requiredString("Restaurant name", 80),
    ownerName: requiredString("Your name", 80),
    email: emailField(),
    phone: phoneField(),
    password: passwordField(),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

export const forgotPasswordSchema = z.object({ email: emailField() });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20, "This reset link is invalid"),
    password: passwordField(),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: passwordField(),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

export const profileSchema = z.object({
  name: requiredString("Name", 80),
  phone: optionalPhone(),
});

export const selectRestaurantSchema = z.object({ restaurantId: z.string().min(1) });

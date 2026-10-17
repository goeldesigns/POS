import type { ServiceContext } from "../auth/load-context";
import { backend } from "../backend/client";

export interface MemberWire {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  status: "ACTIVE" | "SUSPENDED";
  lastLoginAt: string | null;
  role: { id: string; name: string; isOwner: boolean };
  overrides: { permissionKey: string; effect: "GRANT" | "DENY" }[];
}

export interface RoleWire {
  id: string;
  name: string;
  description: string | null;
  isOwner: boolean;
  isSystem: boolean;
  members: number;
  permissions: string[];
}

export async function listMembers(_ctx: ServiceContext) {
  return (await backend.get<{ members: MemberWire[]; roles: RoleWire[] }>("/api/v1/settings/users")).members;
}

export async function listRoles(_ctx: ServiceContext) {
  return (await backend.get<{ customRolesAllowed: boolean; roles: RoleWire[] }>("/api/v1/settings/roles")).roles;
}

export async function customRolesAllowed(_ctx: ServiceContext) {
  return (await backend.get<{ customRolesAllowed: boolean; roles: RoleWire[] }>("/api/v1/settings/roles")).customRolesAllowed;
}

export interface CreateMemberInput {
  name: string;
  email: string;
  phone?: string | null;
  password: string;
  roleId: string;
  status?: "ACTIVE" | "SUSPENDED";
}

export async function createMember(_ctx: ServiceContext, input: CreateMemberInput) {
  return backend.post<{ memberId: string; attachedExisting: boolean }>("/api/v1/settings/members", input);
}

export async function updateMember(_ctx: ServiceContext, input: { memberId: string; roleId: string; status: "ACTIVE" | "SUSPENDED" }) {
  const { memberId, ...body } = input;
  await backend.put(`/api/v1/settings/members/${memberId}`, body);
}

export async function setMemberPermissions(_ctx: ServiceContext, memberId: string, permissions: string[]) {
  await backend.put(`/api/v1/settings/members/${memberId}/permissions`, { permissions });
}

export async function resetMemberPassword(_ctx: ServiceContext, memberId: string, password: string) {
  await backend.post(`/api/v1/settings/members/${memberId}/reset-password`, { password });
}

export async function removeMember(_ctx: ServiceContext, memberId: string) {
  await backend.delete(`/api/v1/settings/members/${memberId}`);
}

export async function saveRole(_ctx: ServiceContext, input: { id?: string; name: string; description: string | null; permissions: string[] }) {
  const { id, ...body } = input;
  const saved = id ? await backend.put<{ id: string }>(`/api/v1/settings/roles/${id}`, body) : await backend.post<{ id: string }>("/api/v1/settings/roles", body);
  return saved.id;
}

export async function deleteRole(_ctx: ServiceContext, roleId: string) {
  await backend.delete(`/api/v1/settings/roles/${roleId}`);
}

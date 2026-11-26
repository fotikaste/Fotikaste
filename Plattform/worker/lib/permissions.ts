/** Rollen und Rechte nach dem Prinzip der minimal nötigen Rechte (siehe docs/ARCHITECTURE.md, Rollenmatrix). */
export type Role = "owner" | "admin" | "staff";

export const PERMISSIONS = [
  "admin:view",
  "usage:read",
  "audit:read",
  "settings:write",
  "users:manage",
  "finance:read",
  "finance:write",
  "content:write",
  "bookings:read",
  "bookings:write",
  "devices:manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: ["admin:view", "usage:read", "content:write", "bookings:read", "bookings:write", "devices:manage"],
  staff: ["admin:view", "bookings:read"],
};

export function rechteVon(role: Role): readonly Permission[] {
  return MATRIX[role] ?? [];
}

export function darf(role: Role, permission: Permission): boolean {
  return rechteVon(role).includes(permission);
}

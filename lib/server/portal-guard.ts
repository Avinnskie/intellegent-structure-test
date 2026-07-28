import { redirect } from "next/navigation";
import { ApiError } from "../api/errors.ts";
import { getDb } from "../db/client.ts";
import { requireHrUser, type AuthContext, type UserRole } from "./authz.ts";

export async function requirePortalUser(requiredRole?: UserRole): Promise<AuthContext> {
  let context: AuthContext;

  try {
    context = await requireHrUser(getDb());
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
      redirect("/login");
    }
    if (error instanceof ApiError && error.code === "FORBIDDEN") {
      redirect("/login?denied=1");
    }
    throw error;
  }

  if (requiredRole && context.role !== requiredRole) {
    redirect("/hr");
  }

  return context;
}

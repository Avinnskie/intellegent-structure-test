import { redirect } from "next/navigation";
import { cache } from "react";
import { ApiError } from "../api/errors.ts";
import { getDb } from "../db/client.ts";
import { requireHrUser, type AuthContext, type UserRole } from "./authz.ts";

const requirePortalContext = cache(async (): Promise<AuthContext> => {
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

  return context;
});

export async function requirePortalUser(requiredRole?: UserRole): Promise<AuthContext> {
  const context = await requirePortalContext();

  if (requiredRole && context.role !== requiredRole) {
    redirect("/hr");
  }

  return context;
}

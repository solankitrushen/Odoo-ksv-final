// SPEC-010 FR-7 rental admin users + roles (reuse VbMembership).
import VbMembership from "../../Schema/VbMembership.js";
import VbUser from "../../Schema/VbUser.js";
import { VB_ROLES } from "../../../config/constants.js";
import { rentalError } from "../errors.js";
import { writeAudit } from "./infra.js";

const ALLOWED = new Set([VB_ROLES.ADMIN, VB_ROLES.MANAGER, VB_ROLES.OFFICER]);

export async function listAdminUsers(tenantId) {
  const memberships = await VbMembership.find({ tenantId, status: "active" }).lean();
  const users = await VbUser.find({ _id: { $in: memberships.map((m) => m.userId) } })
    .select("name email")
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return {
    items: memberships.map((m) => {
      const u = byId.get(String(m.userId));
      return {
        userId: String(m.userId),
        membershipId: String(m._id),
        email: u?.email || null,
        name: u?.name || null,
        roles: m.roles || [],
        status: m.status,
      };
    }),
  };
}

export async function patchAdminRoles(tenantId, userId, { roles }, actor) {
  const cleaned = [...new Set(roles)].filter((r) => ALLOWED.has(r));
  if (!cleaned.length) throw rentalError("VALIDATION_ERROR", "At least one rental role required (admin|manager|officer)");
  const m = await VbMembership.findOne({ tenantId, userId, status: "active" });
  if (!m) throw rentalError("RESOURCE_NOT_FOUND", "Membership not found");
  // Keep last admin: refuse removing admin from sole admin.
  if (m.roles.includes(VB_ROLES.ADMIN) && !cleaned.includes(VB_ROLES.ADMIN)) {
    const otherAdmins = await VbMembership.countDocuments({
      tenantId,
      status: "active",
      roles: VB_ROLES.ADMIN,
      userId: { $ne: userId },
    });
    if (otherAdmins === 0) {
      throw rentalError("VALIDATION_ERROR", "Cannot remove the last admin");
    }
  }
  m.roles = cleaned;
  await m.save();
  await writeAudit({
    tenantId,
    actorType: actor.type,
    actorId: actor.id,
    action: "admin.roles.patch",
    resourceType: "VbMembership",
    resourceId: String(m._id),
    reason: `roles=${cleaned.join(",")}`,
  });
  return { userId: String(userId), roles: m.roles };
}

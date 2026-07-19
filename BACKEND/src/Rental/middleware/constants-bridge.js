// Bridge to legacy constants so the rental module keeps a single import surface.
import { VB_ROLES } from "../../../config/constants.js";
export const VB_ADMIN = VB_ROLES.ADMIN;
export { RENTAL_REALM, RENTAL_CUSTOMER_ROLE } from "../constants.js";

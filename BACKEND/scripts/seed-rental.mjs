// Renton demo seed — wipes tenant rental data, then reseeds catalog (~200 products),
// admins, customers, lifecycle rentals, and 3 dues rentals with master invoices.
// Run: npm run seed:rental
import "../src/Utils/nodeCompat.js";
import { config as dotenvConfig } from "dotenv";
dotenvConfig();

import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../src/db.js";
import Tenant from "../src/Schema/Tenant.js";
import VbUser from "../src/Schema/VbUser.js";
import VbMembership from "../src/Schema/VbMembership.js";
import { VB_ROLES } from "../config/constants.js";
import {
  RENTAL_STATUS,
  PAYMENT_DIRECTION,
  DEPOSIT_EVENT,
  SHIPMENT_LEG,
  SHIPMENT_STATUS,
  ASSET_STATE,
  PROVIDERS,
} from "../src/Rental/constants.js";
import {
  RentalSettings,
  RentalAuditEvent,
  ProviderOperation,
  RentalWebhookEvent,
  RentalIdempotency,
  RentalSeqCounter,
  RentalCustomer,
  RentalIdentityClaim,
  RentalCustomerAuth,
  RentalCategory,
  RentalProduct,
  RentalVariant,
  RentalPricelist,
  RentalRateEntry,
  RentalCommercialPolicyVersion,
  RentalAsset,
  RentalMaintenanceBlock,
  RentalAllocation,
  RentalTaxCode,
  RentalQuotationTemplate,
  RentalOrder,
  RentalInvoice,
  RentalPayment,
  RentalDepositEntry,
  RentalCart,
  RentalRepairWorkOrder,
  RentalIncident,
  RentalDeliveryQuote,
  RentalShipment,
  RentalNotification,
  RentalOtpChallenge,
} from "../src/Rental/schema/index.js";
import { writeFinalInvoice } from "../src/Rental/services/invoiceService.js";
import { buildMasterInvoiceParts } from "../src/Rental/services/lateFee.js";

const SLUG = "renton";
const TENANT_NAME = "Renton Rentals";
const PRODUCT_TARGET = 200;
/** Primary rental admins (master-admin login). */
const DEMO_ADMIN_EMAIL = "admin@renton.test";
const DEMO_ADMIN_PASSWORD = "Admin@1234";
const ADMIN_EMAIL = "nu702870@gmail.com";
const ADMIN_PASSWORD = "Naruto@2051";
const ADMIN2_EMAIL = "solankitrushen@gmail.com";
const ADMIN2_PASSWORD = "Naruto@2051";
const CUSTOMER_EMAIL = "customer@renton.test";
const CUSTOMER_PHONE = "+919000000001";
const CUSTOMER_PASSWORD = "Customer@1234";
const CUSTOMER2_EMAIL = "priya@renton.test";
const CUSTOMER2_PHONE = "+919000000002";
const CUSTOMER2_PASSWORD = "Customer@1234";
const EPOCH = new Date("2020-01-01T00:00:00Z");

const img = (id, w = 900) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

const pol = ({ depositPaise, depositBps, latePaise, latePeriod = "day", grace = 120, capPaise }) => ({
  deposit: depositBps != null
    ? { mode: "percentage", valueBps: depositBps }
    : { mode: "fixed", valuePaise: depositPaise },
  late: { ratePaise: latePaise, periodCode: latePeriod },
  grace: { minutes: grace },
  cap: { mode: "fixed", valuePaise: capPaise ?? depositPaise ?? 500000 },
});

const v = (sku, name, units, rates, attributes = {}) => ({ sku, name, units, rates, attributes });

const CATEGORIES = [
  { code: "cameras", name: "Cameras & Optics", sortOrder: 1 },
  { code: "audio", name: "Audio & Sound", sortOrder: 2 },
  { code: "events", name: "Event & Staging", sortOrder: 3 },
  { code: "power-tools", name: "Power Tools", sortOrder: 4 },
  { code: "outdoor", name: "Outdoor & Camping", sortOrder: 5 },
  { code: "furniture", name: "Furniture & Decor", sortOrder: 6 },
];

/** 22 products across categories — Unsplash images, tax code key, rates in paise. */
const PRODUCTS = [
  // cameras (5)
  {
    sku: "SONY-FX3", name: "Sony FX3 Cinema Camera", category: "cameras", brand: "Sony", tax: "GST18",
    description: "Full-frame cinema camera with cage and dual batteries.",
    images: [img("photo-1516035069371-29a1b244cc32"), img("photo-1502920917128-1aa500764cbd")],
    policies: pol({ depositPaise: 3000000, latePaise: 50000, latePeriod: "hour", grace: 60, capPaise: 3000000 }),
    variants: [
      v("SONY-FX3-BODY", "Body + Cage Kit", 4, { hour: 45000, day: 250000, week: 1400000, month: 4800000 }),
      v("SONY-FX3-LENS", "Body + 24-70 Lens", 2, { hour: 65000, day: 380000, week: 2100000, month: 7200000 }),
    ],
  },
  {
    sku: "CANON-70200", name: "Canon RF 70-200mm f/2.8", category: "cameras", brand: "Canon", tax: "GST18",
    description: "Fast telephoto zoom for portraits and stage.",
    images: [img("photo-1606986628253-05620e9b3a4a"), img("photo-1510127034890-ba27508e9f1c")],
    policies: pol({ depositBps: 4000, latePaise: 20000, latePeriod: "hour", grace: 60, capPaise: 1200000 }),
    variants: [v("CANON-70200-STD", "Standard", 5, { hour: 20000, day: 110000, week: 600000, month: 2000000 })],
  },
  {
    sku: "NIKON-Z6II", name: "Nikon Z6 II Mirrorless", category: "cameras", brand: "Nikon", tax: "GST18",
    description: "Hybrid stills/video body with battery grip option.",
    images: [img("photo-1516035069371-29a1b244cc32"), img("photo-1452780212940-6f5bbf1d0edc")],
    policies: pol({ depositPaise: 1500000, latePaise: 30000, latePeriod: "hour", grace: 60 }),
    variants: [v("NIKON-Z6II-BODY", "Body Only", 6, { hour: 25000, day: 140000, week: 750000, month: 2500000 })],
  },
  {
    sku: "GOPRO-12", name: "GoPro Hero 12 Black", category: "cameras", brand: "GoPro", tax: "GST18",
    description: "Action cam with chest mount and spare batteries.",
    images: [img("photo-1551698618-1dfe5d97d256"), img("photo-1564466809058-bf4114d55352")],
    policies: pol({ depositPaise: 400000, latePaise: 15000, latePeriod: "day", grace: 120 }),
    variants: [v("GOPRO-12-KIT", "Cam + Mount Kit", 10, { hour: 5000, day: 30000, week: 150000, month: 450000 })],
  },
  {
    sku: "DJI-MINI3", name: "DJI Mini 3 Pro Drone", category: "cameras", brand: "DJI", tax: "GST18",
    description: "Lightweight drone with fly-more kit. Operator must hold valid permit.",
    images: [img("photo-1473968512647-3e447244af8f"), img("photo-1508610048659-a06b669e3321")],
    policies: pol({ depositPaise: 2500000, latePaise: 80000, latePeriod: "day", grace: 60, capPaise: 2500000 }),
    variants: [v("DJI-MINI3-FLY", "Fly More Combo", 3, { day: 350000, week: 1800000, month: 5500000 })],
  },
  // audio (4)
  {
    sku: "QSC-K122", name: "QSC K12.2 Active PA Speaker", category: "audio", brand: "QSC", tax: "GST18",
    description: "2000W powered loudspeaker.",
    images: [img("photo-1545454675-3531b543be5d"), img("photo-1493225457124-a3eb161ffa5f")],
    policies: pol({ depositPaise: 800000, latePaise: 40000, latePeriod: "day", grace: 120 }),
    variants: [
      v("QSC-K122-SINGLE", "Single", 8, { hour: 12000, day: 60000, week: 320000, month: 1000000 }, { config: "Single" }),
      v("QSC-K122-PAIR", "Stereo Pair", 3, { hour: 22000, day: 110000, week: 600000, month: 1900000 }, { config: "Pair" }),
    ],
  },
  {
    sku: "SHURE-BLX", name: "Shure BLX Wireless Mic Kit", category: "audio", brand: "Shure", tax: "GST18",
    description: "Dual handheld wireless for panels and weddings.",
    images: [img("photo-1598488035139-bdbb2231ce04"), img("photo-1516280440614-6697288d5d38")],
    policies: pol({ depositPaise: 400000, latePaise: 25000, latePeriod: "day", grace: 120 }),
    variants: [v("SHURE-BLX-DUAL", "Dual Handheld", 6, { hour: 8000, day: 40000, week: 220000, month: 700000 })],
  },
  {
    sku: "YAMAHA-MG12", name: "Yamaha MG12XU Mixer", category: "audio", brand: "Yamaha", tax: "GST18",
    description: "12-channel analog mixer with USB and effects.",
    images: [img("photo-1598488035139-bdbb2231ce04"), img("photo-1511379938547-c1f69419868d")],
    policies: pol({ depositPaise: 350000, latePaise: 20000, latePeriod: "day", grace: 180 }),
    variants: [v("YAMAHA-MG12-STD", "Standard", 5, { day: 45000, week: 220000, month: 700000 })],
  },
  {
    sku: "SENN-EW100", name: "Sennheiser EW 100 Lav Kit", category: "audio", brand: "Sennheiser", tax: "GST18",
    description: "Lavalier wireless kit for interviews and corporate.",
    images: [img("photo-1590602847861-f357a9332bbc"), img("photo-1484704849700-f032a568e944")],
    policies: pol({ depositPaise: 500000, latePaise: 30000, latePeriod: "day", grace: 120 }),
    variants: [v("SENN-EW100-LAV", "Lav + Bodypack", 7, { day: 55000, week: 280000, month: 900000 })],
  },
  // events (4)
  {
    sku: "CHAUVET-PAR8", name: "LED PAR Stage Lighting Set", category: "events", brand: "Chauvet", tax: "GST18",
    description: "Eight RGBW PAR cans with DMX controller.",
    images: [img("photo-1470229722913-7c0e2dbbafd3"), img("photo-1516450360452-9312f5e86fc7")],
    policies: pol({ depositBps: 3000, latePaise: 50000, latePeriod: "day", grace: 240, capPaise: 1500000 }),
    variants: [v("CHAUVET-PAR8-KIT", "8-Fixture Kit", 3, { day: 150000, week: 800000, month: 2600000 })],
  },
  {
    sku: "PROJ-4K", name: "4K Laser Projector", category: "events", brand: "Optoma", tax: "GST18",
    description: "Bright laser projector with HDMI and screen option.",
    images: [img("photo-1478720568477-152d9b164e26"), img("photo-1593784991095-a205069470b6")],
    policies: pol({ depositPaise: 2000000, latePaise: 60000, latePeriod: "day", grace: 120 }),
    variants: [
      v("PROJ-4K-BODY", "Projector Only", 4, { day: 200000, week: 1000000, month: 3200000 }),
      v("PROJ-4K-SCREEN", "Projector + 120in Screen", 2, { day: 280000, week: 1400000, month: 4200000 }),
    ],
  },
  {
    sku: "FOG-HEAVY", name: "Heavy Duty Fog Machine", category: "events", brand: "Antari", tax: "GST12",
    description: "Stage fogger with fluid for one show night.",
    images: [img("photo-1514525253161-7a46d19cd819"), img("photo-1459749411175-04bf5292ceea")],
    policies: pol({ depositPaise: 200000, latePaise: 10000, latePeriod: "day", grace: 240 }),
    variants: [v("FOG-HEAVY-STD", "Standard + Fluid", 8, { day: 35000, week: 150000, month: 450000 })],
  },
  {
    sku: "TRUSS-3M", name: "Aluminum Truss 3m Section", category: "events", brand: "Global", tax: "GST18",
    description: "Square truss section for lighting hangs. Safety rated.",
    images: [img("photo-1501386761578-eac5c94b800a"), img("photo-1493225457124-a3eb161ffa5f")],
    policies: pol({ depositPaise: 600000, latePaise: 25000, latePeriod: "day", grace: 360 }),
    variants: [v("TRUSS-3M-SQ", "3m Square", 12, { day: 40000, week: 180000, month: 550000 })],
  },
  // power-tools (3)
  {
    sku: "DEWALT-SDS", name: "DeWalt SDS Rotary Hammer", category: "power-tools", brand: "DeWalt", tax: "GST18",
    description: "SDS-plus rotary hammer for concrete.",
    images: [img("photo-1504148455328-c376907d081c"), img("photo-1581094794329-cd11d7054bea")],
    policies: pol({ depositPaise: 300000, latePaise: 15000, latePeriod: "day", grace: 240 }),
    variants: [v("DEWALT-SDS-KIT", "Standard + Bit Set", 10, { day: 40000, week: 200000, month: 650000 })],
  },
  {
    sku: "MAKITA-CIRC", name: "Makita Circular Saw", category: "power-tools", brand: "Makita", tax: "GST18",
    description: "7-1/4 inch circular saw with blade.",
    images: [img("photo-1572981779307-38b8cabb2407"), img("photo-1504148455328-c376907d081c")],
    policies: pol({ depositPaise: 250000, latePaise: 12000, latePeriod: "day", grace: 240 }),
    variants: [v("MAKITA-CIRC-STD", "Standard", 8, { day: 30000, week: 140000, month: 450000 })],
  },
  {
    sku: "BOSCH-LASER", name: "Bosch Cross-Line Laser", category: "power-tools", brand: "Bosch", tax: "GST12",
    description: "Self-leveling laser level with tripod.",
    images: [img("photo-1581092160562-40aa08e78837"), img("photo-1581092918056-0c4c3acd3789")],
    policies: pol({ depositPaise: 180000, latePaise: 8000, latePeriod: "day", grace: 360 }),
    variants: [v("BOSCH-LASER-KIT", "Laser + Tripod", 6, { day: 25000, week: 110000, month: 350000 })],
  },
  // outdoor (3)
  {
    sku: "COLEMAN-DOME4", name: "4-Person Dome Tent", category: "outdoor", brand: "Coleman", tax: "GST5",
    description: "Weatherproof tent with rainfly and footprint.",
    images: [img("photo-1504280390367-361c6d9f38f4"), img("photo-1478131143081-80f7f84ca84d")],
    policies: pol({ depositPaise: 150000, latePaise: 10000, latePeriod: "day", grace: 720 }),
    variants: [v("COLEMAN-DOME4-STD", "Tent + Footprint", 12, { day: 25000, week: 130000, month: 400000 })],
  },
  {
    sku: "YETI-45", name: "Yeti Tundra 45 Cooler", category: "outdoor", brand: "Yeti", tax: "GST12",
    description: "Insulated cooler for outdoor events.",
    images: [img("photo-1523987355523-c7b5b0dd90a7"), img("photo-1478131143081-80f7f84ca84d")],
    policies: pol({ depositPaise: 200000, latePaise: 8000, latePeriod: "day", grace: 480 }),
    variants: [v("YETI-45-STD", "45qt", 8, { day: 20000, week: 90000, month: 280000 })],
  },
  {
    sku: "PATAG-2P", name: "2-Person Backpacking Tent", category: "outdoor", brand: "Patagonia", tax: "GST5",
    description: "Ultralight 2-person tent for treks.",
    images: [img("photo-1504280390367-361c6d9f38f4"), img("photo-1523987355523-c7b5b0dd90a7")],
    policies: pol({ depositPaise: 220000, latePaise: 12000, latePeriod: "day", grace: 720 }),
    variants: [v("PATAG-2P-STD", "Standard", 6, { day: 35000, week: 160000, month: 480000 })],
  },
  // furniture (3)
  {
    sku: "CHIAVARI-10", name: "Chiavari Chairs (Set of 10)", category: "furniture", brand: "Signature", tax: "GST18",
    description: "Gold resin Chiavari chairs with cushions.",
    images: [img("photo-1519167758481-83f550bb49b3"), img("photo-1464366400600-7168b8af9bc3")],
    policies: pol({ depositBps: 2500, latePaise: 30000, latePeriod: "day", grace: 240, capPaise: 900000 }),
    variants: [v("CHIAVARI-10-GOLD", "Set of 10 · Gold", 20, { day: 90000, week: 450000, month: 1500000 }, { color: "Gold" })],
  },
  {
    sku: "TABLE-6FT", name: "6ft Banquet Table", category: "furniture", brand: "Lifetime", tax: "GST18",
    description: "Folding banquet table, seats 6–8.",
    images: [img("photo-1414235077428-338989a2e8c0"), img("photo-1519167758481-83f550bb49b3")],
    policies: pol({ depositPaise: 100000, latePaise: 5000, latePeriod: "day", grace: 360 }),
    variants: [v("TABLE-6FT-WHT", "White Top", 25, { day: 15000, week: 70000, month: 220000 })],
  },
  {
    sku: "SOFA-LOUNGE", name: "Lounge Sofa (3-Seater)", category: "furniture", brand: "Urban", tax: "GST18",
    description: "Event lounge sofa, charcoal fabric.",
    images: [img("photo-1555041469-a586c61ea9bc"), img("photo-1493663284031-b7e3aefcae8e")],
    policies: pol({ depositPaise: 500000, latePaise: 25000, latePeriod: "day", grace: 240 }),
    variants: [v("SOFA-LOUNGE-CHR", "Charcoal", 4, { day: 120000, week: 550000, month: 1600000 })],
  },
];

/** Expand hero catalog to PRODUCT_TARGET SKUs for list/browse demos. */
function buildCatalogProducts() {
  const out = [...PRODUCTS];
  const brands = ["Apex", "Nova", "Summit", "Orbit", "Pulse", "Forge", "Cedar", "Beacon"];
  const imgs = [
    img("photo-1516035069371-29a1b244cc32"),
    img("photo-1502920917128-1aa500764cbd"),
    img("photo-1555041469-a586c61ea9bc"),
    img("photo-1414235077428-338989a2e8c0"),
    img("photo-1473968512647-3e447244af8f"),
  ];
  let n = 1;
  while (out.length < PRODUCT_TARGET) {
    const cat = CATEGORIES[(n - 1) % CATEGORIES.length];
    const dayRate = 12000 + (n % 48) * 2500;
    const latePaise = Math.max(2500, Math.round(dayRate * 0.2));
    const sku = `GEN-${cat.code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)}-${String(n).padStart(3, "0")}`;
    out.push({
      sku,
      name: `${brands[n % brands.length]} ${cat.name.split(" ")[0]} ${n}`,
      category: cat.code,
      brand: brands[n % brands.length],
      tax: n % 7 === 0 ? "GST12" : n % 11 === 0 ? "GST5" : "GST18",
      description: `Seed catalog item #${n} in ${cat.name} for browse/admin demos.`,
      images: [imgs[n % imgs.length], imgs[(n + 2) % imgs.length]],
      policies: pol({
        depositPaise: Math.round(dayRate * 2.5),
        latePaise,
        latePeriod: "day",
        grace: 60 + (n % 3) * 30,
        capPaise: Math.round(dayRate * 10),
      }),
      variants: [
        v(`${sku}-STD`, "Standard", 2 + (n % 6), {
          day: dayRate,
          week: dayRate * 5,
          month: dayRate * 18,
        }),
      ],
    });
    n += 1;
  }
  return out;
}

/** Hard wipe all rental domain docs for this tenant before reseeding. */
async function wipeTenantData(tenantId) {
  const filter = { tenantId };
  const ops = [
    RentalOrder.deleteMany(filter),
    RentalInvoice.deleteMany(filter),
    RentalPayment.deleteMany(filter),
    RentalDepositEntry.deleteMany(filter),
    RentalAllocation.deleteMany(filter),
    RentalShipment.deleteMany(filter),
    RentalDeliveryQuote.deleteMany(filter),
    RentalNotification.deleteMany(filter),
    RentalOtpChallenge.deleteMany(filter),
    RentalCart.deleteMany(filter),
    RentalRepairWorkOrder.deleteMany(filter),
    RentalIncident.deleteMany(filter),
    RentalMaintenanceBlock.deleteMany(filter),
    RentalAsset.deleteMany(filter),
    RentalRateEntry.deleteMany(filter),
    RentalVariant.deleteMany(filter),
    RentalProduct.deleteMany(filter),
    RentalCategory.deleteMany(filter),
    RentalCommercialPolicyVersion.deleteMany(filter),
    RentalPricelist.deleteMany(filter),
    RentalTaxCode.deleteMany(filter),
    RentalQuotationTemplate.deleteMany(filter),
    RentalCustomerAuth.deleteMany(filter),
    RentalIdentityClaim.deleteMany(filter),
    RentalCustomer.deleteMany(filter),
    RentalSettings.deleteMany(filter),
    RentalAuditEvent.deleteMany(filter),
    ProviderOperation.deleteMany(filter),
    RentalWebhookEvent.deleteMany(filter),
    RentalIdempotency.deleteMany(filter),
    RentalSeqCounter.deleteMany(filter),
    VbMembership.deleteMany({ tenantId }),
  ];
  await Promise.all(ops);
}

async function upsert(Model, filter, doc) {
  const existing = await Model.findOne(filter);
  if (existing) {
    existing.set(doc);
    await existing.save();
    return { doc: existing, created: false };
  }
  const created = await Model.create({ ...filter, ...doc });
  return { doc: created, created: true };
}

async function upsertAdminUser({ email, password, name, roles, tenantId }) {
  let user = await VbUser.findOne({ email }).select("+password");
  if (user) {
    user.password = password;
    user.name = name;
    user.isVerified = true;
    user.isActive = true;
    await user.save();
  } else {
    user = await VbUser.create({
      name,
      email,
      password,
      isVerified: true,
      isActive: true,
    });
  }
  await VbMembership.findOneAndUpdate(
    { userId: user._id, tenantId },
    { $set: { userId: user._id, tenantId, roles, status: "active" } },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return user;
}

async function upsertCustomer(tenantId, {
  customerNumber,
  displayName,
  type = "person",
  email,
  phone,
  password,
  status = "active",
  statusReason,
  gstin,
  notes,
  addresses,
}) {
  let customer = await RentalCustomer.findOne({ tenantId, customerNumber });
  const emailMasked = email ? `***${email.slice(-6)}` : null;
  const phoneMasked = phone ? `***${phone.slice(-4)}` : null;
  const addressDocs = (addresses || []).map((a) => ({
    type: a.type || "service",
    label: a.label || "Home",
    recipient: a.recipient || displayName,
    phone: a.phone || phone || null,
    line1: a.line1,
    line2: a.line2 || "",
    city: a.city,
    state: a.state,
    postalCode: a.postalCode,
    country: "IN",
    isDefault: Boolean(a.isDefault),
  }));
  if (!customer) {
    customer = await RentalCustomer.create({
      tenantId,
      customerNumber,
      type,
      displayName,
      emailMasked,
      phoneMasked,
      gstinMasked: gstin ? `***${gstin.slice(-4)}` : null,
      notes: notes || null,
      addresses: addressDocs,
      status,
      statusReason: statusReason || null,
      version: 0,
    });
  } else {
    customer.displayName = displayName;
    customer.type = type;
    customer.emailMasked = emailMasked;
    customer.phoneMasked = phoneMasked;
    customer.status = status;
    customer.statusReason = statusReason || null;
    if (notes !== undefined) customer.notes = notes;
    if (addressDocs.length) customer.addresses = addressDocs;
    await customer.save();
  }
  if (email) {
    await upsert(
      RentalIdentityClaim,
      { tenantId, claimType: "email", normalizedValue: email.toLowerCase() },
      { customerId: customer._id, state: "active" }
    );
  }
  if (phone) {
    await upsert(
      RentalIdentityClaim,
      { tenantId, claimType: "phone", normalizedValue: phone },
      { customerId: customer._id, state: "active" }
    );
  }
  if (gstin) {
    await upsert(
      RentalIdentityClaim,
      { tenantId, claimType: "gstin", normalizedValue: gstin.toUpperCase() },
      { customerId: customer._id, state: "active" }
    );
  }
  if (email && password) {
    let auth =
      (await RentalCustomerAuth.findOne({ tenantId, customerId: customer._id })) ||
      (await RentalCustomerAuth.findOne({ tenantId, email: email.toLowerCase() })) ||
      (phone ? await RentalCustomerAuth.findOne({ tenantId, phone }) : null);
    if (!auth) {
      await RentalCustomerAuth.create({
        tenantId,
        customerId: customer._id,
        email: email.toLowerCase(),
        phone: phone || null,
        password,
      });
    } else {
      auth.customerId = customer._id;
      auth.email = email.toLowerCase();
      if (phone) auth.phone = phone;
      auth.password = password;
      await auth.save();
    }
  }
  return customer;
}

function hoursFromNow(h) {
  return new Date(Date.now() + h * 3600 * 1000);
}
function hoursAgo(h) {
  return hoursFromNow(-h);
}
function daysFromNow(d) {
  return hoursFromNow(d * 24);
}
function daysAgo(d) {
  return hoursFromNow(-d * 24);
}

/** Extra overdue rows for list stress — keep small; real dues live on R-DUE-* below. */
const BULK_OVERDUE_COUNT = 8;
const BULK_OVERDUE_SPAN_DAYS = 30;
const BULK_CUSTOMER_COUNT = 8;
const BULK_CUSTOMER_NAMES = [
  "Aarav Mehta", "Diya Shah", "Kabir Nair", "Ananya Iyer", "Rohan Desai",
  "Isha Reddy", "Yash Patel", "Myra Banerjee", "Arjun Khanna", "Sara Quinn",
  "Dev Malhotra", "Kiara Bose", "Nikhil Rao", "Pooja Menon", "Harsh Gupta",
  "Tara Sen", "Aditya Pillai", "Meera Das", "Kunal Jain", "Rhea Capoor",
];

async function upsertRental(tenantId, spec, variantBySku, customersByNumber) {
  const customer = customersByNumber[spec.customerNumber];
  const variant = variantBySku[spec.variantSku];
  if (!customer || !variant) throw new Error(`Seed rental ${spec.rentalNumber}: missing customer/variant`);

  const dayRate = spec.ratePaise ?? 100000;
  const days = spec.billDays ?? 2;
  const preTax = dayRate * days * (spec.qty || 1);
  const gst = Math.round(preTax * 0.18);
  const deposit = spec.depositPaise ?? Math.round(preTax * 0.25);
  const paid = spec.paymentsPaise ?? 0;
  const lateFee = spec.lateFeePaise ?? 0;
  const lateGst = spec.lateGstPaise != null ? spec.lateGstPaise : Math.round(lateFee * 0.18);

  const lines = [{
    lineId: "L1",
    productId: variant.productId,
    variantId: variant._id,
    nameSnapshot: variant.name,
    quantity: spec.qty || 1,
    periodCode: "day",
    ratePaise: dayRate,
    linePreTaxPaise: preTax,
    lineGstPaise: gst,
    lineGrossPaise: preTax + gst,
    // So overdue invoices can emit per-day penalty lines (not just a lump total).
    lateSnapshot: {
      enabled: true,
      ratePaise: spec.lateRatePaise ?? Math.max(2500, Math.round(dayRate * 0.25)),
      periodCode: "day",
    },
    graceSnapshot: { minutes: 0 },
    capSnapshot: { mode: "fixed", valuePaise: spec.lateCapPaise ?? 500000 },
    taxSnapshot: { gstBps: 1800 },
  }];

  const body = {
    customerId: customer._id,
    customerSnapshot: {
      displayName: customer.displayName,
      customerNumber: customer.customerNumber,
      phone: customer.phoneMasked,
      email: customer.emailMasked,
    },
    status: spec.status,
    orderChannel: spec.orderChannel || "admin",
    startAt: spec.startAt,
    endAt: spec.endAt,
    plannedEndAt: spec.plannedEndAt || spec.endAt,
    actualIssuedAt: spec.actualIssuedAt || null,
    actualReturnedAt: spec.actualReturnedAt || null,
    timezone: "Asia/Kolkata",
    lines,
    notes: spec.notes || null,
    fulfillment: spec.fulfillment || { method: "pickup" },
    preTaxSubtotalPaise: preTax,
    bookedGstPaise: gst,
    chargeGrossPaise: spec.chargeGrossPaise ?? preTax + gst + lateFee + lateGst,
    paymentsPaise: paid,
    deductionsPaise: spec.deductionsPaise ?? 0,
    depositCollectedPaise: spec.depositCollectedPaise ?? (paid > 0 ? deposit : 0),
    depositLiabilityPaise: spec.depositLiabilityPaise ?? (["closed", "cancelled"].includes(spec.status) ? 0 : deposit),
    refundableDepositPaise: spec.refundableDepositPaise ?? 0,
    depositRefundsCompletedPaise: spec.depositRefundsCompletedPaise ?? 0,
    balanceDuePaise:
      spec.balanceDuePaise != null
        ? spec.balanceDuePaise
        : Math.max(0, preTax + gst + lateFee + lateGst - paid - (spec.deductionsPaise || 0)),
    lateFeePaise: lateFee,
    lateGstPaise: lateGst,
    damagePreTaxPaise: spec.damagePreTaxPaise ?? 0,
    damageGstPaise: spec.damageGstPaise ?? 0,
    settlementShortfallPaise: spec.settlementShortfallPaise ?? 0,
    depositSnapshot: { mode: "fixed", depositPaise: deposit, sourceLevel: "seed" },
    version: spec.version ?? 1,
  };

  const { doc } = await upsert(RentalOrder, { tenantId, rentalNumber: spec.rentalNumber }, body);
  return doc;
}

async function run() {
  const CATALOG = buildCatalogProducts();
  if (CATALOG.length < PRODUCT_TARGET) {
    throw new Error(`Need ${PRODUCT_TARGET} products, got ${CATALOG.length}`);
  }

  await connectDB();

  let tenant = await Tenant.findOne({ slug: SLUG });
  if (!tenant) {
    tenant = await Tenant.create({ name: TENANT_NAME, slug: SLUG, status: "active" });
  }
  const tenantId = tenant._id;

  console.log("Wiping existing rental data for tenant", SLUG, String(tenantId));
  await wipeTenantData(tenantId);

  await upsertAdminUser({
    email: DEMO_ADMIN_EMAIL,
    password: DEMO_ADMIN_PASSWORD,
    name: "Renton Admin",
    roles: [VB_ROLES.ADMIN],
    tenantId,
  });
  await upsertAdminUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    name: "Trushen Solanki",
    roles: [VB_ROLES.ADMIN],
    tenantId,
  });
  await upsertAdminUser({
    email: ADMIN2_EMAIL,
    password: ADMIN2_PASSWORD,
    name: "Solanki Trushen",
    roles: [VB_ROLES.ADMIN],
    tenantId,
  });

  await upsert(RentalSettings, { tenantId }, {
    timezone: "Asia/Kolkata",
    numberingPrefix: "RENT",
    paymentPolicy: "prepaid",
    dueWindowMinutes: 60,
    version: 0,
  });

  await upsert(RentalQuotationTemplate, { tenantId, code: "DEFAULT" }, {
    name: "Default quote",
    headerText: "Renton Rentals",
    footerText: "Thank you for renting with us.",
    isDefault: true,
    status: "active",
  });

  const pricelist = (
    await upsert(RentalPricelist, { tenantId, code: "DEFAULT" }, {
      name: "Default INR Pricelist",
      currency: "INR",
      isDefault: true,
      status: "active",
      effectiveFrom: EPOCH,
    })
  ).doc;

  const categoryByCode = {};
  for (const c of CATEGORIES) {
    categoryByCode[c.code] = (
      await upsert(RentalCategory, { tenantId, code: c.code }, { name: c.name, sortOrder: c.sortOrder, status: "active" })
    ).doc;
  }

  const taxByCode = {};
  for (const t of [
    { code: "GST5", name: "GST 5%", rateBps: 500 },
    { code: "GST12", name: "GST 12%", rateBps: 1200 },
    { code: "GST18", name: "GST 18%", rateBps: 1800 },
  ]) {
    taxByCode[t.code] = (
      await upsert(RentalTaxCode, { tenantId, code: t.code }, {
        name: t.name,
        rateBps: t.rateBps,
        mode: "exclusive",
        jurisdiction: "IN",
        status: "active",
        effectiveFrom: EPOCH,
      })
    ).doc;
  }

  const variantBySku = {};
  let assetCount = 0;
  for (const p of CATALOG) {
    const tax = taxByCode[p.tax] || taxByCode.GST18;
    const product = (
      await upsert(RentalProduct, { tenantId, productSku: p.sku }, {
        name: p.name,
        categoryId: categoryByCode[p.category]._id,
        taxClassId: tax._id,
        description: p.description,
        brand: p.brand,
        images: p.images,
        policies: p.policies,
        status: "active",
      })
    ).doc;

    for (const vv of p.variants) {
      const variant = (
        await upsert(RentalVariant, { tenantId, variantSku: vv.sku }, {
          productId: product._id,
          variantSignature: vv.sku.toLowerCase(),
          name: vv.name,
          attributes: vv.attributes || {},
          defaultPeriodCode: "day",
          status: "active",
        })
      ).doc;
      variantBySku[vv.sku] = variant;

      for (const [periodCode, ratePaise] of Object.entries(vv.rates)) {
        await upsert(
          RentalRateEntry,
          { tenantId, pricelistId: pricelist._id, targetType: "variant", targetId: variant._id, periodCode },
          { ratePaise, minimumBillingMinutes: 0, status: "active", effectiveFrom: EPOCH }
        );
      }

      for (let i = 1; i <= vv.units; i++) {
        const code = `${vv.sku}-${String(i).padStart(4, "0")}`;
        const existing = await RentalAsset.findOne({ tenantId, assetCode: code });
        if (!existing) {
          await RentalAsset.create({
            tenantId,
            assetCode: code,
            variantId: variant._id,
            productId: product._id,
            condition: "good",
            state: ASSET_STATE.AVAILABLE,
            locationId: "default",
          });
        }
        assetCount += 1;
      }
    }
  }

  await upsert(
    RentalCommercialPolicyVersion,
    { tenantId, scopeType: "organization", scopeId: null, policyType: "tax" },
    { policy: { gstBps: 1800 }, status: "active", effectiveFrom: EPOCH }
  );
  await upsert(
    RentalCommercialPolicyVersion,
    { tenantId, scopeType: "organization", scopeId: null, policyType: "deposit" },
    { policy: { mode: "percentage", valueBps: 2500 }, status: "active", effectiveFrom: EPOCH }
  );
  await upsert(
    RentalCommercialPolicyVersion,
    { tenantId, scopeType: "organization", scopeId: null, policyType: "late" },
    { policy: { ratePaise: 20000, periodCode: "day" }, status: "active", effectiveFrom: EPOCH }
  );
  await upsert(
    RentalCommercialPolicyVersion,
    { tenantId, scopeType: "organization", scopeId: null, policyType: "grace" },
    { policy: { graceMinutes: 120, minutes: 120 }, status: "active", effectiveFrom: EPOCH }
  );
  await upsert(
    RentalCommercialPolicyVersion,
    { tenantId, scopeType: "organization", scopeId: null, policyType: "cap" },
    { policy: { mode: "fixed", valuePaise: 500000 }, status: "active", effectiveFrom: EPOCH }
  );

  const customers = {};
  // Portal + dues customers for the two admin emails (same password as admin login).
  customers["CUST-ADMIN-1"] = await upsertCustomer(tenantId, {
    customerNumber: "CUST-ADMIN-1",
    displayName: "Trushen Solanki",
    email: ADMIN_EMAIL,
    phone: "+919876543210",
    password: ADMIN_PASSWORD,
    notes: "Primary admin also used as portal customer for dues demos",
    addresses: [{
      label: "Home",
      line1: "14 Residency Road",
      city: "Bengaluru",
      state: "KA",
      postalCode: "560025",
      isDefault: true,
    }],
  });
  customers["CUST-ADMIN-2"] = await upsertCustomer(tenantId, {
    customerNumber: "CUST-ADMIN-2",
    displayName: "Solanki Trushen",
    email: ADMIN2_EMAIL,
    phone: "+919876543211",
    password: ADMIN2_PASSWORD,
    notes: "Second admin / portal customer with open dues rental",
    addresses: [{
      label: "Home",
      line1: "22 Koramangala 5th Block",
      city: "Bengaluru",
      state: "KA",
      postalCode: "560095",
      isDefault: true,
    }],
  });

  customers["CUST-000001"] = await upsertCustomer(tenantId, {
    customerNumber: "CUST-000001",
    displayName: "Demo Customer",
    email: CUSTOMER_EMAIL,
    phone: CUSTOMER_PHONE,
    password: CUSTOMER_PASSWORD,
    notes: "Primary portal demo account",
    addresses: [{
      label: "Home",
      line1: "12 MG Road",
      line2: "Near Metro",
      city: "Bengaluru",
      state: "KA",
      postalCode: "560001",
      isDefault: true,
    }],
  });

  customers["CUST-000002"] = await upsertCustomer(tenantId, {
    customerNumber: "CUST-000002",
    displayName: "Priya Sharma",
    email: CUSTOMER2_EMAIL,
    phone: CUSTOMER2_PHONE,
    password: CUSTOMER2_PASSWORD,
    addresses: [{
      label: "Home",
      line1: "45 Indiranagar 100 Feet Rd",
      city: "Bengaluru",
      state: "KA",
      postalCode: "560038",
      isDefault: true,
    }],
  });
  customers["CUST-000003"] = await upsertCustomer(tenantId, {
    customerNumber: "CUST-000003",
    displayName: "Walk-in Rahul",
    email: "rahul.walkin@renton.test",
    phone: "+919000000003",
    password: CUSTOMER_PASSWORD,
    notes: "Walk-in counter customer — invoice emails go to this address",
    addresses: [{
      label: "Pickup contact",
      fullName: "Rahul Mehta",
      phone: "+919000000003",
      line1: "Shop 3, Koramangala 5th Block",
      city: "Bengaluru",
      state: "KA",
      postalCode: "560095",
      isDefault: true,
    }],
  });
  customers["CUST-000004"] = await upsertCustomer(tenantId, {
    customerNumber: "CUST-000004",
    displayName: "Acme Events Pvt Ltd",
    type: "business",
    email: "ops@acme-events.test",
    phone: "+919000000004",
    gstin: "29AAAAA0000A1Z5",
    notes: "Corporate event client",
    addresses: [{
      label: "Office",
      type: "billing",
      recipient: "Accounts — Acme Events",
      line1: "8th Floor, Prestige Towers",
      city: "Bengaluru",
      state: "KA",
      postalCode: "560025",
      isDefault: true,
    }, {
      label: "Venue store",
      type: "service",
      line1: "Palace Grounds Gate 2",
      city: "Bengaluru",
      state: "KA",
      postalCode: "560080",
    }],
  });
  customers["CUST-000005"] = await upsertCustomer(tenantId, {
    customerNumber: "CUST-000005",
    displayName: "Blocked Tester",
    email: "blocked@renton.test",
    phone: "+919000000005",
    password: CUSTOMER_PASSWORD,
    status: "blocked",
    statusReason:
      "Blocked after unpaid late fees and open balance on R-DEMO-BLOCKED (overdue return + deposit shortfall).",
    notes: "Do not rent until outstanding balance is cleared.",
    addresses: [{
      label: "Home",
      line1: "9 Indira Nagar Stage 2",
      city: "Bengaluru",
      state: "KA",
      postalCode: "560038",
      isDefault: true,
    }],
  });
  customers["CUST-000006"] = await upsertCustomer(tenantId, {
    customerNumber: "CUST-000006",
    displayName: "Neha Kapoor",
    email: "neha.kapoor@renton.test",
    phone: "+919000000006",
    password: CUSTOMER_PASSWORD,
    notes: "Repeat camera renter — overdue rental with late fee for UI testing",
    addresses: [{
      label: "Home",
      fullName: "Neha Kapoor",
      phone: "+919000000006",
      line1: "221B Residency Road",
      line2: "Apartment 4B",
      city: "Bengaluru",
      state: "KA",
      postalCode: "560025",
      isDefault: true,
    }],
  });
  customers["CUST-000007"] = await upsertCustomer(tenantId, {
    customerNumber: "CUST-000007",
    displayName: "Vikram Joshi",
    email: "vikram.joshi@renton.test",
    phone: "+919000000007",
    password: CUSTOMER_PASSWORD,
    notes: "Closed rental with late fee + final invoice (email + penalty path)",
    addresses: [{
      label: "Home",
      fullName: "Vikram Joshi",
      phone: "+919000000007",
      line1: "14 HSR Layout Sector 2",
      city: "Bengaluru",
      state: "KA",
      postalCode: "560102",
      isDefault: true,
    }],
  });

  const rentals = [
    {
      rentalNumber: "R-DEMO-DRAFT",
      customerNumber: "CUST-000001",
      variantSku: "GOPRO-12-KIT",
      status: RENTAL_STATUS.DRAFT,
      startAt: daysFromNow(3),
      endAt: daysFromNow(5),
      ratePaise: 30000,
      paymentsPaise: 0,
      notes: "Draft booking for admin walkthrough",
    },
    {
      rentalNumber: "R-DEMO-RESERVED",
      customerNumber: "CUST-000002",
      variantSku: "SHURE-BLX-DUAL",
      status: RENTAL_STATUS.RESERVED,
      startAt: daysFromNow(2),
      endAt: daysFromNow(4),
      ratePaise: 40000,
      paymentsPaise: 0,
    },
    {
      rentalNumber: "R-DEMO-CONFIRMED",
      customerNumber: "CUST-000003",
      variantSku: "COLEMAN-DOME4-STD",
      status: RENTAL_STATUS.CONFIRMED,
      startAt: (() => { const d = new Date(); d.setHours(10, 0, 0, 0); return d; })(),
      endAt: daysFromNow(2),
      ratePaise: 25000,
      paymentsPaise: 59000,
      depositCollectedPaise: 15000,
      depositLiabilityPaise: 15000,
      fulfillment: { method: "pickup", paymentStatus: "paid" },
    },
    {
      rentalNumber: "R-DEMO-DISPATCH",
      customerNumber: "CUST-000004",
      variantSku: "QSC-K122-PAIR",
      status: RENTAL_STATUS.DISPATCH_PENDING,
      startAt: daysFromNow(0),
      endAt: daysFromNow(3),
      ratePaise: 110000,
      billDays: 3,
      paymentsPaise: 450000,
      depositCollectedPaise: 80000,
      depositLiabilityPaise: 80000,
      fulfillment: {
        method: "delivery",
        paymentStatus: "paid",
        deliveryPromise: { mock: true, message: "We'll deliver to you in 4–5 days", estimatedMinDays: 4, estimatedMaxDays: 5 },
      },
    },
    {
      rentalNumber: "R-DEMO-ONWAY",
      customerNumber: "CUST-000007",
      variantSku: "SONY-FX3-BODY",
      status: RENTAL_STATUS.DISPATCH_PENDING,
      startAt: daysFromNow(0),
      endAt: daysFromNow(4),
      ratePaise: 250000,
      billDays: 4,
      paymentsPaise: 1200000,
      depositCollectedPaise: 300000,
      depositLiabilityPaise: 300000,
      fulfillment: {
        method: "delivery",
        paymentStatus: "paid",
        deliveryPromise: {
          mock: true,
          message: "Courier en route — ETA today",
          estimatedMinDays: 0,
          estimatedMaxDays: 1,
          status: "in_transit",
        },
      },
      notes: "Out for delivery — use detail page tracking timeline",
    },
    {
      rentalNumber: "R-DEMO-ACTIVE",
      customerNumber: "CUST-000001",
      variantSku: "SONY-FX3-BODY",
      status: RENTAL_STATUS.ACTIVE,
      startAt: daysAgo(1),
      endAt: daysFromNow(2),
      plannedEndAt: daysFromNow(2),
      actualIssuedAt: daysAgo(1),
      ratePaise: 250000,
      paymentsPaise: 650000,
      depositCollectedPaise: 300000,
      depositLiabilityPaise: 300000,
    },
    {
      rentalNumber: "R-DEMO-DUE",
      customerNumber: "CUST-000002",
      variantSku: "DEWALT-SDS-KIT",
      status: RENTAL_STATUS.ACTIVE,
      startAt: daysAgo(2),
      endAt: (() => { const d = new Date(); d.setHours(18, 0, 0, 0); return d; })(),
      plannedEndAt: (() => { const d = new Date(); d.setHours(18, 0, 0, 0); return d; })(),
      actualIssuedAt: daysAgo(2),
      ratePaise: 40000,
      paymentsPaise: 110000,
      depositCollectedPaise: 30000,
      depositLiabilityPaise: 30000,
    },
    {
      rentalNumber: "R-DEMO-OVERDUE",
      customerNumber: "CUST-000006",
      variantSku: "CANON-70200-STD",
      status: RENTAL_STATUS.OVERDUE,
      startAt: daysAgo(5),
      endAt: daysAgo(2),
      plannedEndAt: daysAgo(2),
      actualIssuedAt: daysAgo(5),
      ratePaise: 110000,
      billDays: 3,
      paymentsPaise: 350000,
      depositCollectedPaise: 120000,
      depositLiabilityPaise: 120000,
      lateFeePaise: 80000,
    },
    {
      rentalNumber: "R-DEMO-RETURNED",
      customerNumber: "CUST-000003",
      variantSku: "TABLE-6FT-WHT",
      status: RENTAL_STATUS.RETURNED,
      startAt: daysAgo(4),
      endAt: daysAgo(1),
      plannedEndAt: daysAgo(1),
      actualIssuedAt: daysAgo(4),
      actualReturnedAt: daysAgo(0),
      ratePaise: 15000,
      billDays: 3,
      paymentsPaise: 60000,
      depositCollectedPaise: 10000,
      depositLiabilityPaise: 10000,
    },
    {
      rentalNumber: "R-DEMO-CLOSED",
      customerNumber: "CUST-000004",
      variantSku: "CHIAVARI-10-GOLD",
      status: RENTAL_STATUS.CLOSED,
      startAt: daysAgo(14),
      endAt: daysAgo(12),
      plannedEndAt: daysAgo(12),
      actualIssuedAt: daysAgo(14),
      actualReturnedAt: daysAgo(12),
      ratePaise: 90000,
      billDays: 2,
      paymentsPaise: 280000,
      depositCollectedPaise: 50000,
      depositLiabilityPaise: 0,
      depositRefundsCompletedPaise: 50000,
      refundableDepositPaise: 0,
      balanceDuePaise: 0,
    },
    {
      rentalNumber: "R-DEMO-PENALTY",
      customerNumber: "CUST-000007",
      variantSku: "TABLE-6FT-WHT",
      status: RENTAL_STATUS.CLOSED,
      startAt: daysAgo(10),
      endAt: daysAgo(7),
      plannedEndAt: daysAgo(7),
      actualIssuedAt: daysAgo(10),
      actualReturnedAt: daysAgo(5),
      ratePaise: 15000,
      billDays: 3,
      paymentsPaise: 70000,
      depositCollectedPaise: 10000,
      depositLiabilityPaise: 0,
      depositRefundsCompletedPaise: 0,
      deductionsPaise: 10000,
      lateFeePaise: 30000,
      lateGstPaise: 3600,
      chargeGrossPaise: 88600,
      balanceDuePaise: 18600,
      settlementShortfallPaise: 18600,
      notes: "Returned 2 days late — late fee applied; invoice emailed to customer",
    },
    {
      rentalNumber: "R-DEMO-BLOCKED",
      customerNumber: "CUST-000005",
      variantSku: "SONY-FX3-BODY",
      status: RENTAL_STATUS.CLOSED,
      startAt: daysAgo(20),
      endAt: daysAgo(16),
      plannedEndAt: daysAgo(16),
      actualIssuedAt: daysAgo(20),
      actualReturnedAt: daysAgo(12),
      ratePaise: 250000,
      billDays: 4,
      paymentsPaise: 400000,
      depositCollectedPaise: 50000,
      depositLiabilityPaise: 0,
      depositRefundsCompletedPaise: 0,
      deductionsPaise: 50000,
      lateFeePaise: 120000,
      lateGstPaise: 21600,
      chargeGrossPaise: 1141600,
      balanceDuePaise: 741600,
      settlementShortfallPaise: 741600,
      notes: "Returned 4 days late; deposit did not cover late fees — account blocked",
    },
    // --- Proper dues under master-invoice model (open balances for UI) ---
    {
      rentalNumber: "R-DUE-OVERDUE",
      customerNumber: "CUST-ADMIN-1",
      variantSku: "TABLE-6FT-WHT",
      status: RENTAL_STATUS.OVERDUE,
      startAt: daysAgo(8),
      endAt: daysAgo(5),
      plannedEndAt: daysAgo(5),
      actualIssuedAt: daysAgo(8),
      ratePaise: 15000,
      billDays: 3,
      // Charge payments = rent only (deposit tracked separately).
      paymentsPaise: 53100,
      depositCollectedPaise: 10000,
      depositLiabilityPaise: 10000,
      lateFeePaise: 45000,
      lateGstPaise: 8100,
      notes: "Open overdue dues — master invoice shows overdue penalty lines",
    },
    {
      rentalNumber: "R-DUE-INSPECT",
      customerNumber: "CUST-ADMIN-2",
      variantSku: "CANON-70200-STD",
      status: RENTAL_STATUS.INSPECTION,
      startAt: daysAgo(6),
      endAt: daysAgo(3),
      plannedEndAt: daysAgo(3),
      actualIssuedAt: daysAgo(6),
      actualReturnedAt: daysAgo(1),
      ratePaise: 110000,
      billDays: 3,
      paymentsPaise: 389400,
      // Small deposit so late + damage still leave cash due after credit.
      depositCollectedPaise: 25000,
      depositLiabilityPaise: 25000,
      lateFeePaise: 80000,
      lateGstPaise: 14400,
      damagePreTaxPaise: 15000,
      damageGstPaise: 2700,
      notes: "Inspected after late return — Clear & close; cash still due after deposit",
    },
    {
      rentalNumber: "R-DUE-CLOSED",
      customerNumber: "CUST-ADMIN-1",
      variantSku: "GOPRO-12-KIT",
      status: RENTAL_STATUS.CLOSED,
      startAt: daysAgo(14),
      endAt: daysAgo(11),
      plannedEndAt: daysAgo(11),
      actualIssuedAt: daysAgo(14),
      // ~7 days late so late fee exceeds the ₹200 deposit credit.
      actualReturnedAt: daysAgo(4),
      ratePaise: 30000,
      billDays: 3,
      lateRatePaise: 10000,
      paymentsPaise: 106200,
      depositCollectedPaise: 20000,
      depositLiabilityPaise: 0,
      deductionsPaise: 20000,
      notes: "Closed with shortfall after deposit applied — Settle balance",
    },
  ];

  const rentalDocs = {};
  for (const spec of rentals) {
    rentalDocs[spec.rentalNumber] = await upsertRental(tenantId, spec, variantBySku, customers);
  }

  // Sync dues rentals from master-invoice math and write type=final invoices with overdue lines.
  for (const rentalNumber of ["R-DUE-OVERDUE", "R-DUE-INSPECT", "R-DUE-CLOSED"]) {
    const rental = rentalDocs[rentalNumber];
    if (!rental) continue;
    const parts = buildMasterInvoiceParts(rental);
    rental.lateFeePaise = parts.totals.lateFeePaise;
    rental.lateGstPaise = parts.totals.lateGstPaise;
    rental.chargeGrossPaise = parts.totals.chargeGrossPaise;
    rental.balanceDuePaise = parts.totals.finalPayablePaise;
    if (rental.status === RENTAL_STATUS.CLOSED) {
      rental.settlementShortfallPaise = parts.totals.finalPayablePaise;
    }
    await rental.save();
    const inv = await writeFinalInvoice(tenantId, rental);
    if (!(rental.invoiceIds || []).some((id) => String(id) === String(inv._id))) {
      rental.invoiceIds = [...(rental.invoiceIds || []), inv._id];
      await rental.save();
    }
    rentalDocs[rentalNumber] = rental;
    // Rent portion already reflected in paymentsPaise — record a captured charge payment for ledger UI.
    const rentPaid = Math.min(
      Number(rental.paymentsPaise || 0),
      Number(rental.preTaxSubtotalPaise || 0) + Number(rental.bookedGstPaise || 0),
    );
    if (rentPaid > 0) {
      await upsert(
        RentalPayment,
        { tenantId, rentalId: rental._id, reference: `SEED-PAY-${rentalNumber}` },
        {
          direction: PAYMENT_DIRECTION.CHARGE,
          method: "cash",
          amountPaise: Number(rental.paymentsPaise || rentPaid),
          allocation: {
            chargePaise: rentPaid,
            depositPaise: Math.max(0, Number(rental.paymentsPaise || 0) - rentPaid),
          },
          status: "captured",
          verifiedAt: rental.startAt || new Date(),
          reason: "Seed dues rental payment",
        },
      );
    }
    if (rental.depositCollectedPaise > 0) {
      await upsert(
        RentalDepositEntry,
        {
          tenantId,
          rentalId: rental._id,
          idempotencyKey: `seed-dep-collect-${rentalNumber}`,
          eventType: DEPOSIT_EVENT.COLLECTED,
        },
        {
          amountPaise: rental.depositCollectedPaise,
          state: "posted",
          reason: "Seed deposit collect",
          actorId: "seed",
          createdAt: rental.startAt || new Date(),
        },
      );
    }
    if ((rental.deductionsPaise || 0) > 0) {
      await upsert(
        RentalDepositEntry,
        {
          tenantId,
          rentalId: rental._id,
          idempotencyKey: `seed-dep-apply-${rentalNumber}`,
          eventType: DEPOSIT_EVENT.APPLIED,
        },
        {
          amountPaise: rental.deductionsPaise,
          state: "posted",
          reason: "penalty_settlement",
          actorId: "seed",
          createdAt: rental.actualReturnedAt || new Date(),
        },
      );
    }
  }

  // Bulk overdue worklist: 100 rentals with staggered due timestamps for pagination UI.
  for (let i = 1; i <= BULK_CUSTOMER_COUNT; i++) {
    const customerNumber = `CUST-BULK-${String(i).padStart(3, "0")}`;
    const displayName = BULK_CUSTOMER_NAMES[(i - 1) % BULK_CUSTOMER_NAMES.length];
    const phone = `+91910000${String(1000 + i).slice(-4)}`;
    customers[customerNumber] = await upsertCustomer(tenantId, {
      customerNumber,
      displayName,
      email: `bulk.${String(i).padStart(3, "0")}@renton.test`,
      phone,
      notes: "Bulk seed customer for overdue worklist pagination",
      addresses: [{
        label: "Home",
        fullName: displayName,
        phone,
        line1: `${10 + i} Seed Street`,
        city: "Bengaluru",
        state: "KA",
        postalCode: "560001",
        isDefault: true,
      }],
    });
  }

  const variantSkus = Object.keys(variantBySku);
  if (!variantSkus.length) throw new Error("No variants available for bulk overdue seed");

  const spanHours = BULK_OVERDUE_SPAN_DAYS * 24;
  for (let i = 1; i <= BULK_OVERDUE_COUNT; i++) {
    const n = String(i).padStart(3, "0");
    const customerNumber = `CUST-BULK-${String(((i - 1) % BULK_CUSTOMER_COUNT) + 1).padStart(3, "0")}`;
    const variantSku = variantSkus[(i - 1) % variantSkus.length];
    // Evenly spread due-backs across the last ~3 months with unique clock times.
    const hoursPast =
      1 + Math.floor(((i - 1) / Math.max(1, BULK_OVERDUE_COUNT - 1)) * (spanHours - 1));
    const plannedEndAt = hoursAgo(hoursPast);
    plannedEndAt.setMinutes((i * 17) % 60, (i * 29) % 60, 0);
    const startAt = hoursAgo(hoursPast + 48 + (i % 72));
    const lateFeePaise = 2500 + (i % 24) * 2500;
    const ratePaise = 25000 + (i % 12) * 7500;
    const billDays = 1 + (i % 5);
    const paymentsPaise = Math.round(ratePaise * billDays * 0.7);

    await upsertRental(
      tenantId,
      {
        rentalNumber: `R-DEMO-OD-${n}`,
        customerNumber,
        variantSku,
        status: RENTAL_STATUS.OVERDUE,
        startAt,
        endAt: plannedEndAt,
        plannedEndAt,
        actualIssuedAt: startAt,
        ratePaise,
        billDays,
        paymentsPaise,
        depositCollectedPaise: Math.round(ratePaise * 0.3),
        depositLiabilityPaise: Math.round(ratePaise * 0.3),
        lateFeePaise,
        notes: `Bulk overdue #${n} — due ${plannedEndAt.toISOString()}`,
      },
      variantBySku,
      customers,
    );
  }

  // Mark a few assets rented for ACTIVE
  const activeVariant = variantBySku["SONY-FX3-BODY"];
  if (activeVariant) {
    await RentalAsset.updateMany(
      { tenantId, variantId: activeVariant._id },
      { $set: { state: ASSET_STATE.AVAILABLE } }
    );
    const one = await RentalAsset.findOne({ tenantId, variantId: activeVariant._id }).sort({ assetCode: 1 });
    if (one) {
      one.state = ASSET_STATE.RENTED;
      await one.save();
    }
  }

  // Product-scoped late fees (vendor overrides) — visible in Penalties + product detail
  const sony = await RentalProduct.findOne({ tenantId, productSku: "SONY-FX3" }).lean();
  const table = await RentalProduct.findOne({ tenantId, productSku: "TABLE-6FT" }).lean();
  if (sony) {
    await upsert(
      RentalCommercialPolicyVersion,
      { tenantId, scopeType: "product", scopeId: String(sony._id), policyType: "late" },
      { policy: { ratePaise: 50000, periodCode: "hour" }, status: "active", effectiveFrom: EPOCH }
    );
  }
  if (table) {
    await upsert(
      RentalCommercialPolicyVersion,
      { tenantId, scopeType: "product", scopeId: String(table._id), policyType: "late" },
      { policy: { ratePaise: 15000, periodCode: "day" }, status: "active", effectiveFrom: EPOCH }
    );
  }

  // Invoice + payment + deposit for confirmed / closed / overdue / penalty
  for (const [rentalNumber, invType, paid] of [
    ["R-DEMO-CONFIRMED", "tax_invoice", true],
    ["R-DEMO-DISPATCH", "tax_invoice", true],
    ["R-DEMO-ONWAY", "tax_invoice", true],
    ["R-DEMO-ACTIVE", "tax_invoice", true],
    ["R-DEMO-OVERDUE", "tax_invoice", true],
    ["R-DEMO-CLOSED", "final", true],
    ["R-DEMO-PENALTY", "final", true],
    ["R-DEMO-BLOCKED", "final", true],
  ]) {
    const rental = rentalDocs[rentalNumber];
    if (!rental) continue;
    const invNum = `INV-${rentalNumber}`;
    const invoice = (
      await upsert(RentalInvoice, { tenantId, invoiceNumber: invNum }, {
        rentalId: rental._id,
        customerId: rental.customerId,
        type: invType,
        lines: rental.lines,
        totals: {
          preTaxPaise: rental.preTaxSubtotalPaise,
          gstPaise: rental.bookedGstPaise,
          grossPaise: rental.chargeGrossPaise,
          lateFeePaise: rental.lateFeePaise,
        },
        depositSummary: { heldPaise: rental.depositLiabilityPaise, collectedPaise: rental.depositCollectedPaise },
        status: "issued",
        issuedAt: rental.startAt || new Date(),
      })
    ).doc;
    if (!rental.invoiceIds?.some((id) => String(id) === String(invoice._id))) {
      rental.invoiceIds = [...(rental.invoiceIds || []), invoice._id];
      await rental.save();
    }

    if (paid && rental.paymentsPaise > 0) {
      await upsert(
        RentalPayment,
        { tenantId, rentalId: rental._id, reference: `SEED-PAY-${rentalNumber}` },
        {
          direction: PAYMENT_DIRECTION.CHARGE,
          method: "cash",
          amountPaise: rental.paymentsPaise,
          allocation: {
            chargePaise: Math.max(0, rental.paymentsPaise - (rental.depositCollectedPaise || 0)),
            depositPaise: rental.depositCollectedPaise || 0,
          },
          status: "captured",
          verifiedAt: rental.startAt || new Date(),
          reason: "Seed demo payment",
        }
      );
    }
    if (rental.depositCollectedPaise > 0) {
      await upsert(
        RentalDepositEntry,
        { tenantId, rentalId: rental._id, idempotencyKey: `seed-dep-collect-${rentalNumber}`, eventType: DEPOSIT_EVENT.COLLECTED },
        {
          amountPaise: rental.depositCollectedPaise,
          state: "posted",
          reason: "Seed deposit collect",
          actorId: "seed",
          createdAt: rental.startAt || new Date(),
        }
      );
    }
    if (rental.depositRefundsCompletedPaise > 0) {
      await upsert(
        RentalDepositEntry,
        { tenantId, rentalId: rental._id, idempotencyKey: `seed-dep-refund-${rentalNumber}`, eventType: DEPOSIT_EVENT.REFUND_COMPLETED },
        {
          amountPaise: rental.depositRefundsCompletedPaise,
          state: "posted",
          reason: "Seed deposit refund",
          actorId: "seed",
          createdAt: rental.actualReturnedAt || new Date(),
        }
      );
    }
  }

  // Mock delivery shipments for today's list + tracking timeline on detail
  const now = Date.now();
  const isoHoursAgo = (h) => new Date(now - h * 3600 * 1000).toISOString();

  const dispatchRental = rentalDocs["R-DEMO-DISPATCH"];
  if (dispatchRental) {
    await upsert(
      RentalShipment,
      { tenantId, rentalId: dispatchRental._id, leg: SHIPMENT_LEG.OUTBOUND, generation: 1 },
      {
        provider: PROVIDERS.MOCK,
        status: SHIPMENT_STATUS.BOOKED,
        providerOrderId: `SEED-SHIP-${dispatchRental.rentalNumber}`,
        metadata: {
          mock: true,
          message: "We'll deliver to you in 4–5 days",
          estimatedMinDays: 4,
          estimatedMaxDays: 5,
          tracking: [
            { code: "booked", label: "Delivery scheduled", at: isoHoursAgo(2), done: true },
            { code: "courier_assigned", label: "Courier assigned", at: null, done: false },
            { code: "picked_up", label: "Picked up from warehouse", at: null, done: false },
            { code: "in_transit", label: "Out for delivery", at: null, done: false },
            { code: "delivered", label: "Delivered to customer", at: null, done: false },
          ],
        },
        attempts: 0,
      }
    );
  }

  const onwayRental = rentalDocs["R-DEMO-ONWAY"];
  if (onwayRental) {
    await upsert(
      RentalShipment,
      { tenantId, rentalId: onwayRental._id, leg: SHIPMENT_LEG.OUTBOUND, generation: 1 },
      {
        provider: PROVIDERS.MOCK,
        status: SHIPMENT_STATUS.IN_TRANSIT,
        providerOrderId: `SEED-SHIP-${onwayRental.rentalNumber}`,
        rawStatus: "mock_out_for_delivery",
        metadata: {
          mock: true,
          message: "Courier en route — ETA today",
          estimatedMinDays: 0,
          estimatedMaxDays: 1,
          tracking: [
            { code: "booked", label: "Delivery scheduled", at: isoHoursAgo(30), done: true },
            { code: "courier_assigned", label: "Courier assigned", at: isoHoursAgo(28), done: true },
            { code: "picked_up", label: "Picked up from warehouse", at: isoHoursAgo(8), done: true },
            { code: "in_transit", label: "Out for delivery", at: isoHoursAgo(1), done: true },
            { code: "delivered", label: "Delivered to customer", at: null, done: false },
          ],
        },
        attempts: 0,
      }
    );
    await RentalOrder.updateOne(
      { _id: onwayRental._id },
      { $set: { "fulfillment.shipmentId": String((await RentalShipment.findOne({ tenantId, rentalId: onwayRental._id }).select("_id").lean())?._id || "") } }
    );
  }

  const counts = {
    categories: await RentalCategory.countDocuments({ tenantId }),
    products: await RentalProduct.countDocuments({ tenantId }),
    variants: await RentalVariant.countDocuments({ tenantId }),
    assets: await RentalAsset.countDocuments({ tenantId }),
    taxCodes: await RentalTaxCode.countDocuments({ tenantId }),
    commercialRules: await RentalCommercialPolicyVersion.countDocuments({ tenantId }),
    rateEntries: await RentalRateEntry.countDocuments({ tenantId }),
    customers: await RentalCustomer.countDocuments({ tenantId }),
    rentals: await RentalOrder.countDocuments({ tenantId }),
    invoices: await RentalInvoice.countDocuments({ tenantId }),
    payments: await RentalPayment.countDocuments({ tenantId }),
    deposits: await RentalDepositEntry.countDocuments({ tenantId }),
    shipments: await RentalShipment.countDocuments({ tenantId }),
  };

  console.log("\n=== Rental seed complete ===");
  console.log("Tenant slug :", SLUG, `(${tenantId})`);
  console.log("Catalog     :", counts.products, "products across", counts.categories, "categories,", assetCount, "asset slots");
  console.log("DB counts   :", counts);
  console.log("\nAdmin login (master-admin):");
  console.log(`  email: ${DEMO_ADMIN_EMAIL}        password: ${DEMO_ADMIN_PASSWORD}`);
  console.log(`  email: ${ADMIN_EMAIL}        password: ${ADMIN_PASSWORD}`);
  console.log(`  email: ${ADMIN2_EMAIL}  password: ${ADMIN2_PASSWORD}`);
  console.log("\nPortal customers (password Customer@1234 unless noted):");
  console.log(`  ${CUSTOMER_EMAIL}`);
  console.log(`  ${CUSTOMER2_EMAIL}`);
  console.log(`  ${ADMIN_EMAIL} / ${ADMIN2_EMAIL} (same password as admin — portal + dues)`);
  console.log("\nDues rentals (master final invoices):");
  console.log("  R-DUE-OVERDUE  → CUST-ADMIN-1 (nu702870) — overdue balance");
  console.log("  R-DUE-INSPECT  → CUST-ADMIN-2 (solankitrushen) — inspection + balance");
  console.log("  R-DUE-CLOSED   → CUST-ADMIN-1 — closed shortfall (Settle balance)");
  console.log("\nDemo rentals: R-DEMO-* lifecycle set. Bulk overdue:", BULK_OVERDUE_COUNT, "rows.");

  await disconnectDB();
  void mongoose;
}

run().catch((err) => {
  console.error("Rental seed failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});

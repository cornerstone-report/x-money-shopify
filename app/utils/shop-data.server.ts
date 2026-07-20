import prisma from "../db.server";

export interface ShopDataWipeResult {
  pendingPaymentsDeleted: number;
  shopSettingsDeleted: number;
  sessionsDeleted: number;
}

/**
 * Hard-delete all app data for a shop.
 * Used by app/uninstalled and shop/redact.
 *
 * Explicit deletes (not soft):
 * - PendingXMoneyPayment (all rows for shop)
 * - ShopSettings (shop row)
 * - Session (all OAuth sessions for shop)
 *
 * Leave nothing behind when the merchant leaves.
 */
export async function deleteAllShopData(shop: string): Promise<ShopDataWipeResult> {
  if (!shop) {
    return {
      pendingPaymentsDeleted: 0,
      shopSettingsDeleted: 0,
      sessionsDeleted: 0,
    };
  }

  const [pending, settings, sessions] = await prisma.$transaction([
    prisma.pendingXMoneyPayment.deleteMany({ where: { shop } }),
    prisma.shopSettings.deleteMany({ where: { shop } }),
    prisma.session.deleteMany({ where: { shop } }),
  ]);

  return {
    pendingPaymentsDeleted: pending.count,
    shopSettingsDeleted: settings.count,
    sessionsDeleted: sessions.count,
  };
}

export async function getOrCreateShopSettings(shop: string) {
  return prisma.shopSettings.upsert({
    where: { shop },
    create: { shop, xHandle: "" },
    update: {},
  });
}

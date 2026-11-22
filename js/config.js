// Public app settings. The Supabase publishable key is safe to ship in the browser:
// row level security in supabase/schema.sql keeps every user's data private.
export const CONFIG = {
  SUPABASE_URL: 'https://nxrztobdqwhopzvkprku.supabase.co',
  SUPABASE_KEY: 'sb_publishable_nnOXDIawoeZWcY4eI_nPYA_Dg7L_qj3',
  STORAGE_BUCKET: 'videos',
  GUEST_CREDITS: 10,
  SIGNUP_CREDITS: 30,
  COSTS: { text: 1, image: 1, avatar: 2 },
  // Shown on the "Plans & credits" screen. Plan prices and the support WhatsApp are read from
  // Platform settings on the admin page when available; these are the fallbacks.
  PRICING: {
    currency: 'FCFA',
    weekly: 1000,
    tiers: {
      basic: { name: 'Starter', users: 1, monthly: 2500, yearly: 25000 },
      pro: { name: 'Pro', users: 3, monthly: 5000, yearly: 50000 },
      business: { name: 'Studio', users: 10, monthly: 12000, yearly: 120000 },
    },
    packs: [
      { credits: 50, price: 1000 },
      { credits: 200, price: 3000, best: true },
      { credits: 600, price: 7500 },
    ],
    payMethods: 'Airtel Money or MTN MoMo',
  },
};

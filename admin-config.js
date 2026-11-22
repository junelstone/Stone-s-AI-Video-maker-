// Admin page settings. The two Supabase values are public by design:
// the data is protected by the rules in supabase/migrations/002_admin_platform.sql.
window.ADMIN_CONFIG = {
  supabaseUrl: "https://nxrztobdqwhopzvkprku.supabase.co",
  supabaseKey: "sb_publishable_nnOXDIawoeZWcY4eI_nPYA_Dg7L_qj3",
  appName: "Stone's AI Video",
  appUrl: "",                                   // the app is in the same folder as admin.html
  unit: { one: "Subscriber", many: "Subscribers" },
  roles: { owner: "Owner", manager: "Editor", staff: "Member" }, // keys must match the SQL
  tiers: { basic: "Starter", pro: "Pro", business: "Studio" },    // keys must match the SQL
  defaultTier: "pro",
  phoneHint: "+242…",
  payMethods: ["Mobile money", "Airtel Money", "MTN MoMo", "Cash", "Bank transfer", "Card", "Free / gift"],
  logo: "assets/favicon.svg"
};

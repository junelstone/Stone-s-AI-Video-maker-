// Public app settings. The Supabase publishable key is safe to ship in the browser:
// row level security in supabase/schema.sql keeps every user's data private.
export const CONFIG = {
  SUPABASE_URL: 'https://nxrztobdqwhopzvkprku.supabase.co',
  SUPABASE_KEY: 'sb_publishable_nnOXDIawoeZWcY4eI_nPYA_Dg7L_qj3',
  STORAGE_BUCKET: 'videos',
  GUEST_CREDITS: 10,
  SIGNUP_CREDITS: 30,
  COSTS: { text: 1, image: 1, avatar: 2 },
};

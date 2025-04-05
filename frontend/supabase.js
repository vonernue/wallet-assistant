import { createClient } from "@supabase/supabase-js";

export const supabase = createClient("https://blruwtnmtgwpevzefzhq.supabase.co", process.env.SUPABASE_KEY);
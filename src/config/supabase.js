import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zephynezarjsxzselozi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplcGh5bmV6YXJqc3h6c2Vsb3ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NTY1NzAsImV4cCI6MjA4NTUzMjU3MH0.2sJi8n2keFXWktDtEEO4yxKO8NsQZwtBpVe3Kihk8bM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://zcndhfpuplztjsoaybbp.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjbmRoZnB1cGx6dGpzb2F5YmJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMjM1NTksImV4cCI6MjA4ODc5OTU1OX0.Q1zOV05Z4wM7dKKiEVgUgc90Sl8xvAekUh9LgAE5zv8'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

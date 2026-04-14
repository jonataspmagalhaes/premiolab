-- Migration: Add profile fields for complete registration
-- Run this in Supabase SQL Editor

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pais TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cidade TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sexo TEXT DEFAULT '';

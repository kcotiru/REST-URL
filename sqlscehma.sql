-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.bars (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL,
  song_id uuid NOT NULL,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  bar_order integer NOT NULL,
  chords ARRAY,
  repeat_count integer DEFAULT 1,
  starts_new_line boolean DEFAULT false,
  CONSTRAINT bars_pkey PRIMARY KEY (id),
  CONSTRAINT bars_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id),
  CONSTRAINT bars_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.songs(id),
  CONSTRAINT bars_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id)
);
CREATE TABLE public.sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  order_index integer NOT NULL,
  CONSTRAINT sections_pkey PRIMARY KEY (id),
  CONSTRAINT sections_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.songs(id),
  CONSTRAINT sections_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id)
);
CREATE TABLE public.songs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  artist text,
  time_sig_num integer DEFAULT 4 CHECK (time_sig_num > 0),
  time_sig_den integer DEFAULT 4 CHECK (time_sig_den = ANY (ARRAY[2, 4, 8, 16])),
  original_key character varying CHECK (original_key::text ~ '^[A-G][b#]?[m]?$'::text),
  bpm integer CHECK (bpm > 0 AND bpm <= 999),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT songs_pkey PRIMARY KEY (id),
  CONSTRAINT songs_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_song_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  song_id uuid NOT NULL,
  transposed_key character varying CHECK (transposed_key::text ~ '^[A-G][b#]?[m]?$'::text),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_song_preferences_pkey PRIMARY KEY (id),
  CONSTRAINT user_song_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_song_preferences_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.songs(id)
);

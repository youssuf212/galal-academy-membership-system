-- Create members table
CREATE TABLE public.members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    youtube_handle TEXT UNIQUE NOT NULL,
    tier TEXT NOT NULL DEFAULT 'Standard',
    status TEXT NOT NULL DEFAULT 'active',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    day_29_sent BOOLEAN DEFAULT FALSE,
    day_32_sent BOOLEAN DEFAULT FALSE
);

-- Create verifications table
CREATE TABLE public.verifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    youtube_handle TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Note: Since the App pulls members from Supabase client natively without auth rules right now,
-- ensure your Row Level Security (RLS) is disabled for these tables on the new dashboard, 
-- or write appropriate anon policies for select/insert.

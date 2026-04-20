-- =====================================================================
-- Home Inventory Catalog - Chat Assistant Migration
-- Persisted conversations with the AI chat agent. Stores Anthropic-style
-- content blocks (text + tool_use + tool_result) verbatim so we can
-- replay them into the API exactly. Write actions go through a separate
-- chat_actions table that records propose -> approve/reject -> applied.
-- Idempotent. Safe to run after 0001 + 0002 + 0003.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------
create table if not exists public.chat_conversations (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    created_by uuid not null references auth.users(id) on delete cascade,
    title text,
    last_message_at timestamptz,
    message_count int not null default 0,
    archived_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_chat_conversations_household
    on public.chat_conversations (household_id, archived_at, last_message_at desc);

-- ---------------------------------------------------------------------
-- Messages
-- content_blocks is a JSONB array of Anthropic content blocks:
--   [ { type: 'text', text: '...' },
--     { type: 'tool_use', id: '...', name: '...', input: {...} },
--     { type: 'tool_result', tool_use_id: '...', content: '...', is_error: bool },
--     { type: 'image', source: {...} } ]
-- This lets us round-trip the conversation into the API verbatim.
-- ---------------------------------------------------------------------
create table if not exists public.chat_messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
    role text not null check (role in ('user', 'assistant')),
    content_blocks jsonb not null default '[]'::jsonb,
    -- Convenience: a public URL to a user-attached image, when applicable.
    -- The image is also represented inside content_blocks for replay.
    image_url text,
    -- Token usage (filled for assistant messages when the API returns it)
    input_tokens int,
    output_tokens int,
    created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_conversation
    on public.chat_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------
-- Actions (proposed write tool calls awaiting user approval).
-- One row per write tool_use that the agent emits. Until status moves
-- to 'applied' the corresponding mutation has NOT happened.
-- ---------------------------------------------------------------------
create table if not exists public.chat_actions (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
    -- The assistant message that contained the tool_use block.
    message_id uuid not null references public.chat_messages(id) on delete cascade,
    -- The tool_use_id from the Anthropic block, so we can later post a
    -- matching tool_result back to the API.
    tool_use_id text not null,
    tool_name text not null,
    tool_input jsonb not null,
    status text not null default 'proposed'
        check (status in ('proposed', 'approved', 'rejected', 'applied', 'failed')),
    -- Result of the tool execution (when applied) or rejection note.
    result jsonb,
    error_text text,
    -- Audit
    proposed_at timestamptz not null default now(),
    decided_at timestamptz,
    decided_by uuid references auth.users(id) on delete set null,
    applied_at timestamptz
);

create index if not exists idx_chat_actions_conversation
    on public.chat_actions (conversation_id, proposed_at);
create index if not exists idx_chat_actions_message
    on public.chat_actions (message_id);

-- ---------------------------------------------------------------------
-- updated_at trigger reuse
-- ---------------------------------------------------------------------
do $$
begin
    if exists (select 1 from pg_proc where proname = 'set_updated_at') then
        execute 'drop trigger if exists set_updated_at_chat_conversations on public.chat_conversations';
        execute 'create trigger set_updated_at_chat_conversations
            before update on public.chat_conversations
            for each row execute function public.set_updated_at()';
    end if;
end $$;

-- ---------------------------------------------------------------------
-- RLS - same household-scoped pattern as the rest of the schema.
-- ---------------------------------------------------------------------
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_actions enable row level security;

-- Conversations: any household member can read. Only the creator (or
-- household owners) can mutate. Inserts must be by the creator.
drop policy if exists "chat_conversations_select" on public.chat_conversations;
create policy "chat_conversations_select" on public.chat_conversations
    for select using (
        household_id in (
            select household_id from public.household_members where user_id = auth.uid()
        )
    );

drop policy if exists "chat_conversations_insert" on public.chat_conversations;
create policy "chat_conversations_insert" on public.chat_conversations
    for insert with check (
        household_id in (
            select household_id from public.household_members where user_id = auth.uid()
        )
        and created_by = auth.uid()
    );

drop policy if exists "chat_conversations_update" on public.chat_conversations;
create policy "chat_conversations_update" on public.chat_conversations
    for update using (
        household_id in (
            select household_id from public.household_members where user_id = auth.uid()
        )
        and (
            created_by = auth.uid()
            or exists (
                select 1 from public.household_members
                where household_id = public.chat_conversations.household_id
                  and user_id = auth.uid() and role = 'owner'
            )
        )
    );

drop policy if exists "chat_conversations_delete" on public.chat_conversations;
create policy "chat_conversations_delete" on public.chat_conversations
    for delete using (
        household_id in (
            select household_id from public.household_members where user_id = auth.uid()
        )
        and (
            created_by = auth.uid()
            or exists (
                select 1 from public.household_members
                where household_id = public.chat_conversations.household_id
                  and user_id = auth.uid() and role = 'owner'
            )
        )
    );

-- Messages + actions: read-through via conversation membership.
-- Inserts/updates here are gated server-side via the service role on the
-- API path, so we only need the SELECT policy to render the UI.
drop policy if exists "chat_messages_select" on public.chat_messages;
create policy "chat_messages_select" on public.chat_messages
    for select using (
        conversation_id in (
            select id from public.chat_conversations
            where household_id in (
                select household_id from public.household_members where user_id = auth.uid()
            )
        )
    );

drop policy if exists "chat_messages_insert" on public.chat_messages;
create policy "chat_messages_insert" on public.chat_messages
    for insert with check (
        conversation_id in (
            select id from public.chat_conversations
            where household_id in (
                select household_id from public.household_members where user_id = auth.uid()
            )
        )
    );

drop policy if exists "chat_actions_select" on public.chat_actions;
create policy "chat_actions_select" on public.chat_actions
    for select using (
        conversation_id in (
            select id from public.chat_conversations
            where household_id in (
                select household_id from public.household_members where user_id = auth.uid()
            )
        )
    );

drop policy if exists "chat_actions_insert" on public.chat_actions;
create policy "chat_actions_insert" on public.chat_actions
    for insert with check (
        conversation_id in (
            select id from public.chat_conversations
            where household_id in (
                select household_id from public.household_members where user_id = auth.uid()
            )
        )
    );

drop policy if exists "chat_actions_update" on public.chat_actions;
create policy "chat_actions_update" on public.chat_actions
    for update using (
        conversation_id in (
            select id from public.chat_conversations
            where household_id in (
                select household_id from public.household_members where user_id = auth.uid()
            )
        )
    );

-- ---------------------------------------------------------------------
-- Storage bucket for user-attached images in chat (private; signed URLs).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', false)
on conflict (id) do nothing;

-- Reuse the same path convention as other buckets: <household_id>/<...>/file.
drop policy if exists "chat_images_read" on storage.objects;
create policy "chat_images_read" on storage.objects for select
    using (
        bucket_id = 'chat-images'
        and (split_part(name, '/', 1))::uuid in (select public.user_household_ids())
    );

drop policy if exists "chat_images_write" on storage.objects;
create policy "chat_images_write" on storage.objects for insert
    with check (
        bucket_id = 'chat-images'
        and (split_part(name, '/', 1))::uuid in (select public.user_household_ids())
    );

drop policy if exists "chat_images_delete" on storage.objects;
create policy "chat_images_delete" on storage.objects for delete
    using (
        bucket_id = 'chat-images'
        and (split_part(name, '/', 1))::uuid in (select public.user_household_ids())
    );

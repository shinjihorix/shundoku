create table if not exists book_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text,
  summary text not null,
  image_count int default 1,
  created_at timestamptz default now()
);

create index if not exists book_summaries_user_id_created_at_idx
  on book_summaries (user_id, created_at desc);

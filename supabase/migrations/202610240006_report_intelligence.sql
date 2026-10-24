-- Authenticated, atomic per-user AI budget. No photos or descriptions stored here.
begin;
create table civic_private.report_analysis_usage(
 user_id uuid primary key references auth.users(id) on delete cascade,
 period date not null,
 requests integer not null check(requests between 1 and 20),
 last_request_at timestamptz not null
);
alter table civic_private.report_analysis_usage enable row level security;
revoke all on civic_private.report_analysis_usage from public,anon,authenticated;
create function public.reserve_report_analysis() returns void language plpgsql security definer set search_path='' as $$
declare allowed uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 insert into civic_private.report_analysis_usage(user_id,period,requests,last_request_at)
 values(auth.uid(),(now() at time zone 'UTC')::date,1,clock_timestamp())
 on conflict(user_id) do update set
 period=excluded.period,
 requests=case when report_analysis_usage.period<>excluded.period then 1 else report_analysis_usage.requests+1 end,
 last_request_at=excluded.last_request_at
 where (report_analysis_usage.period<>excluded.period or report_analysis_usage.requests<20)
 and report_analysis_usage.last_request_at<=clock_timestamp()-interval '3 seconds'
 returning user_id into allowed;
 if allowed is null then raise exception 'Analysis limit reached. Wait before retrying; daily limit is 20.' using errcode='P0001';end if;
end $$;
revoke all on function public.reserve_report_analysis() from public,anon;
grant execute on function public.reserve_report_analysis() to authenticated;
commit;

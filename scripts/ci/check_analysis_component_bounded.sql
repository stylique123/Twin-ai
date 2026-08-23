-- THE ANALYSIS NAMESPACE IS BOUNDED BY A CONSTRAINT, NOT BY A COUNT.
--
-- ⚠️ WHAT THIS REPLACES, AND WHY. phase3's K1 asserted the same property by
-- COUNTING rows whose component fell outside the sanctioned six:
--
--     .select('id', { count: 'exact', head: true })
--     .not('component', 'in', '("inspection","speech",...)')
--
-- Measured on staging 2026-08-23: media_analyses is 51,318 rows / 87 MB, the
-- NOT IN filter cannot use either component index, and the seq scan timed at
-- 2,755 ms idle and 5,709 ms while a matrix was running -- against the 8s
-- statement_timeout the API role inherits from `authenticator`. Three matrix
-- runs died there (#467, #468, #474), each reporting an EMPTY error because
-- count assertions use head:true and PostgREST returns no body to parse.
--
-- ⚖️ AND THE CONSTRAINT IS STRICTLY STRONGER THAN THE COUNT IT REPLACES.
-- A count proves no violating row existed at the instant it ran. A VALIDATED
-- CHECK proves none can exist -- every existing row was verified when it was
-- added, and every future insert is refused. Moving the assertion here is not
-- a weakening for the sake of CI time; it upgrades "none right now" to "none,
-- ever, by construction".
--
-- ⚠️ convalidated IS CHECKED EXPLICITLY. A constraint added NOT VALID enforces
-- new rows while silently exempting every row already present, which is the
-- one shape that would let this pass while the property was false.
--
-- ⚠️ AND THE DEFINITION IS COMPARED, NOT JUST ITS PRESENCE. A constraint that
-- still exists but has been widened to admit a seventh component would satisfy
-- an existence check and falsify the property. Adding a component is a real
-- change that must fail here loudly -- phase3's own comment already records
-- that the component list lives in three places, and this is the fourth.
do $$
declare
  actual   text;
  valid    boolean;
  expected text := 'CHECK ((component = ANY (ARRAY[''inspection''::text, ''speech''::text, ''visual''::text, ''audio''::text, ''hook''::text, ''alignment''::text])))';
begin
  select pg_get_constraintdef(oid), convalidated
    into actual, valid
    from pg_constraint
   where conrelid = 'public.media_analyses'::regclass
     and conname  = 'media_analyses_component_bounded';

  if actual is null then
    raise exception
      'media_analyses_component_bounded is MISSING. The analysis namespace is unbounded: any component string would be accepted, and nothing downstream would notice until a stage read a kind it had never heard of.';
  end if;

  if not valid then
    raise exception
      'media_analyses_component_bounded exists but is NOT VALIDATED. It refuses new violations while exempting every row already present, so the property it appears to guarantee does not hold for the existing table.';
  end if;

  -- Whitespace is normalised before comparing so a harmless reformat by a
  -- future Postgres does not read as a widened namespace. Everything else --
  -- the component list, its order, the cast types -- must match exactly.
  if regexp_replace(actual, '\s+', ' ', 'g') <> regexp_replace(expected, '\s+', ' ', 'g') then
    raise exception
      'media_analyses_component_bounded does not bound the namespace to the six sanctioned components.%  expected: %%  actual:   %',
      chr(10), expected, chr(10), actual;
  end if;

  raise notice 'media_analyses_component_bounded: present, validated, exactly the six sanctioned components';
end $$;

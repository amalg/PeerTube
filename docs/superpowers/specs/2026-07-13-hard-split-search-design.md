# Hard Split Search Method - Design

Date: 2026-07-13
Status: Implemented

## Problem

Local search uses PostgreSQL trigram similarity (`pg_trgm` `word_similarity`
with a 0.40 threshold) of the whole query string against titles (and
descriptions when extended search is enabled). Each additional search term adds
trigrams to the query, so a result matching only one of the terms can still
clear the threshold. Multi-term searches therefore EXPAND results instead of
narrowing them - OR-like behavior where users expect AND.

## Decision

Add an instance-wide search method setting with two values:

- `default` - existing behavior, unchanged: fuzzy trigram matching against the
  whole search string.
- `hard-split` - split the search into whitespace-separated words; a video or
  playlist matches only if EVERY word appears (case- and accent-insensitive
  substring match) in its title or its description.

## Details

- Config key `search.search_method` (`'default' | 'hard-split'`), default
  `'default'`. Editable in the admin UI (Configuration -> General -> Search)
  as a select, persisted through the standard custom-config API.
- In hard-split mode descriptions are always searched, regardless of the
  `search.extended_search.enabled` toggle (that toggle only affects the
  default method).
- Ranking in hard-split mode still uses trigram similarity of the whole query
  (title match weighted 1.0, description match 0.5) so full-phrase matches
  sort first; the split terms only control WHICH rows match.
- Matching uses `LIKE` on `lower(immutable_unaccent(...))` per term, i.e.
  substring semantics: the term `alph` matches the word `alpha`. Terms match
  independently across fields (one term may match the title, another the
  description).
- The existing exact-tag and UUID escape hatches in video search are kept
  as-is (they OR into the match set in both modes).
- Applies to local video search, playlist search, and the user library
  (my-videos) search, mirroring the extended-search wiring.
- Federation/search-index paths are unaffected: the setting only changes the
  local SQL query builders.

## Alternatives considered

- Raising the trigram threshold: narrows results but stays fuzzy and cannot
  guarantee every term is present; also degrades single-term search.
- Per-request query syntax (quotes, +term): more flexible but a much larger
  surface (client parsing, API contract); an instance-wide toggle covers the
  actual need on a single-admin instance.

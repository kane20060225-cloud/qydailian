-- Remove only the retired league domain, children before referenced parents.
-- Apply only after a verified database backup and removal of league runtime code.
DROP TABLE IF EXISTS league_scores;
DROP TABLE IF EXISTS league_points_rules;
DROP TABLE IF EXISTS league_seasons;
DROP TABLE IF EXISTS league_teams;
DROP TABLE IF EXISTS league_news;

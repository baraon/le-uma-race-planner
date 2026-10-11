-- 0002_user_timezone_nullable: NULL means "not chosen yet", so the web app can send the
-- browser's detected zone on first login without overwriting someone who picked UTC.
ALTER TABLE users ALTER COLUMN timezone DROP DEFAULT;
ALTER TABLE users ALTER COLUMN timezone DROP NOT NULL;

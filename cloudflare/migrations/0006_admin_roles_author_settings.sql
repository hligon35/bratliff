PRAGMA foreign_keys=OFF;

CREATE TABLE admins_new (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('owner', 'developer', 'manager')),
  display_name TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL DEFAULT '',
  avatar_key TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO admins_new (email, role, display_name, full_name, avatar_key, avatar_url, created_at, updated_at)
SELECT email,
  CASE role WHEN 'owner' THEN 'owner' WHEN 'editor' THEN 'developer' ELSE 'manager' END,
  display_name, display_name, '', '', created_at, updated_at
FROM admins;

DROP TABLE admins;
ALTER TABLE admins_new RENAME TO admins;

ALTER TABLE authors ADD COLUMN book_image_key TEXT NOT NULL DEFAULT '';
ALTER TABLE authors ADD COLUMN book_image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE authors ADD COLUMN book_image_alt TEXT NOT NULL DEFAULT '';

PRAGMA foreign_keys=ON;

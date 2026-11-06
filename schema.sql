-- UK Law index: one row per law, as in index/laws.csv of github.com/flaviohtavares/uk-law.
CREATE TABLE IF NOT EXISTS laws (
  rid INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type TEXT NOT NULL,
  year TEXT,
  number TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  extent TEXT,
  topics TEXT,
  path TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS laws_type ON laws(type);
CREATE VIRTUAL TABLE IF NOT EXISTS laws_fts USING fts5(title, topics, content='laws', content_rowid='rid', tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER IF NOT EXISTS laws_ai AFTER INSERT ON laws BEGIN
  INSERT INTO laws_fts(rowid, title, topics) VALUES (new.rid, new.title, new.topics);
END;
CREATE TRIGGER IF NOT EXISTS laws_ad AFTER DELETE ON laws BEGIN
  INSERT INTO laws_fts(laws_fts, rowid, title, topics) VALUES ('delete', old.rid, old.title, old.topics);
END;
CREATE TRIGGER IF NOT EXISTS laws_au AFTER UPDATE ON laws BEGIN
  INSERT INTO laws_fts(laws_fts, rowid, title, topics) VALUES ('delete', old.rid, old.title, old.topics);
  INSERT INTO laws_fts(rowid, title, topics) VALUES (new.rid, new.title, new.topics);
END;

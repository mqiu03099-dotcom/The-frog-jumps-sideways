CREATE TABLE IF NOT EXISTS players (
  openid TEXT PRIMARY KEY,
  nickname TEXT NOT NULL DEFAULT '',
  best_score INTEGER NOT NULL DEFAULT 0,
  -- 达成当前最高分的时刻，同分时早达成的排前面
  best_at INTEGER NOT NULL
);

-- 榜单排序和名次统计都走这个索引；字段顺序必须与 ORDER BY 完全一致
-- 末尾带 nickname 是为了让榜单查询只读索引就够，不用回表
CREATE INDEX IF NOT EXISTS players_rank ON players (best_score DESC, best_at ASC, openid ASC, nickname);

-- 名次直方图：单行 JSON，{ "分数": 人数 }；每次破纪录只写这一行
-- shortcut: 单行 JSON 有 1MB 上限（约 10 万种不同分数），到量再改回分桶表
CREATE TABLE IF NOT EXISTS score_stats (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  histogram TEXT NOT NULL DEFAULT '{}'
);

INSERT OR IGNORE INTO score_stats (id, histogram) VALUES (1, '{}');

CREATE TRIGGER IF NOT EXISTS score_stats_insert AFTER INSERT ON players
WHEN new.best_score > 0
BEGIN
  UPDATE score_stats
     SET histogram = json_set(
       histogram,
       '$."' || new.best_score || '"',
       COALESCE(json_extract(histogram, '$."' || new.best_score || '"'), 0) + 1
     )
   WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS score_stats_update AFTER UPDATE OF best_score ON players
WHEN old.best_score <> new.best_score AND new.best_score > 0
BEGIN
  -- 一条 UPDATE 只算 1 行写；旧分数降到 0 时删掉 key，避免 JSON 只增不减
  UPDATE score_stats
     SET histogram = json_set(
       CASE
         WHEN COALESCE(json_extract(histogram, '$."' || old.best_score || '"'), 0) <= 1
           THEN json_remove(histogram, '$."' || old.best_score || '"')
         ELSE json_set(
           histogram,
           '$."' || old.best_score || '"',
           json_extract(histogram, '$."' || old.best_score || '"') - 1
         )
       END,
       '$."' || new.best_score || '"',
       COALESCE(
         json_extract(
           CASE
             WHEN COALESCE(json_extract(histogram, '$."' || old.best_score || '"'), 0) <= 1
               THEN json_remove(histogram, '$."' || old.best_score || '"')
             ELSE json_set(
               histogram,
               '$."' || old.best_score || '"',
               json_extract(histogram, '$."' || old.best_score || '"') - 1
             )
           END,
           '$."' || new.best_score || '"'
         ),
         0
       ) + 1
     )
   WHERE id = 1;
END;